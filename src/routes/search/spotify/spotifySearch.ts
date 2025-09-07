import { Router } from "express";
import { mapYoutubeToSpotify } from "./searchMetaData";
// import { TokenManager } from "../../spotify/soptifyHandler";
import { makeSpotifyPlaylist } from "./makePlaylist";
import { log } from "console";
import { getValidSpotifyToken } from "../../../services/spotifyService";
import { authenticateToken, AuthRequest } from "../../../middleware/auth";
import { UserTokens, User } from "../../../models/User";

const spotifySearch = Router();

spotifySearch.get("/", (req: any, res: any) => {
  res.send("I am inside /search/spotify endpoint");
});

spotifySearch.post(
  "/search",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      const metaData = req.body.metadata;
      if (!metaData) {
        return res.json({
          success: false,
          message: "no songs provided",
        });
      }

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });
      const spotifyTokens = userTokens?.spotifyTokens;

      if (!spotifyTokens) {
        return res.json({
          success: false,
          message: "Please login to spotify before this action",
        });
      }

      // Check if token is expired
      if (spotifyTokens.expires_at && new Date() > spotifyTokens.expires_at) {
        return res.json({
          success: false,
          message: "Spotify token expired. Please reconnect.",
        });
      }

      const tokenData = {
        access_token: spotifyTokens.access_token,
        refresh_token: spotifyTokens.refresh_token,
        expires_at: spotifyTokens.expires_at
          ? spotifyTokens.expires_at.getTime()
          : 0,
        username: spotifyTokens.username || "",
      };

      const tokenResult = await getValidSpotifyToken(tokenData);
      if (!tokenResult) {
        return res.json({
          success: false,
          message: "Please login to spotify before this action",
        });
      }

      // If token was refreshed, update it in the database
      if (tokenResult.updated_tokens) {
        console.log("💾 Updating refreshed Spotify token in database...");
        await UserTokens.findOneAndUpdate(
          { userId: req.user!.id },
          {
            "spotifyTokens.access_token":
              tokenResult.updated_tokens.access_token,
            "spotifyTokens.refresh_token":
              tokenResult.updated_tokens.refresh_token,
            "spotifyTokens.expires_at": new Date(
              tokenResult.updated_tokens.expires_at
            ),
          }
        );
        console.log("✅ Spotify token updated in database");
      }

      console.log("Everything is good, now calling the mappingFunction, cool");
      log("This is the accesstoken btw ", tokenResult.access_token);
      const results = await mapYoutubeToSpotify(
        metaData,
        tokenResult.access_token
      );
      console.log("Mapping function ran successfully, now returning the data");

      const foundSongs = results.filter((song) => song.found);
      return res.json({
        success: true,
        found: foundSongs.length,
        total: results.length,
        results,
      });
    } catch (e: any) {
      return res.json({
        success: false,
        message: e.message,
      });
    }
  }
);

spotifySearch.post(
  "/make-playlist",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      console.log("Inside playlist gen endpoint");
      console.log(
        "Request body isPrivate:",
        req.body.isPrivate,
        "Type:",
        typeof req.body.isPrivate
      );

      const metadata = req.body.metadata;
      const playlistName =
        req.body.playlistName || "Converted from youtube to spotify";
      const isPrivate = Boolean(req.body.isPrivate);

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });
      const spotifyTokens = userTokens?.spotifyTokens;

      if (!spotifyTokens) {
        return res.json({
          success: false,
          message: "Spotify authentication required",
        });
      }

      // Check if token is expired
      if (spotifyTokens.expires_at && new Date() > spotifyTokens.expires_at) {
        return res.json({
          success: false,
          message: "Spotify token expired. Please reconnect.",
        });
      }

      const tokenData = {
        access_token: spotifyTokens.access_token,
        refresh_token: spotifyTokens.refresh_token,
        expires_at: spotifyTokens.expires_at
          ? spotifyTokens.expires_at.getTime()
          : 0,
        username: spotifyTokens.username || "",
      };

      const tokenResult2 = await getValidSpotifyToken(tokenData);
      if (!tokenResult2) {
        return res.json({
          success: false,
          message: "Unable to validate Spotify token",
        });
      }

      // If token was refreshed, update it in the database
      if (tokenResult2.updated_tokens) {
        console.log(
          "💾 Updating refreshed Spotify token in database (playlist creation)..."
        );
        await UserTokens.findOneAndUpdate(
          { userId: req.user!.id },
          {
            "spotifyTokens.access_token":
              tokenResult2.updated_tokens.access_token,
            "spotifyTokens.refresh_token":
              tokenResult2.updated_tokens.refresh_token,
            "spotifyTokens.expires_at": new Date(
              tokenResult2.updated_tokens.expires_at
            ),
          }
        );
        console.log("✅ Spotify token updated in database");
      }

      console.log(
        "Creating Spotify playlist with isPrivate:",
        isPrivate,
        "playlistName:",
        playlistName
      );

      const { playlistUrl } = await makeSpotifyPlaylist(
        tokenResult2.access_token,
        metadata.results,
        playlistName,
        isPrivate
      );
      log("I will return the playlist Url which is ", playlistUrl);
      const foundSongs = metadata.results.filter((song: any) => song.found);
      return res.json({
        success: true,
        found: foundSongs.length,
        total: metadata.results.length,
        playlistUrl,
      });
    } catch (e: any) {
      return res.json({
        success: false,
        message: e.message,
      });
    }
  }
);

export default spotifySearch;
