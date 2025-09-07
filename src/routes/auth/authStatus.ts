import { Router } from "express";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { UserTokens } from "../../models/User";

const authStatus = Router();

// Combined auth status endpoint - returns everything in one call
authStatus.get(
  "/status",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      const userId = req.user!.id;

      // Get user and tokens in parallel
      const [userTokens] = await Promise.all([
        UserTokens.findOne({ userId }).select("youtubeTokens spotifyTokens"),
      ]);

      // Check token validity without making external API calls
      const now = Date.now();

      const youtube = {
        connected: false,
        username: undefined as string | undefined,
        expires_at: undefined as Date | undefined,
        expired: false,
      };

      const spotify = {
        connected: false,
        username: undefined as string | undefined,
        expires_at: undefined as Date | undefined,
        expired: false,
      };

      // Check YouTube tokens
      if (userTokens?.youtubeTokens) {
        const yt = userTokens.youtubeTokens;
        youtube.connected = !!(yt.access_token && yt.refresh_token);
        youtube.username = yt.username;
        youtube.expires_at = yt.expires_at;
        youtube.expired = yt.expires_at ? now > yt.expires_at.getTime() : false;
      }

      // Check Spotify tokens
      if (userTokens?.spotifyTokens) {
        const sp = userTokens.spotifyTokens;
        spotify.connected = !!(sp.access_token && sp.refresh_token);
        spotify.username = sp.username;
        spotify.expires_at = sp.expires_at;
        spotify.expired = sp.expires_at ? now > sp.expires_at.getTime() : false;
      }

      return res.json({
        success: true,
        user: {
          id: req.user!.id,
          username: req.user!.username,
          email: req.user!.email,
        },
        platforms: {
          youtube,
          spotify,
        },
      });
    } catch (error: any) {
      console.error("Auth status error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get auth status",
      });
    }
  }
);

export default authStatus;
