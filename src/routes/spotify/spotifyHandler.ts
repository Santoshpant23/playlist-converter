// spotifyHandler.ts
import { Router } from "express";
import handleMetaData from "./handleMetaData";
import { log } from "console";
import {
  generateRandomString,
  getSpotifyAuthUrl,
  exchangeCodeForTokens,
  getValidSpotifyToken,
} from "../../services/spotifyService";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { UserTokens } from "../../models/User";

const spotifyHandler = Router();

// Get Spotify auth URL (for frontend to initiate OAuth)
spotifyHandler.get(
  "/auth-url",
  authenticateToken as any,
  (req: AuthRequest, res: any) => {
    // Include user ID in state for callback verification
    const state = Buffer.from(
      JSON.stringify({
        userId: req.user!.id,
        random: generateRandomString(16),
      })
    ).toString("base64");

    log("Generating Spotify auth URL for user:", req.user!.id);

    const authUrl = getSpotifyAuthUrl(state);
    res.json({ authUrl });
  }
);

// Direct Spotify OAuth redirect (requires user to be logged in)
spotifyHandler.get(
  "/login",
  authenticateToken as any,
  (req: AuthRequest, res: any) => {
    // Generate state with user ID for callback verification
    const state = Buffer.from(
      JSON.stringify({
        userId: req.user!.id,
        random: generateRandomString(16),
      })
    ).toString("base64");

    // Redirect directly to Spotify OAuth
    log("I am calling getSpotifyAuthURL below");
    const authUrl = getSpotifyAuthUrl(state);
    log("The auth url is ", authUrl);
    res.redirect(authUrl);
  }
);

// Spotify callback handler
spotifyHandler.get("/callback", async (req: any, res: any) => {
  log("Inside Spotify callback");
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!code) {
    return res.status(400).json({ success: false, error: "Missing code" });
  }

  if (!state) {
    return res
      .status(400)
      .json({ success: false, error: "Missing state parameter" });
  }

  try {
    // Verify state parameter to get user ID
    let userId: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      userId = stateData.userId;
    } catch {
      return res.status(400).json({ error: "Invalid state parameter" });
    }

    log("Exchanging code for tokens");
    const tokens = await exchangeCodeForTokens(code);
    log("Token exchange successful");

    // Spotify tokens typically expire in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save or update tokens in database
    await UserTokens.findOneAndUpdate(
      { userId },
      {
        userId,
        spotifyTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          username: tokens.username,
        },
      },
      { upsert: true, new: true }
    );

    log("Spotify tokens saved successfully");

    res.redirect(process.env.FRONTEND_URL || "https://ytify-bay.vercel.app");
  } catch (error) {
    console.error("Error getting Spotify token:", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "https://ytify-bay.vercel.app"
      }/?error=spotify_auth_failed`
    );
  }
});

// Example test endpoint to check if token works
// spotifyHandler.get("/token", async (req, res) => {
//   try {
//     const access_token = await getValidSpotifyToken(req);
//     res.json({ access_token });
//   } catch (error: any) {
//     res.status(401).json({ error: error.message });
//   }
// });

spotifyHandler.post(
  "/validate",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      console.log("Inside Spotify validate for user:", req.user!.id);

      // Get user tokens from database
      const userTokens = await UserTokens.findOne({ userId: req.user!.id });
      const spotifyTokens = userTokens?.spotifyTokens || null;

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

      // Try to validate the token by making a request or refreshing if needed
      try {
        const tokenData = {
          access_token: spotifyTokens.access_token,
          refresh_token: spotifyTokens.refresh_token,
          expires_at: spotifyTokens.expires_at
            ? spotifyTokens.expires_at.getTime()
            : 0,
          username: spotifyTokens.username || "",
        };

        const tokenResult = await getValidSpotifyToken(tokenData);

        log("Spotify token validation result:", !!tokenResult);

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

        if (tokenResult) {
          return res.json({
            success: true,
            token: tokenData,
          });
        }

        return res.json({
          success: false,
          message: "Invalid Spotify token. Please reconnect.",
        });
      } catch (tokenError) {
        log("Token validation error:", tokenError);
        return res.json({
          success: false,
          message: "Spotify token validation failed. Please reconnect.",
        });
      }
    } catch (e: any) {
      log("Error in spotify validation:", e.message);
      res.json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Handle metadata (song extraction etc.)
spotifyHandler.use("/extract", handleMetaData);

export default spotifyHandler;
