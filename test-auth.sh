#!/bin/bash

echo "🔧 Testing Backend Auth Flow..."

# Start backend in background
echo "📡 Starting backend server..."
cd backend
npm install
npm run dev &
BACKEND_PID=$!

# Wait for server to start
sleep 5

# Test environment variables
echo "🔍 Testing environment configuration..."
curl -s "http://localhost:3023/health" || echo "❌ Backend not responding"

# Test basic endpoints
echo "🧪 Testing auth endpoints..."

# Test signup
echo "📝 Testing signup..."
SIGNUP_RESPONSE=$(curl -s -X POST "http://localhost:3023/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"test123"}')

echo "Signup response: $SIGNUP_RESPONSE"

# Extract token from response
TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.token // empty')

if [ -n "$TOKEN" ]; then
  echo "✅ Signup successful, token received"
  
  # Test Spotify auth URL
  echo "🎵 Testing Spotify auth URL..."
  SPOTIFY_AUTH=$(curl -s -X GET "http://localhost:3023/spotify/auth-url" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "Spotify auth response: $SPOTIFY_AUTH"
  
  # Test YouTube auth URL
  echo "📺 Testing YouTube auth URL..."
  YOUTUBE_AUTH=$(curl -s -X GET "http://localhost:3023/youtube/auth-url" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "YouTube auth response: $YOUTUBE_AUTH"
  
else
  echo "❌ Signup failed, no token received"
fi

# Clean up
echo "🧹 Cleaning up..."
kill $BACKEND_PID 2>/dev/null

echo "✅ Test completed!"
