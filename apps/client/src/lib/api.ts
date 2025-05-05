import { DownloadTrackType, UploadAudioType } from "@beatsync/shared";
import type { DABTrack as Track, Pagination } from "@beatsync/shared/types/schemas/dab"
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
if (!BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not set");
}

const baseAxios = axios.create({
  baseURL: BASE_URL,
});

export const uploadAudioFile = async (data: UploadAudioType) => {
  try {
    const response = await baseAxios.post<{
      success: boolean;
      filename: string;
      path: string;
      size: number;
    }>("/upload", data);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Failed to upload audio file"
      );
    }
    throw error;
  }
};

export const fetchAudio = async (id: string) => {
  try {
    const response = await fetch(`${BASE_URL}/audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      console.error(`RESPONSE NOT OK`);
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Failed to fetch audio");
    }
    throw error;
  }
};

export const searchTracks = async (query: string, offset: number): Promise<{tracks: Track[], pagination: Pagination}> => {
  const response = await fetch(`${BASE_URL}/search?query=${query}&offset=${offset}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`RESPONSE NOT OK`);
    throw new Error(`Failed to search tracks: ${response.statusText}`);
  }

  return await response.json();
}

export const downloadTrack = async (payload: DownloadTrackType) => {
  const response = await fetch(`${BASE_URL}/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to download track: ${response.statusText}`);
  }

  return response.json();
}