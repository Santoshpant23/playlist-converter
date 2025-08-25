import querystring from "querystring";
import { Buffer } from "buffer";
import axios from "axios";
import { parse } from "url";
import { log } from "console";

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  username: string;
}

export interface SpotifyTrack {
  title: string;
  artists: string;
  album: string;
  durationMs: number;
  duration: string;
  spotifyUrl: string;
  imageUrl?: string;
}

export interface SpotifyPlaylistData {
  metadata: SpotifyTrack[];
  source: "public" | "private";
}

// Utility: Generate random string for state
export function generateRandomString(length: number): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Core authentication functions
export function getSpotifyAuthUrl(state: string): string {
  const scope =
    "user-read-private user-read-email playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative";

  return (
    "https://accounts.spotify.com/authorize?" +
    querystring.stringify({
      response_type: "code",
      client_id,
      scope,
      redirect_uri,
      state,
    })
  );
}

export async function exchangeCodeForTokens(
  code: string
): Promise<SpotifyTokens> {
  const authString = Buffer.from(`${client_id}:${client_secret}`).toString(
    "base64"
  );

  log(
    "I am inside function named exchangeCodeForTokens with code ",
    code,
    " redirect url ",
    redirect_uri
  );
  log("Auth String is ", authString);
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    querystring.stringify({
      code,
      redirect_uri,
      grant_type: "authorization_code",
    }),
    {
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  log("Did a response call and below are the data");

  const { access_token, refresh_token, expires_in } = response.data;
  log(
    access_token,
    " -> access token ",
    refresh_token,
    " -> refresh token ",
    expires_in,
    " -> expires in"
  );
  // Get user profile to verify the token works
  log(
    "Below I am calling a function that will help me get the username of the person"
  );
  const userInfo = await axios.get("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  log("Function called successfully");

  const username = userInfo.data.display_name || userInfo.data.id;

  log("USername of spotify user is ", username);

  return {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
    username,
  };
}

// Utility: Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const authString = Buffer.from(`${client_id}:${client_secret}`).toString(
    "base64"
  );

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    querystring.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data;
}

// Utility: Get valid access token from tokens or refresh it
export async function getValidSpotifyToken(
  tokens: SpotifyTokens
): Promise<string> {
  if (!tokens || !tokens.access_token) {
    throw new Error("Spotify not authenticated");
  }

  if (Date.now() > (tokens.expires_at || 0) - 300000) {
    // token expired or about to expire in 5 mins
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      return refreshed.access_token;
    } catch (error) {
      console.error("Failed to refresh Spotify token:", error);
      throw new Error(
        "Spotify token expired and refresh failed. Please re-authenticate."
      );
    }
  }

  return tokens.access_token;
}

// Core playlist extraction functions
export function extractSpotifyPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");

    const index = segments.indexOf("playlist");
    if (index !== -1 && segments[index + 1]) {
      return segments[index + 1].split("?")[0];
    }

    return null;
  } catch {
    return null;
  }
}

export function extractTrackMetadata(data: any): SpotifyTrack[] {
  console.log("Inside extractTrackMetadata function");
  if (!data || !data.tracks || !data.tracks.items) return [];

  return data.tracks.items
    .map((item: any) => {
      const track = item.track;
      if (!track) return null;

      const images = track.album?.images || [];
      // Prefer medium size image if available, fallback to others
      const imageUrl =
        images.find((img: any) => img.width >= 200 && img.width <= 400)?.url ||
        images.find((img: any) => img.width >= 100)?.url ||
        images[0]?.url;

      return {
        title: track.name,
        artists: track.artists.map((a: any) => a.name).join(", "),
        album: track.album.name,
        durationMs: track.duration_ms,
        duration: msToTime(track.duration_ms),
        spotifyUrl: track.external_urls.spotify,
        imageUrl,
      };
    })
    .filter(Boolean);
}

export function msToTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export async function fetchSpotifyPlaylist(
  playlistId: string,
  accessToken?: string
): Promise<SpotifyPlaylistData> {
  try {
    // Try public access first
    console.log("Trying to see if this is public playlist");
    const publicResponse = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    //todo improve this function
    log(
      "THis is important below, this will help me know what is the information I am getting from spotify api"
    );
    log(JSON.stringify(publicResponse.data));
    // this function is the problem -> TODO: fix it
    const metadata = extractTrackMetadata(publicResponse.data);
    console.log("I think it is public, returning something");
    return { metadata, source: "public" };
  } catch (publicError) {
    console.log("Public access failed, trying authenticated...");

    if (!accessToken) {
      throw new Error("Access token required for private playlist");
    }

    try {
      const privateResponse = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      console.log("Extracted private playlist hehe");
      const metadata = extractTrackMetadata(privateResponse.data);
      return { metadata, source: "private" };
    } catch (authError: any) {
      console.error("Failed to fetch playlist:", authError.message);
      throw new Error("Unable to fetch playlist metadata");
    }
  }
}

// Core URL validation function
export function validateSpotifyUrl(url: string): boolean {
  return url.toLowerCase().includes("spotify.com");
}

// Main function to extract playlist data from URL
export async function extractSpotifyPlaylistData(
  playlistUrl: string,
  tokens?: SpotifyTokens
): Promise<SpotifyPlaylistData> {
  if (!playlistUrl) {
    throw new Error("Missing playlistUrl");
  }

  const playlistId = extractSpotifyPlaylistId(playlistUrl);
  console.log("This is the id of playlist " + playlistId);

  if (!playlistId) {
    throw new Error("Invalid playlist URL");
  }

  let accessToken: string | undefined;
  if (tokens) {
    accessToken = await getValidSpotifyToken(tokens);
  }

  return await fetchSpotifyPlaylist(playlistId, accessToken);
}
