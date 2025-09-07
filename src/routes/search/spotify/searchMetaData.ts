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

  // Enhanced cleaning for Indian/Nepali content
  const cleanTitle = title
    .replace(
      /\b(official|video|lyric|lyrics|music|mv|hd|4k|hq|audio|latest|full|version|original|bollywood|hindi|nepali|2019|2020|2021|2022|2023|2024|2025)\b/gi,
      ""
    )
    .replace(/[【】\[\]()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Enhanced patterns for Indian/Nepali music
  const patterns = [
    // Kishore Kumar specific pattern
    { regex: /^(kishore kumar)\s*[-–—]?\s*(.+)/i, artistFirst: true },
    // Standard Artist - Song format
    { regex: /^(.+?)\s*[-–—]\s*(.+)/, artistFirst: true },
    // Song by Artist format
    { regex: /^(.+?)\s+by\s+(.+)/i, artistFirst: false },
    // Song | Artist format
    { regex: /^(.+?)\s*\|\s*(.+)/, artistFirst: false },
    // Artist: Song format
    { regex: /^(.+?):\s*(.+)/, artistFirst: true },
    // Movie - Song | Artist format (common in Bollywood)
    { regex: /^(.+?)\s*[-–—]\s*(.+?)\s*\|\s*(.+)/, isThreePart: true },
  ];

  for (const pattern of patterns) {
    const match = cleanTitle.match(pattern.regex);
    if (match) {
      // Handle three-part matches (movie - song | artist)
      if (pattern.isThreePart && match.length === 4) {
        return {
          artist: match[3].trim(),
          song: match[2].trim(),
          mainTitle: match[2].trim(),
        };
      }
      // Handle two-part matches
      else if (match.length === 3) {
        const first = match[1].trim();
        const second = match[2].trim();

        // Validate both parts are substantial
        if (first.length >= 2 && second.length >= 2) {
          if (pattern.artistFirst) {
            return { artist: first, song: second, mainTitle: second };
          } else {
            return { artist: second, song: first, mainTitle: first };
          }
        }
      }
    }
  }

  // For complex titles like "Pillu - Official Video | Sanju Rathod | G-SPXRK"
  // Extract the first meaningful part as the main song name
  const parts = cleanTitle
    .split(/[\|\-]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (parts.length > 1) {
    const mainPart = parts[0];
    // Try to get artist from second part if it looks like an artist name
    const secondPart = parts[1];
    if (
      secondPart &&
      !/official|video|channel|subscribe|like/i.test(secondPart)
    ) {
      return { song: mainPart, artist: secondPart, mainTitle: mainPart };
    }
    return { mainTitle: mainPart };
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

// Build optimized search queries - more lenient approach for regional music
function buildSpotifyQueries(video: YouTubeMetadata): string[] {
  const { artist, song, mainTitle } = extractSongInfo(video.title);
  const cleaned = cleanTitle(video.title);
  const queries: string[] = [];

  // Strategy 1: If we have good artist/song extraction, try structured searches
  if (artist && song && song.length > 2 && artist.length > 2) {
    // Natural language first (most reliable)
    queries.push(`${song} ${artist}`);
    queries.push(`${artist} ${song}`);
    // Then quoted searches
    queries.push(`"${song}" "${artist}"`);
    queries.push(`track:"${song}" artist:"${artist}"`);
  }

  // Strategy 2: Main title focused searches (critical for single-word songs)
  if (mainTitle && mainTitle.length > 1) {
    // Prioritize shorter, cleaner titles
    if (mainTitle.length <= 15) {
      queries.push(`"${mainTitle}"`); // Exact match first
      queries.push(mainTitle); // Then fuzzy
    } else {
      queries.push(mainTitle); // Fuzzy first for longer titles
      queries.push(`"${mainTitle}"`); // Then exact
    }

    // Regional context searches for non-English content
    if (
      /[^\x00-\x7F]/.test(mainTitle) ||
      /mein|hai|ko|ki|ka|se|aasman|badal|yaad|piya|kya|tera|mera|dil|ishq|pyar|saath|zindagi/i.test(
        mainTitle
      )
    ) {
      queries.push(`${mainTitle} bollywood`);
      queries.push(`${mainTitle} hindi`);
      queries.push(`${mainTitle} indian`);
    }
  }

  // Strategy 3: Artist-focused searches
  if (artist && artist.length > 2) {
    queries.push(`artist:"${artist}"`);
    // Add popular artist variations
    if (/kishore/i.test(artist)) {
      queries.push(`kishore kumar`);
      queries.push(`artist:"kishore kumar"`);
    }
  }

  // Strategy 4: Handle multiple songs in title (mashups/compilations)
  const multipleSongs = video.title
    .split(/\|\||&&|--|\s+\|\s+/)
    .map((part) =>
      part
        .trim()
        .replace(
          /\b(official|video|lyric|lyrics|music|mv|hd|4k|hq|audio|latest|song|hindi|english|bollywood|2019|2020|2021|2022|2023|2024|2025|full|version)\b/gi,
          ""
        )
        .trim()
    )
    .filter((part) => part.length > 3 && part.length < 40); // Reasonable length songs

  // Prioritize shorter, cleaner song titles
  const prioritizedSongs = multipleSongs
    .map((part) => ({
      text: part,
      score: calculateQueryPriority(part),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4); // Top 4 most promising

  for (const { text } of prioritizedSongs) {
    if (text.length <= 10) {
      queries.push(`"${text}"`); // Exact for short
    }
    queries.push(text); // Fuzzy search
  }

  // Strategy 5: Main title focused searches (critical for single-word songs)
  if (mainTitle && mainTitle.length > 1) {
    if (mainTitle.length <= 15) {
      queries.push(`"${mainTitle}"`); // Exact match first for short titles
    }
    queries.push(mainTitle);

    // Regional context searches for non-English content
    if (
      /[^\x00-\x7F]/.test(mainTitle) ||
      /mein|hai|ko|ki|ka|se|aasman|badal|yaad|piya|kya|tera|mera|dil|ishq|pyar|saath|zindagi/i.test(
        mainTitle
      )
    ) {
      queries.push(`${mainTitle} bollywood`);
      queries.push(`${mainTitle} hindi`);
      queries.push(`${mainTitle} indian`);
    }
  }

  // Strategy 6: Artist-focused searches
  if (artist && artist.length > 2) {
    queries.push(`artist:"${artist}"`);
    queries.push(artist);

    // Add popular artist variations
    if (/kishore/i.test(artist)) {
      queries.push(`kishore kumar`);
      queries.push(`artist:"kishore kumar"`);
    }
  }

  // Strategy 7: Cleaned title as fallback
  if (cleaned && cleaned.length > 2 && cleaned !== mainTitle) {
    queries.push(cleaned);
  }

  // Strategy 8: Raw title (cleaned) as last resort
  const rawCleaned = video.title
    .replace(/\b(subscribe|like|share|comment|channel)\b/gi, "")
    .trim();
  if (rawCleaned.length > 3) {
    queries.push(rawCleaned);
  }

  // Remove duplicates and empty queries, prioritize shorter queries
  const uniqueQueries = [
    ...new Set(queries.filter((q) => q.trim().length > 1)),
  ];
  return uniqueQueries.sort((a, b) => a.length - b.length); // Shorter queries first
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
  // More lenient for regional/Bollywood songs and shorter titles
  const isRegionalSong =
    /[^\x00-\x7F]/.test(videoTitle) ||
    /bollywood|hindi|punjabi|tamil|telugu|marathi|bengali|gujarati|nepali|kishore|kumar/i.test(
      videoTitle
    );

  const isShortTitle = videoInfo.mainTitle && videoInfo.mainTitle.length <= 10;

  // Adjust minimum similarity based on content type
  let minSimilarity = 0.3; // Default
  if (isRegionalSong) minSimilarity = 0.15; // Very lenient for regional
  if (isShortTitle) minSimilarity = 0.1; // Very lenient for short titles
  if (isRegionalSong && isShortTitle) minSimilarity = 0.05; // Extremely lenient

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
  console.log("🎵 Starting YouTube to Spotify mapping...");
  const results: MappedSong[] = [];

  for (let i = 0; i < metaData.length; i++) {
    const video = metaData[i];
    // Only log every 10 songs to reduce noise
    if (i % 10 === 0 || i === 0) {
      console.log(`\n[${i + 1}/${metaData.length}] Processing batch...`);
    }

    try {
      // Check cache first
      const cacheKey = video.title.toLowerCase().replace(/[^\w]/g, "");

      if (spotifySearchCache.has(cacheKey)) {
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

      // Reduced logging - only for first few or when debugging
      if (i < 3) {
        console.log(`🔍 Trying ${queries.length} queries for "${video.title}"`);
      }

      let bestMatch: SpotifyMatch | null = null;
      let bestScore = 0;

      // Try multiple search queries
      for (const query of queries) {
        if (!query.trim()) continue;

        try {
          // Only log queries for debugging first few songs
          if (i < 3) {
            console.log(`   Query: "${query}"`);
          }
          const response = await axios.get(
            "https://api.spotify.com/v1/search",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                q: query,
                type: "track",
                limit: 20, // Increased for better coverage, especially for regional music
                market: "from_token",
              },
              timeout: 10000, // 10 second timeout
            }
          );

          const tracks = response.data.tracks.items;
          // Only log track count for first few songs
          if (i < 3) {
            console.log(`   Found ${tracks.length} tracks`);
          }

          // Quick filtering and scoring
          for (const track of tracks) {
            const score = calculateSpotifyScore(video, track, videoInfo);

            if (score > bestScore && score > 0.05) {
              // Very low threshold for better recall, especially for regional songs
              bestScore = score;
              bestMatch = {
                title: track.name,
                artists: track.artists.map((a: any) => a.name).join(", "),
                album: track.album.name,
                durationMs: track.duration_ms,
                spotifyUrl: track.external_urls.spotify,
              };

              // Only log for first few songs or very good matches
              if (i < 3 || score > 0.7) {
                console.log(
                  `   🎯 New best: "${track.name}" by ${track.artists
                    .map((a: any) => a.name)
                    .join(", ")} (${score.toFixed(3)})`
                );
              }
            }
          }

          // If we found a good match, stop searching (lowered threshold for regional music)
          if (bestScore > 0.5) {
            if (i < 3) {
              console.log(`   ✨ Good match found, stopping search`);
            }
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
        // Only log successful matches for first few songs
        if (i < 3) {
          console.log(
            `✅ Final match: "${bestMatch.title}" by ${
              bestMatch.artists
            } (score: ${bestScore.toFixed(3)})`
          );
        }
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
