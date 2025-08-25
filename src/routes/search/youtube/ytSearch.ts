import { Router } from "express";
import { mapSpotifyToYouTube } from "./searchMetaData";
import { makeYoutubePlaylist } from "./makePlaylist";
// import { getUserTokens } from "../../../providers/youtubeToken";
import { OAuth2Client } from "google-auth-library";
import { log } from "console";
import { language } from "googleapis/build/src/apis/language";

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

ytSearch.post("/generate-playlist", async (req: any, res: any) => {
  try {
    log(
      "Inside the right endpoint to generate playlist, let's see below what happens"
    );
    const metadata = req.body.metaData;
    let playlistName = req.body.playlistName;
    const isPrivate = Boolean(req.body.isPrivate);
    if (!metadata) {
      res.json({
        success: false,
        message: "Nothing Provided",
      });
    }
    if (!playlistName) {
      playlistName = "Converted from Spotify";
    }
    console.log("metadata found", metadata);

    const tokens = req.session.youtubeTokens;
    if (!tokens) {
      return res.json({
        success: false,
        message: "User not authenticated. Please log in with YouTube first.",
      });
    }

    console.log("token found", tokens);
    log("Calling the one and only function below");
    const playlist = await makeYoutubePlaylist(
      tokens,
      metadata,
      playlistName,
      isPrivate ? "private" : "public"
    );
    console.log("Playlist generated", playlist);
    return res.json(playlist);
  } catch (e: any) {
    return res.json({
      success: false,
      message: e.message,
    });
  }
});
export default ytSearch;
