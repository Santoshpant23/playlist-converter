import { Router } from "express";
import { log } from "console";
import { extractSpotifyPlaylistData } from "../../services/spotifyService";

const handleMetaData = Router();

handleMetaData.post("/", async (req: any, res: any) => {
  const { playlistUrl } = req.body;

  try {
    const tokens = req.session.spotifyTokens;
    const result = await extractSpotifyPlaylistData(playlistUrl, tokens);
    return res.json(result);
  } catch (error: any) {
    console.error("Failed to fetch playlist:", error.message);
    return res.status(500).json({ error: "Unable to fetch playlist metadata" });
  }
});

export default handleMetaData;
