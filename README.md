# Backend Refactoring Documentation

## Overview

The backend has been refactored to extract core business logic into reusable service functions while maintaining all existing endpoints. This allows for better code organization, reusability, and easier testing.

## New Service Structure

### Services Directory (`src/services/`)

The core business logic has been extracted into the following service files:

#### 1. `youtubeService.ts`

Contains all YouTube-related functionality:

- **Authentication**: `getYouTubeAuthUrl()`, `exchangeCodeForTokens()`, `getUserInfo()`
- **Playlist Extraction**: `extractPlaylistId()`, `fetchPlaylistWithApiKey()`, `fetchPlaylistWithOAuth()`, `getPlaylistMetadata()`
- **URL Validation**: `validateYouTubeUrl()`
- **Main Function**: `extractYouTubePlaylistData()` - Complete pipeline for extracting playlist data

#### 2. `spotifyService.ts`

Contains all Spotify-related functionality:

- **Authentication**: `getSpotifyAuthUrl()`, `exchangeCodeForTokens()`, `refreshAccessToken()`, `getValidSpotifyToken()`
- **Playlist Extraction**: `extractSpotifyPlaylistId()`, `extractTrackMetadata()`, `fetchSpotifyPlaylist()`
- **URL Validation**: `validateSpotifyUrl()`
- **Main Function**: `extractSpotifyPlaylistData()` - Complete pipeline for extracting playlist data

#### 3. `urlValidationService.ts`

Centralized URL validation and routing:

- **URL Validation**: `validateURL()` - Determines if URL is YouTube, Spotify, or unknown
- **Type Detection**: `getURLType()` - Returns the type of URL

## Key Improvements

### 1. Eliminated Internal API Calls

**Before**: The `/check-url` endpoint was making internal HTTP calls to other endpoints

```typescript
// Old approach - making internal API calls
const response = await axios.post(
  "http://localhost:3023/youtube/extract/api/yt/playlist-metadata",
  { url: url }
);
```

**After**: Direct function calls using extracted services

```typescript
// New approach - direct function calls
const result = await extractYouTubePlaylistData(url, tokens);
```

### 2. Reusable Functions

All core logic is now available as standalone functions that can be imported and used anywhere:

```typescript
import { extractYouTubePlaylistData } from "./services/youtubeService";
import { extractSpotifyPlaylistData } from "./services/spotifyService";
import { validateURL } from "./services/urlValidationService";

// Use anywhere in your code
const validation = validateURL(url);
if (validation.type === "youtube") {
  const data = await extractYouTubePlaylistData(url, tokens);
}
```

### 3. Better Error Handling

Services now throw meaningful errors that can be caught and handled appropriately:

```typescript
try {
  const result = await extractYouTubePlaylistData(url, tokens);
  return res.json(result);
} catch (error: any) {
  return res.json({
    success: false,
    message: error.message,
  });
}
```

## Existing Endpoints (Unchanged)

All existing endpoints remain functional and unchanged:

### YouTube Endpoints

- `GET /youtube/auth` - YouTube OAuth login
- `GET /youtube/api/callback` - YouTube OAuth callback
- `POST /youtube/validate` - Validate YouTube tokens
- `POST /youtube/extract/api/yt/playlist-metadata` - Extract YouTube playlist metadata

### Spotify Endpoints

- `GET /spotify/login` - Spotify OAuth login
- `GET /spotify/callback` - Spotify OAuth callback
- `POST /spotify/validate` - Validate Spotify tokens
- `POST /spotify/extract/` - Extract Spotify playlist metadata

### Search Endpoints

- `POST /search/youtube/search` - Search YouTube for Spotify tracks
- `POST /search/youtube/generate-playlist` - Generate YouTube playlist
- `POST /search/spotify/search` - Search Spotify for YouTube tracks
- `POST /search/spotify/make-playlist` - Generate Spotify playlist

### Main Endpoint

- `POST /check-url` - **IMPROVED**: Now uses direct function calls instead of internal API calls

## Usage Examples

### Using Services Directly

```typescript
// Validate a URL
import { validateURL } from "./services/urlValidationService";
const validation = validateURL("https://www.youtube.com/playlist?list=PL...");
console.log(validation.type); // "youtube"

// Extract YouTube playlist data
import { extractYouTubePlaylistData } from "./services/youtubeService";
const youtubeData = await extractYouTubePlaylistData(url, tokens);

// Extract Spotify playlist data
import { extractSpotifyPlaylistData } from "./services/spotifyService";
const spotifyData = await extractSpotifyPlaylistData(url, tokens);
```

### Creating New Endpoints

```typescript
// Example: New endpoint that uses services directly
app.post("/api/process-playlist", async (req, res) => {
  const { url } = req.body;
  const validation = validateURL(url);

  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    if (validation.type === "youtube") {
      const tokens = req.session.youtubeTokens;
      const result = await extractYouTubePlaylistData(url, tokens);
      return res.json(result);
    } else if (validation.type === "spotify") {
      const tokens = req.session.spotifyTokens;
      const result = await extractSpotifyPlaylistData(url, tokens);
      return res.json(result);
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
```

## Benefits

1. **No Internal API Calls**: Eliminates unnecessary HTTP overhead
2. **Reusable Code**: Services can be imported and used anywhere
3. **Better Testing**: Functions can be unit tested independently
4. **Cleaner Architecture**: Separation of concerns between routes and business logic
5. **Easier Maintenance**: Changes to core logic only need to be made in one place
6. **Type Safety**: Better TypeScript interfaces and type checking

## Migration Notes

- All existing endpoints continue to work exactly as before
- No changes required in the frontend
- The refactoring is purely internal to improve code organization
- Performance should be slightly better due to elimination of internal HTTP calls
