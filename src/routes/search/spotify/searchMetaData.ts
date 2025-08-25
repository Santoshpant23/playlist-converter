// ytToSpotifyMapper.ts
import axios from "axios";

interface YouTubeMetadata {
  title: string;
  videoId: string;
  thumbnail: string;
  channelTitle: string;
  duration: string; // ISO 8601
}

interface SpotifyMatch {
  title: string;
  artists: string;
  album: string;
  durationMs: number;
  spotifyUrl: string;
}

interface MappedSong {
  youTubeMetadata: YouTubeMetadata;
  spotifyMatch: SpotifyMatch | null;
  found: boolean;
}

function parseISODuration(duration: string): number {
  // Supports PT#H#M#S, PT#M#S, PT#S
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = duration.match(regex);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function cleanTitle(title: string): string {
  // Remove common video-specific terms
  return title
    .replace(
      /\s*[\[\(]\s*(official|lyrics|video|audio|hd|4k|music video|full song).*?[\]\)]/gi,
      ""
    )
    .replace(
      /\s*(official|lyrics|video|audio|hd|4k|music video|full song|latest|hindi|english|bollywood|2019|2020|2021|2022|2023|2024|2025)\s*/gi,
      " "
    )
    .replace(
      /\s*-\s*(official|lyrics|video|audio|hd|4k|music video|full song).*$/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractSongInfo(rawTitle: string): {
  artist?: string;
  song?: string;
  mainTitle?: string;
} {
  const title = rawTitle.replace(/\s+/g, " ").trim();

  // Clean common video markers
  const cleanTitle = title
    .replace(/\b(official|video|lyric|lyrics|music|mv|hd|4k|hq|audio)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Try different separators for "Artist - Song" pattern
  const separators = [" - ", " | ", ": ", " – "];

  for (const sep of separators) {
    const idx = cleanTitle.indexOf(sep);
    if (idx > 0) {
      const left = cleanTitle.slice(0, idx).trim();
      const right = cleanTitle.slice(idx + sep.length).trim();

      // Validate both parts are substantial (at least 2 chars)
      if (left.length >= 2 && right.length >= 2) {
        // For "Artist - Song" pattern
        return { artist: left, song: right, mainTitle: right };
      }
    }
  }

  // For complex titles like "Pillu - Official Video | Sanju Rathod | G-SPXRK"
  // Extract the first part as the main song name
  const parts = cleanTitle.split(/[\|\-]/);
  if (parts.length > 1) {
    const mainPart = parts[0].trim();
    if (mainPart.length >= 2) {
      // Try to get artist from second part if available
      const secondPart = parts[1]?.trim();
      if (secondPart && secondPart.length >= 2) {
        return { song: mainPart, artist: secondPart, mainTitle: mainPart };
      }
      return { mainTitle: mainPart };
    }
  }

  // If no pattern found, use the cleaned title
  return { mainTitle: cleanTitle.length >= 2 ? cleanTitle : title };
}

function fuzzyStringSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const aWords = normalize(a)
    .split(" ")
    .filter((w) => w.length > 2);
  const bWords = normalize(b)
    .split(" ")
    .filter((w) => w.length > 2);

  if (aWords.length === 0 || bWords.length === 0) return 0;

  let matches = 0;
  let partialMatches = 0;

  for (const word of aWords) {
    // Exact or contains match
    if (bWords.some((bWord) => bWord.includes(word) || word.includes(bWord))) {
      matches++;
    } else {
      // Fuzzy match for similar words (e.g., "Ratte" vs "Ratate")
      for (const bWord of bWords) {
        if (word.length >= 4 && bWord.length >= 4) {
          const similarity = calculateEditDistance(word, bWord);
          if (similarity >= 0.7) {
            // 70% similarity
            partialMatches += 0.5;
            break;
          }
        }
      }
    }
  }

  return (matches + partialMatches) / Math.max(aWords.length, bWords.length);
}

function calculateEditDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

// Cache for Spotify searches
const spotifySearchCache = new Map<string, SpotifyMatch | null>();

// Calculate query priority - higher score = more likely to find results
function calculateQueryPriority(query: string): number {
  let score = 0;

  // Shorter queries often work better (5-25 chars is sweet spot)
  const length = query.length;
  if (length >= 5 && length <= 25) score += 10;
  else if (length <= 40) score += 5;

  // Common Bollywood/Hindi words that are likely to be findable
  const commonWords =
    /\b(yaad|piya|aane|lagi|tera|mera|hai|mein|ko|ki|ka|se|tum|hum|dil|ishq|pyar|saath|zindagi)\b/i;
  if (commonWords.test(query)) score += 15;

  // Penalize overly complex or noisy titles
  if (query.split(" ").length > 6) score -= 5;
  if (/\d{4}/.test(query)) score -= 3; // Years
  if (/channel|subscribe|like|share|comment/i.test(query)) score -= 10;

  // Bonus for titles that sound like song names
  if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(query)) score += 5; // Title Case

  return score;
}

// Build optimized search queries - balanced approach for better accuracy
function buildSpotifyQueries(video: YouTubeMetadata): string[] {
  const { artist, song, mainTitle } = extractSongInfo(video.title);
  const cleaned = cleanTitle(video.title);
  const queries: string[] = [];

  // Strategy 1: Precise structured search if we have good artist/song extraction
  if (artist && song && song.length > 2 && artist.length > 2) {
    // Only use structured search if both are substantial
    queries.push(`track:"${song}" artist:"${artist}"`);
    queries.push(`"${song}" "${artist}"`); // Exact phrases
  }

  // Strategy 2: Natural language searches (most reliable)
  if (artist && song) {
    queries.push(`${song} ${artist}`);
    queries.push(`${artist} ${song}`);
  }

  // Strategy 3: Handle complex titles with multiple songs (like Bollywood mashups)
  const multipleSongs = video.title
    .split(/\|\||&&|--|\s+\|\s+/)
    .map((part) =>
      part
        .trim()
        .replace(
          /\b(official|video|lyric|lyrics|music|mv|hd|4k|hq|audio|latest|song|hindi|english|2019|2020|2021|2022|2023|2024|2025)\b/gi,
          ""
        )
        .trim()
    )
    .filter((part) => part.length > 4);

  // Smart prioritization: best queries first
  const prioritizedSongs = multipleSongs
    .map((part) => ({
      text: part,
      score: calculateQueryPriority(part),
    }))
    .sort((a, b) => b.score - a.score) // Higher score = better priority
    .slice(0, 3); // Top 3 most promising queries

  // Add prioritized queries (best first)
  for (const { text } of prioritizedSongs) {
    queries.push(`"${text}"`);
    queries.push(text);
  }

  // Strategy 4: Main title only (critical for single-word songs like "Pillu")
  if (mainTitle && mainTitle.length > 1) {
    if (mainTitle.length <= 8) {
      // Short titles get exact search
      queries.push(`"${mainTitle}"`);
    }
    queries.push(mainTitle);

    // Try with common regional search terms for better matching
    if (
      /[^\x00-\x7F]/.test(mainTitle) ||
      /mein|hai|ko|ki|ka|se|aasman|badal|yaad|piya|kya|tera|mera/i.test(
        mainTitle
      )
    ) {
      queries.push(`${mainTitle} bollywood`);
      queries.push(`${mainTitle} hindi song`);
    }
  }

  // Strategy 5: Artist-focused searches if we have artist info
  if (artist && artist.length > 2) {
    queries.push(`artist:"${artist}"`);
    queries.push(artist);
  }

  // Strategy 6: Cleaned title (remove extra info but keep essence)
  if (cleaned && cleaned.length > 2 && cleaned !== mainTitle) {
    queries.push(cleaned);
    queries.push(`"${cleaned}"`);
  }

  // Strategy 7: Raw title as ultimate fallback
  queries.push(video.title);

  // Remove duplicates and empty queries
  return [...new Set(queries.filter((q) => q.trim().length > 1))];
}

// Advanced scoring for YouTube to Spotify matching
function calculateSpotifyScore(
  video: YouTubeMetadata,
  track: any,
  videoInfo: { artist?: string; song?: string; mainTitle?: string }
): number {
  const videoTitle = video.title.toLowerCase();
  const trackName = track.name.toLowerCase();
  const trackArtists = track.artists
    .map((a: any) => a.name.toLowerCase())
    .join(" ");

  // Multi-level title similarity - check all extracted components
  const directTitleSim = fuzzyStringSimilarity(videoTitle, trackName);
  const mainTitleSim = videoInfo.mainTitle
    ? fuzzyStringSimilarity(videoInfo.mainTitle.toLowerCase(), trackName)
    : 0;
  const songTitleSim = videoInfo.song
    ? fuzzyStringSimilarity(videoInfo.song.toLowerCase(), trackName)
    : 0;

  // Use the best title match but weight mainTitle higher for extracted songs
  const bestTitleSim = Math.max(
    directTitleSim * 0.8,
    mainTitleSim * 1.0, // Prefer extracted main title
    songTitleSim * 0.95
  );

  // Require minimum title similarity to prevent false matches
  // More lenient for regional/Bollywood songs
  const isRegionalSong =
    /[^\x00-\x7F]/.test(videoTitle) ||
    /bollywood|hindi|punjabi|tamil|telugu|marathi|bengali|gujarati/i.test(
      videoTitle
    );
  const minSimilarity = isRegionalSong ? 0.2 : 0.3;

  if (bestTitleSim < minSimilarity) {
    return 0; // Reject if title similarity is too low
  }

  // Enhanced artist matching - check multiple artist variations
  let artistScore = 0;
  if (videoInfo.artist) {
    const videoArtist = videoInfo.artist.toLowerCase();
    // Check against all track artists individually
    for (const trackArtist of track.artists) {
      const similarity = fuzzyStringSimilarity(
        videoArtist,
        trackArtist.name.toLowerCase()
      );
      artistScore = Math.max(artistScore, similarity);
    }
  }

  // Smart duration matching with contextual tolerance
  const ytDuration = parseISODuration(video.duration);
  const durationDiff = Math.abs(track.duration_ms - ytDuration);

  // More lenient for longer songs, stricter for short ones
  const toleranceMs = Math.max(120000, ytDuration * 0.3); // Min 2min or 30% of song length
  const durationScore =
    ytDuration > 0 ? Math.max(0, 1 - durationDiff / toleranceMs) : 0.5;

  // Intelligent popularity scoring - prefer popular but not exclusively
  const popularityScore = track.popularity
    ? Math.min(0.15, (track.popularity / 100) * 0.15)
    : 0;

  // Enhanced version detection
  const trackLower = trackName;
  const videoLower = videoTitle;

  const badVersionPenalty =
    /(cover|karaoke|instrumental|remix|acoustic|live|piano)/i.test(
      trackLower
    ) &&
    !/(cover|karaoke|instrumental|remix|acoustic|live|piano)/i.test(videoLower)
      ? 0.3
      : 0;

  // Bonus for exact or near-exact matches
  const exactBonus = bestTitleSim > 0.95 && artistScore > 0.8 ? 0.1 : 0;

  // Penalty for partial word matches (prevent "Say na" matching "Say Something")
  const videoWords = videoTitle
    .split(/\s+/)
    .filter((w: string) => w.length > 2);
  const trackWords = trackName.split(/\s+/).filter((w: string) => w.length > 2);
  const partialWordPenalty =
    videoWords.length > 0 &&
    trackWords.length > 0 &&
    videoWords.length !== trackWords.length &&
    Math.abs(videoWords.length - trackWords.length) > 1
      ? 0.2
      : 0;

  // Final score with balanced weighting
  const finalScore =
    bestTitleSim * 0.45 + // Title match most important
    artistScore * 0.35 + // Artist match crucial for accuracy
    durationScore * 0.12 + // Duration important but flexible
    popularityScore + // Slight popularity bias
    exactBonus - // Reward perfect matches
    badVersionPenalty - // Penalize wrong versions
    partialWordPenalty; // Penalize partial word matches

  return Math.max(0, Math.min(1, finalScore));
}

export async function mapYoutubeToSpotify(
  metaData: YouTubeMetadata[],
  accessToken: string
): Promise<MappedSong[]> {
  console.log("🎵 Starting optimized YouTube to Spotify mapping");
  const results: MappedSong[] = [];

  for (let i = 0; i < metaData.length; i++) {
    const video = metaData[i];
    console.log(`\n[${i + 1}/${metaData.length}] Processing: "${video.title}"`);

    try {
      // Check cache first
      const cacheKey = video.title.toLowerCase().replace(/[^\w]/g, "");

      if (spotifySearchCache.has(cacheKey)) {
        console.log("✨ Using cached result");
        const cachedMatch = spotifySearchCache.get(cacheKey) || null;
        results.push({
          youTubeMetadata: video,
          spotifyMatch: cachedMatch,
          found: !!cachedMatch,
        });
        continue;
      }

      // Extract song information for smart querying
      const videoInfo = extractSongInfo(video.title);
      const queries = buildSpotifyQueries(video);

      console.log(`🔍 Trying ${queries.length} queries for "${video.title}"`);

      let bestMatch: SpotifyMatch | null = null;
      let bestScore = 0;

      // Try multiple search queries
      for (const query of queries) {
        if (!query.trim()) continue;

        try {
          console.log(`   Query: "${query}"`);
          const response = await axios.get(
            "https://api.spotify.com/v1/search",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                q: query,
                type: "track",
                limit: 15, // Optimal balance between speed and accuracy
                market: "from_token",
              },
              timeout: 10000, // 10 second timeout
            }
          );

          const tracks = response.data.tracks.items;
          console.log(`   Found ${tracks.length} tracks`);

          // Quick filtering and scoring
          for (const track of tracks) {
            const score = calculateSpotifyScore(video, track, videoInfo);

            if (score > bestScore && score > 0.2) {
              // Lower threshold for better recall, especially for regional songs
              bestScore = score;
              bestMatch = {
                title: track.name,
                artists: track.artists.map((a: any) => a.name).join(", "),
                album: track.album.name,
                durationMs: track.duration_ms,
                spotifyUrl: track.external_urls.spotify,
              };

              console.log(
                `   🎯 New best: "${track.name}" (${score.toFixed(3)})`
              );
            }
          }

          // If we found a very good match, stop searching
          if (bestScore > 0.7) {
            console.log(`   ✨ Excellent match found, stopping search`);
            break;
          }

          // Small delay between queries
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (e: any) {
          console.error(`   ❌ Query failed: ${e.message}`);
        }
      }

      // Cache the result
      spotifySearchCache.set(cacheKey, bestMatch);

      if (bestMatch) {
        results.push({
          youTubeMetadata: video,
          spotifyMatch: bestMatch,
          found: true,
        });
        console.log(
          `✅ Final match: "${bestMatch.title}" by ${
            bestMatch.artists
          } (score: ${bestScore.toFixed(3)})`
        );
      } else {
        results.push({
          youTubeMetadata: video,
          spotifyMatch: null,
          found: false,
        });
        console.log(`❌ No suitable match found`);
      }
    } catch (e: any) {
      console.error(`❌ Spotify search failed: ${e.message}`);

      // Handle rate limiting
      if (e.response?.status === 429) {
        console.log("⏳ Rate limited, waiting...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      results.push({
        youTubeMetadata: video,
        spotifyMatch: null,
        found: false,
      });
    }

    // Progress update
    const foundSoFar = results.filter((r) => r.found).length;
    console.log(
      `📊 Progress: ${foundSoFar}/${results.length} found (${(
        (foundSoFar / results.length) *
        100
      ).toFixed(1)}%)`
    );
  }

  const finalFound = results.filter((r) => r.found).length;
  console.log(
    `\n🎵 Final: ${finalFound}/${results.length} tracks matched (${(
      (finalFound / results.length) *
      100
    ).toFixed(1)}%)`
  );
  console.log(`💾 Cache size: ${spotifySearchCache.size} entries`);

  return results;
}
