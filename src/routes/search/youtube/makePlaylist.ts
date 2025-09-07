// makePlaylist.ts
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import {
  getValidYouTubeToken,
  YouTubeTokens,
} from "../../../services/youtubeService";

// Assume you already have OAuth2 client setup
// import { getUserTokens } from "../../../providers/youtubeToken"; // You should export it from your token file

interface SongMatch {
  youtubeMatch: {
    title: string;
    url: string;
    videoId?: string; // optional, we'll extract it
  };
  found: boolean;
}

interface PlaylistMetadata {
  title: string;
  description?: string;
  privacyStatus?: "public" | "private" | "unlisted";
}

function extractVideoIdFromUrl(url: string): string | null {
  const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export async function makeYoutubePlaylist(
  tokens: YouTubeTokens,
  songs: SongMatch[],
  playlistName: string,
  privacy: "public" | "private" | "unlisted" = "public"
): Promise<{
  success: boolean;
  playlistUrl?: string;
  message?: string;
  found?: number;
  total?: number;
  updated_tokens?: YouTubeTokens;
}> {
  try {
    console.log("🎵 Starting YouTube playlist creation...");

    // Get valid token (refresh if needed)
    const tokenResult = await getValidYouTubeToken(tokens);

    console.log("✅ YouTube token validated");

    // Test the token with a simple API call first
    try {
      console.log("🧪 Testing YouTube token with channels API...");
      await axios.get("https://www.googleapis.com/youtube/v3/channels", {
        params: {
          part: "snippet",
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${tokenResult.access_token}`,
        },
      });
      console.log("✅ YouTube token test successful");
    } catch (testError: any) {
      console.error("❌ YouTube token test failed:", testError.response?.data);
      throw new Error(
        `YouTube token invalid: ${
          testError.response?.data?.error?.message || testError.message
        }`
      );
    }

    // Step 1: Create the playlist
    console.log("📝 Creating YouTube playlist...");
    const createResponse = await axios.post(
      "https://www.googleapis.com/youtube/v3/playlists",
      {
        snippet: {
          title: playlistName,
          description: "Songs converted from Spotify",
        },
        status: {
          privacyStatus: privacy,
        },
      },
      {
        params: {
          part: "snippet,status",
        },
        headers: {
          Authorization: `Bearer ${tokenResult.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ YouTube playlist created");

    const playlistId = createResponse.data.id;
    if (!playlistId) throw new Error("Playlist creation failed");

    // Step 2: Add each video to the playlist (with reduced logging)
    const foundSongs = songs.filter((song) => song.found);
    console.log(`📹 Adding ${foundSongs.length} videos to playlist...`);

    let addedCount = 0;
    for (const song of foundSongs) {
      try {
        const videoId =
          song.youtubeMatch.videoId ||
          extractVideoIdFromUrl(song.youtubeMatch.url);

        if (!videoId) continue;

        await axios.post(
          "https://www.googleapis.com/youtube/v3/playlistItems",
          {
            snippet: {
              playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: videoId,
              },
            },
          },
          {
            params: {
              part: "snippet",
            },
            headers: {
              Authorization: `Bearer ${tokenResult.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );
        addedCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to add video ${song.youtubeMatch.title}`);
      }
    }

    console.log(`✅ Added ${addedCount} videos to YouTube playlist`);

    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

    return {
      success: true,
      playlistUrl,
      found: addedCount,
      total: songs.length,
      updated_tokens: tokenResult.updated_tokens,
    };
  } catch (error: any) {
    console.error(
      "❌ Failed to create YouTube playlist:",
      error.response?.data || error.message
    );
    return {
      success: false,
      message:
        error.response?.data?.error?.message ||
        error.message ||
        "Unknown error",
    };
  }
}
