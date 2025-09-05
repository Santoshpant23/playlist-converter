// spotifyToYtMapper.ts
import ytSearch from "yt-search";

interface TrackMetadata {
  title: string;
  artists: string;
  album?: string;
  durationMs?: number;
  duration?: string;
}

interface YouTubeMatch {
  title: string;
  url: string;
  thumbnail: string;
  views: number;
  duration: string;
  channel: string;
}

interface SongMatch {
  spotifyTrack: TrackMetadata;
  youtubeMatch: YouTubeMatch | null;
  found: boolean;
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3)
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyStringSimilarity(a: string, b: string): number {
  const aWords = normalizeString(a)
    .split(" ")
    .filter((w) => w.length > 2);
  const bWords = normalizeString(b)
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
      // Fuzzy match for similar words
      for (const bWord of bWords) {
        if (word.length >= 4 && bWord.length >= 4) {
          const similarity = calculateEditDistance(word, bWord);
          if (similarity >= 0.7) {
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

function isOfficialChannel(channelName: string): boolean {
  const officialIndicators = [
    "official",
    "music",
    "records",
    "vevo",
    "topic",
    "entertainment",
    "films",
    "studios",
    "label",
  ];

  const normalizedChannel = channelName.toLowerCase();
  return officialIndicators.some((indicator) =>
    normalizedChannel.includes(indicator)
  );
}

function calculateViewsScore(views: number): number {
  if (!views || views < 1000) return 0;

  // Logarithmic scoring favoring higher view counts
  // 1M views = 0.4, 10M views = 0.6, 100M views = 0.8
  return Math.min(0.8, Math.log10(views) / 12.5);
}

function hasBadKeywords(title: string, originalTitle: string): boolean {
  const badKeywords = [
    "cover",
    "remix",
    "karaoke",
    "instrumental",
    "acoustic",
    "live",
    "concert",
    "reaction",
    "tutorial",
    "how to",
    "slowed",
    "reverb",
    "lofi",
    "lo-fi",
    "8d",
    "nightcore",
    "bass boosted",
    "trap",
    "phonk",
    "edit",
    "tiktok",
    "shorts",
    "compilation",
    "mashup",
    "vs",
    "battle",
  ];

  const titleLower = title.toLowerCase();
  const originalLower = originalTitle.toLowerCase();

  return badKeywords.some(
    (keyword) =>
      titleLower.includes(keyword) && !originalLower.includes(keyword)
  );
}

// Simple cache to avoid repeated searches with size limit
const MAX_CACHE_SIZE = 1000;
const searchCache = new Map<string, YouTubeMatch | null>();

// Clear cache when it gets too large to prevent memory leaks
function manageCacheSize() {
  if (searchCache.size > MAX_CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) {
      searchCache.delete(firstKey);
    }
  }
}

// Build intelligent search queries for YouTube
function buildYouTubeQueries(track: TrackMetadata): string[] {
  const cleanTitle = track.title
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, "")
    .replace(/[^\w\s'-]/g, "")
    .trim();
  const primaryArtist = track.artists
    .split(",")[0]
    .trim()
    .replace(/[^\w\s'-]/g, "");

  const queries: string[] = [];

  // Strategy 1: High-quality official searches
  queries.push(`${cleanTitle} ${primaryArtist} official`);
  queries.push(`${cleanTitle} ${primaryArtist} music video`);

  // Strategy 2: Natural combinations
  queries.push(`${cleanTitle} ${primaryArtist}`);
  queries.push(`${primaryArtist} ${cleanTitle}`);

  // Strategy 3: Exact phrase search for problematic titles
  const hasSpecialChars = /[^\x00-\x7F]/.test(track.title);
  const isShortTitle = cleanTitle.split(" ").length <= 2;

  if (hasSpecialChars || isShortTitle) {
    queries.unshift(`"${cleanTitle}" ${primaryArtist}`); // Priority for exact search
  }

  // Strategy 4: Include album if it's different and substantial
  if (track.album && track.album !== cleanTitle && track.album.length > 3) {
    queries.push(`${cleanTitle} ${primaryArtist} ${track.album}`);
  }

  return [...new Set(queries.filter((q) => q.trim().length > 3))];
}

// Enhanced scoring focused on accuracy over complexity
function calculateSmartScore(
  track: TrackMetadata,
  video: any,
  cleanTitle: string,
  primaryArtist: string
): number {
  const videoTitle = video.title.toLowerCase();
  const channelName = (video.author?.name || "").toLowerCase();

  // Core similarity scores
  const titleSim = fuzzyStringSimilarity(cleanTitle, video.title);
  const artistInTitle = fuzzyStringSimilarity(primaryArtist, video.title);
  const artistInChannel = fuzzyStringSimilarity(primaryArtist, channelName);

  // Prefer artist match in channel name (most reliable indicator)
  const artistScore = Math.max(artistInTitle * 0.7, artistInChannel);

  // Duration matching - be more lenient for live/extended versions
  const trackMs =
    track.durationMs || (track.duration ? parseDuration(track.duration) : 0);
  const videoMs = parseDuration(video.timestamp);
  const durationDiff = Math.abs(trackMs - videoMs);
  const durationScore =
    trackMs > 0 ? Math.max(0, 1 - durationDiff / 180000) : 0.6; // 3min tolerance

  // Quality indicators
  const isOfficialChannel =
    channelName.includes("official") ||
    channelName.includes("music") ||
    channelName.includes("records") ||
    channelName.includes(primaryArtist.toLowerCase()) ||
    channelName.endsWith("vevo") ||
    channelName.includes("topic");

  const isOfficialVideo =
    videoTitle.includes("official") || videoTitle.includes("music video");

  // Views-based quality (logarithmic to avoid extreme bias)
  const viewsScore =
    video.views > 1000 ? Math.min(0.25, Math.log10(video.views) / 20) : 0;

  // Bonuses for quality content
  const officialBonus = isOfficialChannel ? 0.4 : isOfficialVideo ? 0.2 : 0;

  // Penalties for poor quality
  const badContent = hasBadKeywords(video.title, track.title);
  const tooShort = parseDuration(video.timestamp) < 45000; // Under 45 seconds
  const penalties = (badContent ? 0.5 : 0) + (tooShort ? 0.3 : 0);

  // Weighted final score prioritizing accuracy
  const finalScore =
    titleSim * 0.4 + // Title match most important
    artistScore * 0.35 + // Artist detection crucial
    durationScore * 0.1 + // Duration less critical
    viewsScore + // Popularity indicator
    officialBonus - // Quality bonus
    penalties; // Quality penalties

  return Math.max(0, finalScore);
}

export async function mapSpotifyToYouTube(
  tracks: TrackMetadata[]
): Promise<SongMatch[]> {
  console.log("🚀 Starting optimized Spotify to YouTube mapping");
  const results: SongMatch[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    console.log(
      `\n[${i + 1}/${tracks.length}] Processing: "${track.title}" by ${
        track.artists
      }`
    );

    try {
      // Check cache first
      const cacheKey =
        `${track.title.toLowerCase()}-${track.artists.toLowerCase()}`.replace(
          /[^\w]/g,
          ""
        );

      // Manage cache size to prevent memory issues
      manageCacheSize();

      if (searchCache.has(cacheKey)) {
        console.log("✨ Using cached result");
        const cachedMatch = searchCache.get(cacheKey) || null;
        results.push({
          spotifyTrack: track,
          youtubeMatch: cachedMatch,
          found: !!cachedMatch,
        });
        continue;
      }

      // Generate multiple optimized queries
      const queries = buildYouTubeQueries(track);
      const cleanTitle = track.title
        .replace(/\s*[\(\[].*?[\)\]]\s*/g, "")
        .trim();
      const primaryArtist = track.artists.split(",")[0].trim();

      console.log(`🔍 Trying ${queries.length} queries for "${track.title}"`);

      let bestMatch: YouTubeMatch | null = null;
      let bestScore = 0;

      // Try multiple search queries for better accuracy
      for (const query of queries) {
        if (!query.trim()) continue;

        try {
          console.log(`   Query: "${query}"`);
          const searchResults = await ytSearch(query);
          const videos = searchResults.videos.slice(0, 15); // Reasonable number per query

          console.log(`   Found ${videos.length} videos`);

          // Process each video
          for (const video of videos) {
            if (isInvalidVideo(video)) continue;

            const score = calculateSmartScore(
              track,
              video,
              cleanTitle,
              primaryArtist
            );

            if (score > bestScore && score > 0.25) {
              bestScore = score;
              bestMatch = {
                title: video.title,
                url: video.url,
                thumbnail: video.thumbnail || "",
                views: video.views,
                duration: video.timestamp,
                channel: video.author?.name || "Unknown",
              };

              console.log(
                `   🎯 New best: "${video.title}" (${score.toFixed(3)})`
              );
            }
          }

          // If we found an excellent match, stop searching
          if (bestScore > 0.8) {
            console.log(`   ✨ Excellent match found, stopping search`);
            break;
          }

          // Small delay between queries
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (e: any) {
          console.error(`   ❌ Query failed: ${e.message}`);
        }
      }

      // Cache the result (even if null)
      searchCache.set(cacheKey, bestMatch);

      if (bestMatch) {
        results.push({
          spotifyTrack: track,
          youtubeMatch: bestMatch,
          found: true,
        });
        console.log(
          `✅ Final match: "${bestMatch.title}" by ${
            bestMatch.channel
          } (score: ${bestScore.toFixed(3)})`
        );
      } else {
        results.push({
          spotifyTrack: track,
          youtubeMatch: null,
          found: false,
        });
        console.log(`❌ No suitable match found`);
      }
    } catch (e: any) {
      console.error(`❌ Search failed: ${e.message}`);

      // Handle rate limiting
      if (e.message.includes("429") || e.message.includes("rate")) {
        console.log("⏳ Rate limited, waiting longer...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      results.push({
        spotifyTrack: track,
        youtubeMatch: null,
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
  console.log(`💾 Cache size: ${searchCache.size} entries`);

  return results;
}

function isInvalidVideo(video: any): boolean {
  const title = video.title.toLowerCase();
  const duration = video.timestamp;

  // Skip very short videos (likely not full songs)
  const durationMs = parseDuration(duration);
  if (durationMs < 30000) return true; // Less than 30 seconds

  // Skip obvious non-music content
  const badPatterns = [
    "reaction",
    "review",
    "breakdown",
    "analysis",
    "explained",
    "tutorial",
    "how to",
    "making of",
    "behind the scenes",
    "interview",
    "podcast",
    "talk show",
    "news",
    "trailer",
    "gameplay",
    "gaming",
    "fortnite",
    "minecraft",
    "roblox",
    "crypto",
    "nft",
    "bitcoin",
    "stock",
    "invest",
  ];

  return badPatterns.some((pattern) => title.includes(pattern));
}
