// makePlaylist.ts
import { OAuth2Client } from "google-auth-library";
import axios from "axios";

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
  tokens: any,
  songs: SongMatch[],
  playlistName: string,
  privacy: "public" | "private" | "unlisted" = "public"
): Promise<{
  success: boolean;
  playlistUrl?: string;
  message?: string;
  found?: number;
  total?: number;
}> {
  try {
    console.log(
      "Inside the function that converts from spotify to youtube below yahhhhhhh"
    );
    // Build OAuth2 client from stored session tokens
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );
    oauth2Client.setCredentials(tokens);

    // Get access token for the requests
    const { token } = await oauth2Client.getAccessToken();

    // Step 1: Create the playlist
    const createResponse = await axios.post(
      "https://www.googleapis.com/youtube/v3/playlists",
      {
        snippet: {
          title: playlistName,
          description: "Songs converted from spotify",
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
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(createResponse.data);

    const playlistId = createResponse.data.id;
    if (!playlistId) throw new Error("Playlist creation failed");
    console.log(playlistId);

    // Step 2: Add each video to the playlist
    for (const song of songs) {
      if (!song.found) continue;

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
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

    const foundSongs = songs.filter((song) => song.found);
    return {
      success: true,
      playlistUrl,
      found: foundSongs.length,
      total: songs.length,
    };
  } catch (error: any) {
    console.error("Failed to create playlist:", error);
    return {
      success: false,
      message: error.message || "Unknown error",
    };
  }
}
