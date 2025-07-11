# YouTube Integration Setup

This document explains how to set up real YouTube search functionality in Beatsync.

## Getting a YouTube Data API Key

1. **Go to Google Cloud Console**
   - Visit https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select a Project**
   - Create a new project or select an existing one
   - Note the project name for reference

3. **Enable YouTube Data API v3**
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click on it and press "Enable"

4. **Create API Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key

5. **Configure the API Key (Optional but Recommended)**
   - Click on the created API key to edit it
   - Under "Application restrictions", you can:
     - Restrict to specific websites (add your domain)
     - Restrict to specific APIs (select only YouTube Data API v3)

## Setting Up the Environment Variable

1. **Create Environment File**
   ```bash
   cp .env.example .env.local
   ```

2. **Add Your API Key**
   Open `.env.local` and replace the placeholder:
   ```env
   NEXT_PUBLIC_YOUTUBE_API_KEY=your_actual_api_key_here
   ```

3. **Restart the Development Server**
   ```bash
   bun run dev
   ```

## Features

With the YouTube Data API configured, you get:

- **Real-time Search**: Search millions of YouTube videos
- **Rich Metadata**: Video duration, view counts, channel info
- **High-quality Thumbnails**: Better image quality
- **Fresh Results**: Always up-to-date content
- **Playlist Support**: Enhanced playlist parsing (coming soon)

## Fallback Mode

If no API key is configured, the app will:
- Use mock data with popular music videos
- Show a demo notice to users
- Allow basic functionality testing
- Filter mock results based on search terms

## API Quotas and Limits

- **Free Tier**: 10,000 units/day (typically enough for development)
- **Search Cost**: 100 units per search request
- **Video Details**: 1 unit per video
- **Rate Limits**: 1,000 requests per 100 seconds per user

## Troubleshooting

### "YouTube API key not found" Warning
- Check that `.env.local` exists and contains the API key
- Ensure the variable name is exactly `NEXT_PUBLIC_YOUTUBE_API_KEY`
- Restart the development server after adding the key

### "YouTube search failed: 403" Error
- Verify the API key is correct
- Check that YouTube Data API v3 is enabled
- Ensure you haven't exceeded quota limits

### "YouTube search failed: 400" Error
- Check that search queries are properly formatted
- Ensure special characters are being handled correctly

## Security Notes

- **Never commit API keys** to version control
- Use `.env.local` for local development
- Use environment variables in production
- Consider API key restrictions for production use
- Monitor usage to avoid quota exhaustion

## Cost Optimization

- **Cache Results**: Implement client-side caching for repeated searches
- **Debounce Search**: Add delays to reduce API calls while typing
- **Pagination**: Load results in batches instead of all at once
- **Monitor Usage**: Track API usage in Google Cloud Console
