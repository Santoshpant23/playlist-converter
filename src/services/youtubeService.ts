import { google } from "googleapis";
import axios from "axios";
import env from "dotenv";

env.config();

const API_KEY = process.env.YOUTUBE_API_KEY;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

const scopes = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
  "profile",
  "email",
];

export interface YouTubeTokens {
  access_token: string;
  refresh_token?: string;
  username?: string;
}

export interface YouTubeVideo {
  title: string;
  videoId: string;
  thumbnail?: string;
  channelTitle: string;
  duration?: string;
}

export interface YouTubeUserInfo {
  items?: Array<{
    snippet?: {
      title?: string;
    };
  }>;
}

// Core authentication functions
export function getYouTubeAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string): Promise<any> {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

export async function getUserInfo(
  accessToken: string
): Promise<YouTubeUserInfo> {
  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "snippet",
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching user info:", error);
    throw error;
  }
}

// Core playlist extraction functions
export function extractPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function fetchPlaylistWithApiKey(playlistId: string) {
  try {
    const playlistResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlistItems",
      {
        params: {
          part: "snippet",
          playlistId,
          maxResults: 50,
          key: API_KEY,
        },
      }
    );
    console.log("I am inside function that fetches public playlists");
    return playlistResponse.data.items;
  } catch (error: any) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      console.log(
        "I think it is private playlist, returning null from fetchwithApiKey"
      );
      return null; // likely private
    }
    throw error;
  }
}

export async function fetchPlaylistWithOAuth(playlistId: string, tokens: any) {
  try {
    console.log("I am now someone who will try fetching private playlists");
    if (!tokens) {
      return [];
    }
    // Build OAuth client from tokens
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );
    oauth2.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2 });

    const response = await youtube.playlistItems.list({
      part: ["snippet"],
      playlistId,
      maxResults: 50,
    });
    console.log(
      "I am done calling right endpoint inside this function, now returning what I got"
    );
    console.log("I am sending this btw " + response.data.items || null);

    return response.data.items || null;
  } catch (e: any) {
    console.log(
      "Got an error inside fetchWithOAuth function and returning null"
    );
    return null;
  }
}

export async function getPlaylistMetadata(
  playlistId: string,
  tokens: any
): Promise<YouTubeVideo[] | null> {
  console.log(
    "I am inside getMetaData function and now will assume it is public playlist first"
  );

  let items = await fetchPlaylistWithApiKey(playlistId);

  if (!items) {
    console.log("Looks like it is private key");
    console.log("Retrying with OAuth...");
    items = await fetchPlaylistWithOAuth(playlistId, tokens);
    if (!items) return null;
  }
  console.log(
    "Now, done extracting everything and got videos, now time to format them in json properly"
  );
  console.log("This is what I got btw " + JSON.stringify(items));

  const videoIds = items.map((item: any) => item.snippet.resourceId.videoId);
  console.log("Got the video ids of all these videos");

  const detailsResponse = await axios.get(
    "https://www.googleapis.com/youtube/v3/videos",
    {
      params: {
        part: "contentDetails",
        id: videoIds.join(","),
        key: API_KEY,
      },
    }
  );
  console.log("Found duration of all the videos too now :) ");

  const durationsMap = new Map();
  detailsResponse.data.items.forEach((item: any) => {
    durationsMap.set(item.id, item.contentDetails.duration);
  });
  console.log("All good now, yah ");

  return items.map((item: any) => {
    const videoId = item.snippet.resourceId.videoId;
    return {
      title: item.snippet.title,
      videoId,
      thumbnail:
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      duration: durationsMap.get(videoId),
    };
  });
}

// Core URL validation function
export function validateYouTubeUrl(url: string): boolean {
  return url.toLowerCase().includes("youtube.com");
}

// Main function to extract playlist data from URL
export async function extractYouTubePlaylistData(url: string, tokens: any) {
  if (!url) {
    throw new Error("No URL provided");
  }

  const id = extractPlaylistId(url);
  console.log("Id extracted successfully, " + id);

  if (!id) {
    throw new Error("Invalid playlist URL");
  }

  const videoData = await getPlaylistMetadata(id, tokens);

  if (!videoData) {
    throw new Error(
      "Could not access the playlist. It might be private. Please log in with Google and try again."
    );
  }

  return {
    success: true,
    metadata: videoData,
  };
}
