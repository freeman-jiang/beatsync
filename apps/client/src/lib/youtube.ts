// YouTube Data API service
// You'll need to get a YouTube Data API key from Google Cloud Console
// and add it to your environment variables as YOUTUBE_API_KEY

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

// YouTube Data API types
interface YouTubeSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    description: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface YouTubeVideoDetails {
  id: string;
  contentDetails: {
    duration: string;
  };
  statistics: {
    viewCount: string;
  };
  snippet?: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    description: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  publishedAt: string;
  description?: string;
}

// Convert YouTube duration format (PT4M13S) to readable format (4:13)
function formatDuration(duration: string): string {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return '0:00';
  
  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');
  
  if (hours) {
    return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
  } else {
    return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
  }
}

// Format view count to readable format (1234567 -> 1.2M views)
function formatViewCount(viewCount: string): string {
  const count = parseInt(viewCount);
  if (count >= 1000000000) {
    return `${(count / 1000000000).toFixed(1)}B views`;
  } else if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  } else {
    return `${count} views`;
  }
}

// Format published date to relative time
function formatPublishedAt(publishedAt: string): string {
  const date = new Date(publishedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 1) {
    return 'Today';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)} months ago`;
  } else {
    return `${Math.floor(diffDays / 365)} years ago`;
  }
}

export async function searchYouTubeVideos(query: string, maxResults: number = 12): Promise<YouTubeSearchResult[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn('YouTube API key not found. Using mock data.');
    return getMockSearchResults(query);
  }

  try {
    // Step 1: Search for videos
    const searchUrl = `${YOUTUBE_API_BASE_URL}/search?` +
      `part=snippet&` +
      `q=${encodeURIComponent(query)}&` +
      `type=video&` +
      `maxResults=${maxResults}&` +
      `key=${YOUTUBE_API_KEY}`;

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`YouTube search failed: ${searchResponse.status}`);
    }

    const searchData: { items: YouTubeSearchItem[] } = await searchResponse.json();
    const videoIds = searchData.items.map((item: YouTubeSearchItem) => item.id.videoId);

    if (videoIds.length === 0) {
      return [];
    }

    // Step 2: Get video details (duration, view count, etc.)
    const detailsUrl = `${YOUTUBE_API_BASE_URL}/videos?` +
      `part=contentDetails,statistics&` +
      `id=${videoIds.join(',')}&` +
      `key=${YOUTUBE_API_KEY}`;

    const detailsResponse = await fetch(detailsUrl);
    if (!detailsResponse.ok) {
      throw new Error(`YouTube details failed: ${detailsResponse.status}`);
    }

    const detailsData: { items: YouTubeVideoDetails[] } = await detailsResponse.json();

    // Step 3: Combine search results with details
    const results: YouTubeSearchResult[] = searchData.items.map((item: YouTubeSearchItem) => {
      const details = detailsData.items.find((d: YouTubeVideoDetails) => d.id === item.id.videoId);
      
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        duration: details ? formatDuration(details.contentDetails.duration) : '0:00',
        viewCount: details ? formatViewCount(details.statistics.viewCount) : '0 views',
        publishedAt: formatPublishedAt(item.snippet.publishedAt),
        description: item.snippet.description,
      };
    });

    return results;
  } catch (error) {
    console.error('YouTube API error:', error);
    // Fallback to mock data if API fails
    return getMockSearchResults(query);
  }
}

// Mock data for development or when API key is not available
function getMockSearchResults(query: string): YouTubeSearchResult[] {
  const mockResults: YouTubeSearchResult[] = [
    {
      id: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      channelTitle: "Rick Astley",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      duration: "3:33",
      viewCount: "1.4B views",
      publishedAt: "13 years ago"
    },
    {
      id: "fJ9rUzIMcZQ",
      title: "Queen - Bohemian Rhapsody (Official Video Remastered)",
      channelTitle: "Queen Official",
      thumbnail: "https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg",
      duration: "5:55",
      viewCount: "1.8B views",
      publishedAt: "13 years ago"
    },
    {
      id: "kJQP7kiw5Fk",
      title: "Despacito",
      channelTitle: "Luis Fonsi",
      thumbnail: "https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg",
      duration: "4:42",
      viewCount: "8.1B views",
      publishedAt: "6 years ago"
    },
    {
      id: "9bZkp7q19f0",
      title: "PSY - GANGNAM STYLE(강남스타일) M/V",
      channelTitle: "officialpsy",
      thumbnail: "https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg",
      duration: "4:12",
      viewCount: "4.8B views",
      publishedAt: "12 years ago"
    },
    {
      id: "JGwWNGJdvx8",
      title: "Ed Sheeran - Shape of You (Official Music Video)",
      channelTitle: "Ed Sheeran",
      thumbnail: "https://img.youtube.com/vi/JGwWNGJdvx8/mqdefault.jpg",
      duration: "3:53",
      viewCount: "5.9B views",
      publishedAt: "7 years ago"
    },
    {
      id: "YQHsXMglC9A",
      title: "Adele - Hello (Official Music Video)",
      channelTitle: "Adele",
      thumbnail: "https://img.youtube.com/vi/YQHsXMglC9A/mqdefault.jpg",
      duration: "6:07",
      viewCount: "3.2B views",
      publishedAt: "8 years ago"
    }
  ];

  // Filter results based on query (simple text matching)
  if (query.trim()) {
    const filtered = mockResults.filter(result => 
      result.title.toLowerCase().includes(query.toLowerCase()) ||
      result.channelTitle.toLowerCase().includes(query.toLowerCase())
    );
    return filtered.length > 0 ? filtered : mockResults.slice(0, 3);
  }

  return mockResults;
}

export async function getYouTubeVideoDetails(videoId: string): Promise<YouTubeSearchResult | null> {
  if (!YOUTUBE_API_KEY) {
    console.warn('YouTube API key not found. Using mock data.');
    const mockResults = getMockSearchResults('');
    return mockResults.find(r => r.id === videoId) || null;
  }

  try {
    const url = `${YOUTUBE_API_BASE_URL}/videos?` +
      `part=snippet,contentDetails,statistics&` +
      `id=${videoId}&` +
      `key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube API failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.items.length === 0) {
      return null;
    }

    const item = data.items[0];
    return {
      id: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
      duration: formatDuration(item.contentDetails.duration),
      viewCount: formatViewCount(item.statistics.viewCount),
      publishedAt: formatPublishedAt(item.snippet.publishedAt),
      description: item.snippet.description,
    };
  } catch (error) {
    console.error('YouTube API error:', error);
    return null;
  }
}
