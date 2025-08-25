import { validateYouTubeUrl } from "./youtubeService";
import { validateSpotifyUrl } from "./spotifyService";

export type URLType = "youtube" | "spotify" | "unknown";

export interface URLValidationResult {
  type: URLType;
  isValid: boolean;
  message?: string;
}

export function validateURL(url: string): URLValidationResult {
  if (!url) {
    return {
      type: "unknown",
      isValid: false,
      message: "No URL provided",
    };
  }

  const lowerUrl = url.toLowerCase();

  if (validateYouTubeUrl(lowerUrl)) {
    return {
      type: "youtube",
      isValid: true,
      message: "YouTube URL detected",
    };
  }

  if (validateSpotifyUrl(lowerUrl)) {
    return {
      type: "spotify",
      isValid: true,
      message: "Spotify URL detected",
    };
  }

  return {
    type: "unknown",
    isValid: false,
    message:
      "Unsupported URL format. Please provide a valid YouTube or Spotify playlist URL.",
  };
}

export function getURLType(url: string): URLType {
  const validation = validateURL(url);
  return validation.type;
}
