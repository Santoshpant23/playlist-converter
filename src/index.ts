import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import youtubeHandler from "./routes/youtube/youtubeHandler";
import spotifyHandler from "./routes/spotify/spotifyHandler";
import searchHandler from "./routes/search/searchHandler";
import generateHandler from "./routes/generate/generateHandler";
import authHandler from "./routes/auth/onBoard";
import authStatus from "./routes/auth/authStatus";
import { validateURL } from "./services/urlValidationService";
import { extractYouTubePlaylistData } from "./services/youtubeService";
import { extractSpotifyPlaylistData } from "./services/spotifyService";
import { authenticateToken, AuthRequest } from "./middleware/auth";
import { UserTokens } from "./models/User";
const app = express();
const connection = process.env.MONGODB_CONNECTION_STRING || "wrong";
dotenv.config();
const Port = process.env.PORT || 3023;
app.use(express.json());
mongoose.connect(connection);
app.use(
  cors({
    origin: [
      "https://ytify-bay.vercel.app",
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

app.use("/auth", authHandler);
app.use("/auth", authStatus);
app.use("/youtube", youtubeHandler);
app.use("/spotify", spotifyHandler);
app.use("/search", searchHandler);
app.use("/generate", generateHandler);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    spotify: {
      configured: !!(
        process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
      ),
      clientId: process.env.SPOTIFY_CLIENT_ID
        ? `${process.env.SPOTIFY_CLIENT_ID.substring(0, 8)}...`
        : "missing",
    },
    youtube: {
      configured: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      clientId: process.env.GOOGLE_CLIENT_ID
        ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 12)}...`
        : "missing",
    },
    mongodb: {
      connected: mongoose.connection.readyState === 1,
    },
  });
});

app.post(
  "/check-url",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      const url = req.body.url;
      const validation = validateURL(url);

      if (!validation.isValid) {
        return res.json({
          success: false,
          message: validation.message,
        });
      }

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });

      if (validation.type === "youtube") {
        console.log("Processing YouTube URL:", url);

        if (!userTokens?.youtubeTokens) {
          return res.json({
            success: false,
            message: "YouTube authentication required",
          });
        }

        const tokens = {
          access_token: userTokens.youtubeTokens.access_token,
          refresh_token: userTokens.youtubeTokens.refresh_token,
          username: userTokens.youtubeTokens.username,
        };

        const result = await extractYouTubePlaylistData(url, tokens);
        return res.json(result);
      } else if (validation.type === "spotify") {
        console.log("Processing Spotify URL:", url);

        if (!userTokens?.spotifyTokens) {
          return res.json({
            success: false,
            message: "Spotify authentication required",
          });
        }

        const tokens = {
          access_token: userTokens.spotifyTokens.access_token,
          refresh_token: userTokens.spotifyTokens.refresh_token,
          expires_at: userTokens.spotifyTokens.expires_at
            ? userTokens.spotifyTokens.expires_at.getTime()
            : 0,
          username: userTokens.spotifyTokens.username || "",
        };

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
  }
);

app.get(
  "/validateUser",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });

      const youtube = userTokens?.youtubeTokens || null;
      const spotify = userTokens?.spotifyTokens || null;

      if (youtube && spotify) {
        return res.json({
          yt: true,
          ytUser: youtube.username,
          spotify: true,
          sUser: spotify.username,
        });
      }
      if (youtube) {
        return res.json({
          yt: true,
          ytUser: youtube.username,
          spotify: false,
        });
      }
      if (spotify) {
        return res.json({
          yt: false,
          spotify: true,
          sUser: spotify.username,
        });
      }

      return res.json({
        yt: false,
        spotify: false,
      });
    } catch (e: any) {
      console.error("ValidateUser error:", e);
      return res.json({
        yt: false,
        spotify: false,
      });
    }
  }
);

app.listen(Port, () => {
  console.log("Healthy at port ", Port);
});
