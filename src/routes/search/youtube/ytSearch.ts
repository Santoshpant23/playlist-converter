import { Router } from "express";
import { mapSpotifyToYouTube } from "./searchMetaData";
import { makeYoutubePlaylist } from "./makePlaylist";
import { OAuth2Client } from "google-auth-library";
import { log } from "console";
import { authenticateToken, AuthRequest } from "../../../middleware/auth";
import { UserTokens } from "../../../models/User";
import {
  getValidYouTubeToken,
  YouTubeTokens,
} from "../../../services/youtubeService";

const ytSearch = Router();

ytSearch.post("/search", async (req: any, res: any) => {
  try {
    const data = req.body.metaData;
    const playlistName = req.body.playlistName; // Accept playlist name but don't use it in search

    if (!data || !Array.isArray(data)) {
      return res.json({
        success: false,
        message: "Invalid metadata provided",
      });
    }

    const response = await mapSpotifyToYouTube(data);
    const foundSongs = response.filter((song) => song.found);
    return res.json({
      success: true,
      found: foundSongs.length,
      total: response.length,
      songs: response,
    });
  } catch (e: any) {
    console.error("Error in YouTube search:", e);
    return res.json({
      success: false,
      message: "Something went wrong " + e.message,
    });
  }
});

ytSearch.post(
  "/generate-playlist",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      log(
        "Inside the right endpoint to generate playlist, let's see below what happens"
      );
      const metadata = req.body.metaData;
      let playlistName = req.body.playlistName;
      const isPrivate = Boolean(req.body.isPrivate);

      if (!metadata) {
        return res.json({
          success: false,
          message: "Nothing Provided",
        });
      }

      if (!playlistName) {
        playlistName = "Converted from Spotify";
      }
      console.log("metadata found", metadata);

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });
      const tokens = userTokens?.youtubeTokens;

      if (!tokens) {
        return res.json({
          success: false,
          message: "User not authenticated. Please log in with YouTube first.",
        });
      }

      const tokenData: YouTubeTokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at ? tokens.expires_at.getTime() : undefined,
        username: tokens.username,
      };

      console.log("✅ YouTube tokens found");
      console.log("Token data:", {
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
        expires_at: tokenData.expires_at
          ? new Date(tokenData.expires_at)
          : "No expiry",
        username: tokenData.username,
      });

      const playlist = await makeYoutubePlaylist(
        tokenData,
        metadata,
        playlistName,
        isPrivate ? "private" : "public"
      );

      // If token was refreshed during playlist creation, update database
      if (playlist.updated_tokens) {
        console.log("💾 Updating refreshed YouTube token in database...");
        await UserTokens.findOneAndUpdate(
          { userId: req.user!.id },
          {
            "youtubeTokens.access_token": playlist.updated_tokens.access_token,
            "youtubeTokens.refresh_token":
              playlist.updated_tokens.refresh_token,
            "youtubeTokens.expires_at": playlist.updated_tokens.expires_at
              ? new Date(playlist.updated_tokens.expires_at)
              : undefined,
          }
        );
        console.log("✅ YouTube token updated in database");
      }

      console.log("🎉 Playlist creation completed");
      return res.json(playlist);
    } catch (e: any) {
      return res.json({
        success: false,
        message: e.message,
      });
    }
  }
);
export default ytSearch;
