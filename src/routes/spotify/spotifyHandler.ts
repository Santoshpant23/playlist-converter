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

const spotifyHandler = Router();

// Redirect user to Spotify login
spotifyHandler.get("/login", (req, res) => {
  const state = generateRandomString(16);
  log("I am inside /login with this state: ", state);

  const authUrl = getSpotifyAuthUrl(state);
  log("I will redirect now to authURL which is ", authUrl);

  res.redirect(authUrl);
});

// Spotify callback handler
spotifyHandler.get("/callback", async (req: any, res: any) => {
  log("I am inside callback url");
  const code = req.query.code || null;
  const state = req.query.state || null;
  log(code, " is code and state is ", state);
  if (!code) {
    return res.status(400).json({ success: false, error: "Missing code" });
  }

  try {
    log("Inside try catch");
    const tokens = await exchangeCodeForTokens(code);
    log("I did exchange above and looks like all good");

    // ✅ Save tokens to session
    log("Session updated with this token ", tokens);
    req.session.spotifyTokens = tokens;

    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
  } catch (error) {
    console.error("Error getting Spotify token:", error);
    res.status(500).json({ error: "Failed to get access token" });
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

spotifyHandler.post("/validate", async (req: any, res: any) => {
  try {
    if (!req.session.spotifyTokens) {
      return res.json({
        success: false,
      });
    }

    let spotifyToken = await getValidSpotifyToken(req.session.spotifyTokens);
    log(
      "Inside spotify validate endpoint and this is spotify token ",
      spotifyToken
    );
    if (spotifyToken) {
      return res.json({
        success: true,
        token: req.session.spotifyTokens,
      });
    }
    return res.json({
      success: false,
    });
  } catch (e: any) {
    log("Error in spotify validation:", e.message);
    res.json({
      success: false,
    });
  }
});

// Handle metadata (song extraction etc.)
spotifyHandler.use("/extract", handleMetaData);

export default spotifyHandler;
