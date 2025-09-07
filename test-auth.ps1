# PowerShell script to test auth flow
Write-Host "🔧 Testing Spotify Auth Configuration..." -ForegroundColor Green

# Check if backend is running
Write-Host "📡 Testing backend connection..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:3023/health" -Method Get
    Write-Host "✅ Backend is running!" -ForegroundColor Green
    Write-Host "Spotify configured: $($healthResponse.spotify.configured)" -ForegroundColor Cyan
    Write-Host "YouTube configured: $($healthResponse.youtube.configured)" -ForegroundColor Cyan
    Write-Host "MongoDB connected: $($healthResponse.mongodb.connected)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Backend not running or not responding" -ForegroundColor Red
    Write-Host "Please start backend with: npm run dev" -ForegroundColor Yellow
    exit 1
}

# Test user signup
Write-Host "`n📝 Testing user signup..." -ForegroundColor Yellow
$signupData = @{
    username = "testuser$(Get-Random)"
    email = "test$(Get-Random)@example.com"
    password = "test123456"
} | ConvertTo-Json

try {
    $signupResponse = Invoke-RestMethod -Uri "http://localhost:3023/auth/signup" -Method Post -Body $signupData -ContentType "application/json"
    
    if ($signupResponse.success) {
        Write-Host "✅ Signup successful!" -ForegroundColor Green
        $token = $signupResponse.token
        
        # Test Spotify auth URL
        Write-Host "`n🎵 Testing Spotify auth URL generation..." -ForegroundColor Yellow
        $headers = @{ "Authorization" = "Bearer $token" }
        
        try {
            $spotifyAuthResponse = Invoke-RestMethod -Uri "http://localhost:3023/spotify/auth-url" -Method Get -Headers $headers
            Write-Host "✅ Spotify auth URL generated successfully!" -ForegroundColor Green
            Write-Host "Auth URL: $($spotifyAuthResponse.authUrl.Substring(0, 80))..." -ForegroundColor Cyan
        } catch {
            Write-Host "❌ Failed to get Spotify auth URL" -ForegroundColor Red
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Test YouTube auth URL
        Write-Host "`n📺 Testing YouTube auth URL generation..." -ForegroundColor Yellow
        try {
            $youtubeAuthResponse = Invoke-RestMethod -Uri "http://localhost:3023/youtube/auth-url" -Method Get -Headers $headers
            Write-Host "✅ YouTube auth URL generated successfully!" -ForegroundColor Green
            Write-Host "Auth URL: $($youtubeAuthResponse.authUrl.Substring(0, 80))..." -ForegroundColor Cyan
        } catch {
            Write-Host "❌ Failed to get YouTube auth URL" -ForegroundColor Red
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "❌ Signup failed: $($signupResponse.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Signup request failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Auth flow test completed!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Start frontend: cd ytify && npm run dev" -ForegroundColor White
Write-Host "2. Open browser: http://localhost:5173" -ForegroundColor White
Write-Host "3. Test the full auth flow in the UI" -ForegroundColor White
