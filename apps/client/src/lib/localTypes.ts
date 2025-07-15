
export interface YouTubeSource {
  videoId: string;
  title: string;
  thumbnail?: string;
  channel?: string;
  duration?: string;
  addedAt: number;
  addedBy: string;
}

export interface LocalAudioSource {
  id: string;
  url: string;
  name?: string;
  audioBuffer?: AudioBuffer;
  duration?: number;
}

export interface RawAudioSource {
  id: string;
  name: string;
  audioBuffer: ArrayBuffer;
}
