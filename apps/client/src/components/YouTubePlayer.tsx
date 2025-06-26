'use client';

import { useEffect, useRef, useState } from 'react';
import YouTube, { YouTubePlayer } from 'react-youtube';
import { socket } from '@/lib/socket';

type YouTubeSyncPayload = {
  videoId: string;
  timestamp: number;
  action: 'play' | 'pause' | 'seek';
};

export default function YouTubePlayer() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [syncPayload, setSyncPayload] = useState<YouTubeSyncPayload | null>(null);

  useEffect(() => {
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket received:', data);

        if (data.type === 'YOUTUBE_SYNC') {
          const payload = data.payload as YouTubeSyncPayload;
          console.log('Payload:', payload);

          setCurrentVideoId(payload.videoId);
          setSyncPayload(payload); // Store for onReady
        }
      } catch (err) {
        console.error('Invalid WS message:', event.data);
      }
    };
  }, []);

  const onReady = (event: { target: YouTubePlayer }) => {
    playerRef.current = event.target;

    if (syncPayload) {
      const player = event.target;

      // Wait a short moment to ensure video is loaded
      setTimeout(() => {
        player.seekTo(syncPayload.timestamp || 0, true);
        if (syncPayload.action === 'play') {
          player.playVideo();
        } else if (syncPayload.action === 'pause') {
          player.pauseVideo();
        }
      }, 500);
    }
  };

  return (
    <div className="mt-6">
      {currentVideoId && (
        <YouTube
          videoId={currentVideoId}
          opts={{
            height: '360',
            width: '640',
            playerVars: {
              autoplay: 1,
              controls: 1,
              mute: 1, // ✅ Important: browsers block autoplay unless muted
            },
          }}
          onReady={onReady}
        />
      )}
    </div>
  );
}
