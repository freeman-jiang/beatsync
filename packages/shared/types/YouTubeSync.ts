export interface YouTubeSync {
  videoId: string;
  timestamp: number;
  action: 'play' | 'pause' | 'seek';
}
