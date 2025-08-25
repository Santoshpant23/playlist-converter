import express from "express";
import { extractYouTubePlaylistData } from "../../services/youtubeService";

const metaData = express.Router();

metaData.post("/api/yt/playlist-metadata", async (req: any, res: any) => {
  console.log("I am inside right endpoint to fetch playlist metadata");

  const { url } = req.body;
  const tokens = req.session.youtubeTokens;

  try {
    const result = await extractYouTubePlaylistData(url, tokens);
    res.json(result);
  } catch (error: any) {
    res.json({
      success: false,
      message: error.message,
    });
  }
});

export default metaData;
