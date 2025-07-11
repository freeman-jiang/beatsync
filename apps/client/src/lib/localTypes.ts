export interface LocalAudioSource {
  name: string;
  audioBuffer: AudioBuffer;
  id: string; // Add ID field for tracking
}

export interface RawAudioSource {
  name: string;
  audioBuffer: ArrayBuffer;
  id: string; // Optional ID for tracking downloaded audio files
}

export interface YouTubeSource {
  videoId: string;
  title: string;
  thumbnail?: string;
  channel?: string;
  duration?: string;
  addedAt: number;
  addedBy: string;
}
