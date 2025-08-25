import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import youtubeHandler from "./routes/youtube/youtubeHandler";
import spotifyHandler from "./routes/spotify/spotifyHandler";
import searchHandler from "./routes/search/searchHandler";
import generateHandler from "./routes/generate/generateHandler";
import session from "express-session";
import { validateURL } from "./services/urlValidationService";
import { extractYouTubePlaylistData } from "./services/youtubeService";
import { extractSpotifyPlaylistData } from "./services/spotifyService";
const app = express();
dotenv.config();
const Port = process.env.PORT || 3023;
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173", // Vite preview server
      "http://127.0.0.1:4173", // Vite preview server
      "http://localhost",
      "http://127.0.0.1",
      process.env.FRONTEND_URL,
    ].filter((v): v is string => Boolean(v)), // filter out undefined, ensure only strings
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "None", // should be from env file
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000, // 1 day
      secure: false, // true if using https
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use("/youtube", youtubeHandler);
app.use("/spotify", spotifyHandler);
app.use("/search", searchHandler);
app.use("/generate", generateHandler);

app.post("/check-url", async (req: any, res: any) => {
  try {
    const url = req.body.url;
    const validation = validateURL(url);

    if (!validation.isValid) {
      return res.json({
        success: false,
        message: validation.message,
      });
    }

    if (validation.type === "youtube") {
      console.log("Processing YouTube URL:", url);
      const tokens = req.session.youtubeTokens;
      const result = await extractYouTubePlaylistData(url, tokens);
      return res.json(result);
    } else if (validation.type === "spotify") {
      console.log("Processing Spotify URL:", url);
      const tokens = req.session.spotifyTokens;
      const result = await extractSpotifyPlaylistData(url, tokens);
      return res.json({
        success: true,
        metadata: result.metadata,
        source: result.source,
      });
    } else {
      return res.json({
        success: false,
        message: "Unsupported URL type",
      });
    }
  } catch (e: any) {
    console.error(e.message);
    return res.json({
      success: false,
      message: e.message,
    });
  }
});

// app.get("/validateUser", (req: any, res: any) => {
//   try {
//     console.log("Inside right endpoint");

//     const youtube = req.session.youtubeTokens || null;
//     const spotify = req.session.spotifyTokens;

//     console.log(youtube);
//     console.log(spotify);
//     if (youtube && spotify) {
//       return res.json({
//         yt: true,
//         ytUser: youtube.username,
//         spotify: true,
//         sUser: spotify.username,
//       });
//     }
//     if (youtube) {
//       return res.json({
//         yt: true,
//         ytUser: youtube.username,
//         spotify: false,
//       });
//     }
//     if (spotify) {
//       return res.json({
//         yt: false,
//         spotify: true,
//         sUser: spotify.username,
//       });
//     }

//     return res.json({
//       yt: false,
//       spotify: false,
//     });
//   } catch (e: any) {
//     return res.json({
//       yt: false,
//       spotify: false,
//     });
//   }
// });

app.listen(Port, () => {
  console.log("Healthy at port ", Port);
});
