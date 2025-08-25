// makeSpotifyPlaylist.ts
import axios from "axios";

interface SpotifyMatch {
  title: string;
  artists: string;
  album: string;
  durationMs: number;
  spotifyUrl: string;
}

interface YouTubeToSpotifyResult {
  youTubeMetadata: any;
  spotifyMatch: SpotifyMatch | null;
  found: boolean;
}

export async function makeSpotifyPlaylist(
  accessToken: string,
  results: YouTubeToSpotifyResult[],
  playlistName = "Converted from YouTube",
  isPrivate = false
): Promise<{ success: boolean; playlistUrl?: string; message?: string }> {
  try {
    console.log("This is the access token, ", accessToken);

    console.log("Inside the playlist gen function, below is the results array");
    console.log(results);

    // Step 1: Get current user ID
    const userRes = await axios.get("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const userId = userRes.data.id;
    console.log("This is userId ", userId);

    // Step 2: Create a new playlist
    console.log(
      `Creating Spotify playlist with public: ${!isPrivate} (isPrivate: ${isPrivate})`
    );

    const createRes = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: playlistName,
        description: "Playlist converted from YouTube videos",
        public: !isPrivate,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("createRes called successfully ", createRes);

    const playlistId = createRes.data.id;
    console.log("This is playlistId ", playlistId);

    if (!playlistId) {
      throw new Error("Playlist creation failed");
    }

    // Step 3: Extract track URIs from matches
    console.log("Now trying to extract URIs from matches");

    const uris = results
      .filter((res) => res.found && res.spotifyMatch)
      .map((res) => {
        const match = res.spotifyMatch!;
        const urlParts = match.spotifyUrl.split("/");
        return `spotify:track:${urlParts[urlParts.length - 1]}`;
      });

    // Spotify allows max 100 songs per request
    const chunkSize = 100;
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize);
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: chunk },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
    console.log("Everything alright");

    return {
      success: true,
      playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
    };
  } catch (e: any) {
    console.error("Error creating Spotify playlist:", e.message || e);
    return {
      success: false,
      message:
        e.response?.data?.error?.message ||
        e.message ||
        "Unknown error creating playlist",
    };
  }
}
