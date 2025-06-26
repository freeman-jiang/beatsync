'use client';

import { useState } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket'; // make sure this is native WebSocket

type YouTubeVideo = {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails: {
      default: {
        url: string;
      };
    };
  };
};

export default function YouTubeSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[]>([]);

  const search = async () => {
    try {
      const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          q: query,
          part: 'snippet',
          type: 'video',
          videoCategoryId: '10',
          key: 'AIzaSyCcWwM6wKBz3o8kajqSajDjH7ONqoSqG-4', // 🔐 consider hiding in .env + API proxy
          maxResults: 10,
        },
      });

      setResults(data.items);
    } catch (error) {
      console.error('YouTube API Error:', error);
    }
  };

  const handlePlay = (videoId: string) => {
    const message = {
      type: 'YOUTUBE_SYNC',
      payload: {
        videoId,
        timestamp: 0,
        action: 'play',
      },
    };
  
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.error("❌ WebSocket not open. Cannot send message.");
    }
  };
  
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border p-2 w-full"
          placeholder="Search music video..."
        />
        <button
          onClick={search}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Search
        </button>
      </div>

      <ul className="space-y-3">
        {results.map((video) => (
          <li key={video.id.videoId} className="flex items-center gap-4 border-b pb-2">
            <img
              src={video.snippet.thumbnails.default.url}
              alt={video.snippet.title}
              className="w-16 h-16 rounded"
            />
            <div>
              <p className="font-semibold">{video.snippet.title}</p>
              <button
                onClick={() => handlePlay(video.id.videoId)}
                className="text-sm text-blue-600 hover:underline"
              >
                Play
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
