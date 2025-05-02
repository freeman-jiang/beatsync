"use client";

import { uploadAudioFile } from "@/lib/api";
import { cn, trimFileName } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { CloudUpload, Plus } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

export const AudioUploaderMinimal = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const roomId = useRoomStore((state) => state.roomId);
  const posthog = usePostHog();

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

      // Read file as base64
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result?.toString().split(",")[1];
          if (!base64Data) throw new Error("Failed to convert file to base64");

          // Upload the file to the server
          await uploadAudioFile({
            name: file.name,
            audioData: base64Data,
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

      reader.onerror = () => {
        toast.error("Failed to read file");
        setIsUploading(false);
        setFileName(null);

        // Track file read error
        posthog.capture("upload_failed", {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          room_id: roomId,
          error: "Failed to read file",
        });
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Error:", err);
      toast.error("Failed to process file");
      setIsUploading(false);
      setFileName(null);

      // Track upload processing error
      posthog.capture("upload_failed", {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        room_id: roomId,
        error: err instanceof Error ? err.message : "Unknown processing error",
      });
    }
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
  );
};
