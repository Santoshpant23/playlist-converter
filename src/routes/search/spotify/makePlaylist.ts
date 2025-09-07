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
    console.log("🎵 Starting Spotify playlist creation...");
    console.log("Access Token length:", accessToken ? accessToken.length : 0);

    // Validate access token
    if (!accessToken || accessToken.trim().length === 0) {
      throw new Error("Invalid or missing Spotify access token");
    }

    console.log("Results to process:", results.length);

    // Step 1: Get current user ID with better error handling
    let userRes;
    try {
      userRes = await axios.get("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      });
    } catch (error: any) {
      console.error(
        "Failed to get user profile:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to authenticate with Spotify: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }

    const userId = userRes.data.id;
    console.log("✅ User authenticated:", userId);

    // Step 2: Create a new playlist with better error handling
    console.log(
      `🎨 Creating playlist: "${playlistName}" (${
        isPrivate ? "private" : "public"
      })`
    );

    let createRes;
    try {
      createRes = await axios.post(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
          name: playlistName,
          description: "Playlist converted from YouTube videos using Ytify",
          public: !isPrivate,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
    } catch (error: any) {
      console.error(
        "Failed to create playlist:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to create playlist: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }

    console.log("✅ Playlist creation response received");
    const playlistId = createRes.data.id;
    console.log("✅ Playlist created with ID:", playlistId);

    if (!playlistId) {
      throw new Error("Playlist creation failed - no playlist ID returned");
    }

    // Step 3: Extract Spotify URIs from successful matches
    console.log("📋 Processing matches for playlist...");
    const foundMatches = results.filter(
      (result) => result.found && result.spotifyMatch
    );
    console.log(
      `🎵 Found ${foundMatches.length} songs with Spotify matches out of ${results.length} total`
    );

    if (foundMatches.length === 0) {
      console.warn("⚠️ No songs found on Spotify to add to playlist");
      return {
        success: true,
        playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
        message: "Playlist created but no matching songs were found on Spotify",
      };
    }

    // Extract URIs with better error handling
    const uris: string[] = [];
    for (const result of foundMatches) {
      try {
        const spotifyUrl = result.spotifyMatch?.spotifyUrl;
        if (spotifyUrl) {
          // Extract track ID from Spotify URL and create URI
          const trackId = spotifyUrl.split("/track/")[1]?.split("?")[0];
          if (trackId) {
            uris.push(`spotify:track:${trackId}`);
            console.log(
              `📍 Queued: ${result.spotifyMatch?.title} by ${result.spotifyMatch?.artists}`
            );
          }
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to process track: ${result.spotifyMatch?.title}`,
          error
        );
      }
    }

    if (uris.length === 0) {
      console.warn("⚠️ No valid Spotify URIs could be extracted");
      return {
        success: true,
        playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
        message: "Playlist created but no valid Spotify tracks could be added",
      };
    }

    console.log(`🎵 Adding ${uris.length} tracks to playlist in batches...`);

    // Step 4: Add tracks to playlist in chunks with better error handling
    const chunkSize = 50; // Smaller chunks for better reliability
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize);
      try {
        await axios.post(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
          { uris: chunk },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );
        console.log(
          `✅ Added batch ${Math.floor(i / chunkSize) + 1}: ${
            chunk.length
          } tracks`
        );

        // Small delay between batches to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error: any) {
        console.error(
          `❌ Failed to add batch ${Math.floor(i / chunkSize) + 1}:`,
          error.response?.data || error.message
        );
        throw new Error(
          `Failed to add tracks to playlist: ${
            error.response?.data?.error?.message || error.message
          }`
        );
      }
    }

    console.log("🎉 Playlist creation completed successfully!");

    return {
      success: true,
      playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
    };
  } catch (e: any) {
    console.error("❌ Error creating Spotify playlist:", e.message || e);
    return {
      success: false,
      message: e.message || "Unknown error creating playlist",
    };
  }
}
