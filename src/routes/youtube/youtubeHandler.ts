import { Router } from "express";
import env from "dotenv";
import metaData from "./getMetaData";
import { log } from "console";
import {
  getYouTubeAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
} from "../../services/youtubeService";
import { generateRandomString } from "../../services/spotifyService";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { UserTokens } from "../../models/User";

env.config();

const youtubeHandler = Router();

// Get YouTube auth URL (for frontend to initiate OAuth)
youtubeHandler.get(
  "/auth-url",
  authenticateToken as any,
  (req: AuthRequest, res: any) => {
    // Store user ID in state for callback verification
    const state = Buffer.from(
      JSON.stringify({ userId: req.user!.id })
    ).toString("base64");
    const authUrl = getYouTubeAuthUrl() + `&state=${state}`;
    res.json({ authUrl });
  }
);

// Direct YouTube OAuth redirect (requires user to be logged in)
youtubeHandler.get(
  "/auth",
  authenticateToken as any,
  (req: AuthRequest, res: any) => {
    // Generate state with user ID for callback verification
    const state = Buffer.from(
      JSON.stringify({ userId: req.user!.id })
    ).toString("base64");

    // Redirect directly to YouTube OAuth
    const authUrl = getYouTubeAuthUrl() + `&state=${state}`;
    res.redirect(authUrl);
  }
);

// OAuth callback
youtubeHandler.get("/api/callback", async (req: any, res: any) => {
  const code = req.query.code;
  const state = req.query.state;

  try {
    // Verify state parameter to get user ID
    if (!state) {
      return res.status(400).json({ error: "Missing state parameter" });
    }

    let userId: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      userId = stateData.userId;
    } catch {
      return res.status(400).json({ error: "Invalid state parameter" });
    }

    const tokens = await exchangeCodeForTokens(code);

    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated with YouTube" });
    }

    const userInfo = await getUserInfo(tokens.access_token);

    // Extract just the display name (YouTube channel title)
    const channel = userInfo?.items?.[0]?.snippet?.title || "YouTube User";
    console.log("YouTube channel:", channel);

    // Calculate expiry date (tokens typically expire in 1 hour)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save or update tokens in database
    await UserTokens.findOneAndUpdate(
      { userId },
      {
        userId,
        youtubeTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          username: channel,
        },
      },
      { upsert: true, new: true }
    );

    console.log("YouTube tokens saved successfully, redirecting to frontend");

    res.redirect(
      `${process.env.FRONTEND_URL || "https://ytify-bay.vercel.app"}/`
    );
  } catch (error) {
    console.error("Error retrieving access token", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "https://ytify-bay.vercel.app"
      }/?error=youtube_auth_failed`
    );
  }
});

youtubeHandler.post(
  "/validate",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      console.log("Inside YouTube validate for user:", req.user!.id);

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });
      const ytToken = userTokens?.youtubeTokens || null;

      console.log("YouTube token found:", !!ytToken);

      if (!ytToken) {
        return res.json({
          success: false,
          message: "YouTube authentication required",
        });
      }

      // Check if token is expired
      if (ytToken.expires_at && new Date() > ytToken.expires_at) {
        return res.json({
          success: false,
          message: "YouTube token expired. Please reconnect.",
        });
      }

      // For now, assume the token has the necessary scopes since we request them during auth
      // We could add scope validation here if needed, but typically OAuth tokens maintain
      // the scopes they were granted with
      return res.json({
        success: true,
        token: {
          access_token: ytToken.access_token,
          refresh_token: ytToken.refresh_token,
          username: ytToken.username,
        },
      });
    } catch (error) {
      console.error("Error in YouTube validate:", error);
      return res.json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

//getMetaData
youtubeHandler.use("/extract", metaData);

export default youtubeHandler;
