"use client";

import React from "react";
import { uploadAudioFile } from "@/lib/api";
import { cn, trimFileName } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { CloudUpload, Plus } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";
import AppleMusicConnector from "./AppleMusicConnector";

export const AudioUploaderMinimal = ({ setSelectedAppleMusicTrack, selectedAppleMusicTrack }: { setSelectedAppleMusicTrack?: (track: any) => void, selectedAppleMusicTrack?: any }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const roomId = useRoomStore((state) => state.roomId);
  const posthog = usePostHog();
  const [showAppleMusic, setShowAppleMusic] = useState(false);

  const handleFileUpload = async (file: File) => {
    // Store file name for display
    setFileName(file.name);

    // Track upload initiated
    posthog.capture("upload_initiated", {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      room_id: roomId,
    });

    try {
      setIsUploading(true);

      // Upload the file to the server as binary
      await uploadAudioFile({
        file,
        roomId,
      });

      // Track successful upload
      posthog.capture("upload_success", {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        room_id: roomId,
      });

      setTimeout(() => setFileName(null), 3000);
    } catch (err) {
      console.error("Error during upload:", err);
      toast.error("Failed to upload audio file");
      setFileName(null);

      // Track upload failure
      posthog.capture("upload_failed", {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        room_id: roomId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Placeholder for Apple Music connection logic
  const handleConnectAppleMusic = () => {
    setShowAppleMusic(true);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleFileUpload(file);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const onDropEvent = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    // make sure we only allow audio files
    if (!file.type.startsWith("audio/")) {
      toast.error("Please select an audio file");
      return;
    }

    handleFileUpload(file);
  };

  return (
    <>
      <div
        className={cn(
          "border border-neutral-700/50 rounded-md mx-2 transition-all overflow-hidden bg-neutral-800/30 hover:bg-neutral-800/50",
          isDragging
            ? "outline outline-primary-400 outline-dashed"
            : "outline-none"
        )}
        id="drop_zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDragEnd={onDragLeave}
        onDrop={onDropEvent}
      >
        <label htmlFor="audio-upload" className="cursor-pointer block w-full">
          <div className="p-3 flex items-center gap-3">
            <div className="bg-primary-700 text-white p-1.5 rounded-md flex-shrink-0">
              {isUploading ? (
                <CloudUpload className="h-4 w-4 animate-pulse" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">
                {isUploading
                  ? "Uploading..."
                  : fileName
                  ? trimFileName(fileName)
                  : "Upload audio"}
              </div>
              {!isUploading && !fileName && (
                <div className="text-xs text-neutral-400 truncate">
                  Add music to queue
                </div>
              )}
            </div>
          </div>
        </label>

        <input
          id="audio-upload"
          type="file"
          accept="audio/*"
          onChange={onInputChange}
          disabled={isUploading}
          className="hidden"
        />
      </div>
      {/* Apple Music Connect Button */}
      <div className="mx-2 mt-2">
        <button
          type="button"
          onClick={handleConnectAppleMusic}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#FA2A55] text-white font-medium hover:bg-[#fa2a55cc] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="10" fill="white"/>
            <path d="M14.5 6.5L8.5 8V13.5" stroke="#FA2A55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="8.5" cy="14" r="1" fill="#FA2A55"/>
          </svg>
          Connect to Apple Music
        </button>
      </div>
      {showAppleMusic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="relative w-full max-w-md mx-auto">
            <button
              className="absolute top-2 right-2 text-white bg-neutral-700 rounded-full p-1 hover:bg-neutral-600"
              onClick={() => setShowAppleMusic(false)}
              aria-label="Close Apple Music Connector"
            >
              &times;
            </button>
            <AppleMusicConnector onTrackSelected={(track) => {
              setSelectedAppleMusicTrack?.(track);
              setShowAppleMusic(false);
            }} />
          </div>
        </div>
      )}
      {selectedAppleMusicTrack && (
        <div className="mx-2 mt-4 p-3 bg-neutral-900 rounded flex items-center gap-3">
          <img
            src={selectedAppleMusicTrack.attributes.artwork.url.replace('{w}x{h}bb', '60x60bb')}
            alt={selectedAppleMusicTrack.attributes.name}
            className="w-12 h-12 rounded object-cover"
          />
          <div>
            <div className="font-semibold">{selectedAppleMusicTrack.attributes.name}</div>
            <div className="text-sm text-neutral-300">{selectedAppleMusicTrack.attributes.artistName}</div>
            <div className="text-xs text-neutral-400">Album: {selectedAppleMusicTrack.attributes.albumName}</div>
          </div>
        </div>
      )}
    </>
  );
};
