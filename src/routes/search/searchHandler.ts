import { Router } from "express";
import ytSearch from "./youtube/ytSearch";
import spotifySearch from "./spotify/spotifySearch";

const searchHandler = Router();

// searchHandler.post("/", (req, res) => {
//   res.send("Inside search endpoint");
// });

searchHandler.use("/youtube", ytSearch);
searchHandler.use("/spotify", spotifySearch);

export default searchHandler;
