import { Router } from "express";
import { google } from "googleapis";
import env from "dotenv";
import metaData from "./getMetaData";
import { log } from "console";
import {
  getYouTubeAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
} from "../../services/youtubeService";

env.config();

const youtubeHandler = Router();
let userTokens: any = null;

// OAuth login
youtubeHandler.get("/auth", (req, res) => {
  const authUrl = getYouTubeAuthUrl();
  res.redirect(authUrl);
});

// OAuth callback
youtubeHandler.get("/api/callback", async (req: any, res: any) => {
  const code = req.query.code;
  try {
    const tokens = await exchangeCodeForTokens(code);
    req.session.youtubeTokens = tokens;

    if (!req.session.youtubeTokens) {
      return res.status(401).json({ error: "Not authenticated with YouTube" });
    }

    const userInfo = await getUserInfo(req.session.youtubeTokens.access_token);

    // Extract just the display name (YouTube channel title)
    const channel = userInfo?.items?.[0]?.snippet?.title || "YouTube User";
    console.log(channel);

    (tokens as any).username = channel;

    req.session.youtubeTokens = tokens;

    console.log("Everything good, redirecting to the endpoint");

    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/`);
  } catch (error) {
    console.error("Error retrieving access token", error);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/`);
  }
});

youtubeHandler.post("/validate", (req: any, res: any) => {
  console.log("I am inside youtube validate");

  let ytToken = req.session.youtubeTokens || null;
  console.log(ytToken, " is the token of youtube");
  // Basic scope presence check: user must have at least youtube scope to create playlists
  const scopeString: string | undefined = (ytToken &&
    (ytToken.scope || ytToken.scopes)) as any;
  const scopes: string[] = Array.isArray(scopeString)
    ? (scopeString as any)
    : typeof scopeString === "string"
    ? scopeString.split(" ")
    : [];
  const hasYouTubeWriteScope = scopes.some((s) =>
    [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ].includes(s)
  );

  if (ytToken && hasYouTubeWriteScope) {
    return res.json({
      success: true,
      token: ytToken,
    });
  } else {
    if (ytToken && !hasYouTubeWriteScope) {
      return res.json({
        success: false,
        message:
          "YouTube permissions are insufficient. Please reconnect and grant playlist permissions.",
      });
    }
    return res.json({
      success: false,
    });
  }
});

//getMetaData
youtubeHandler.use("/extract", metaData);

export default youtubeHandler;
