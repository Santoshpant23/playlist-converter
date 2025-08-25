import { Router } from "express";
import { mapYoutubeToSpotify } from "./searchMetaData";
// import { TokenManager } from "../../spotify/soptifyHandler";
import { makeSpotifyPlaylist } from "./makePlaylist";
import { log } from "console";
import { getValidSpotifyToken } from "../../../services/spotifyService";

const spotifySearch = Router();

spotifySearch.get("/", (req: any, res: any) => {
  res.send("I am inside /search/spotify endpoint");
});

spotifySearch.post("/search", async (req: any, res: any) => {
  try {
    const metaData = req.body.metadata;
    if (!metaData) {
      return res.json({
        success: false,
        message: "no songs provided",
      });
    }
    const spotifyToken = await getValidSpotifyToken(req.session.spotifyTokens);
    if (!spotifyToken) {
      return res.json({
        success: false,
        message: "Please login to spotify before this action",
      });
    }
    console.log("Everything is good, now calling the mappingFunction, cool");
    log("This is the accesstoken btw ", spotifyToken);
    const results = await mapYoutubeToSpotify(metaData, spotifyToken);
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
});

spotifySearch.post("/make-playlist", async (req: any, res: any) => {
  try {
    console.log("Inside playlist gen endpoint");
    console.log(
      "Request body isPrivate:",
      req.body.isPrivate,
      "Type:",
      typeof req.body.isPrivate
    );

    const metadata = req.body.metadata;
    const accessToken = await getValidSpotifyToken(req.session.spotifyTokens);
    const playlistName =
      req.body.playlistName || "Converted from youtube to spotify";
    const isPrivate = Boolean(req.body.isPrivate);

    console.log(
      "Creating Spotify playlist with isPrivate:",
      isPrivate,
      "playlistName:",
      playlistName
    );

    const { playlistUrl } = await makeSpotifyPlaylist(
      accessToken,
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
});

export default spotifySearch;
