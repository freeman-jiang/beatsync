"use client";

import { uploadAudioFile } from "@/lib/api";
import { cn, trimFileName } from "@/lib/utils";
import { useCanMutate } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { CloudUpload, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const AudioUploaderMinimal = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const canMutate = useCanMutate();
  const roomId = useRoomStore((state) => state.roomId);

  const isDisabled = !canMutate;

  const handleFileUpload = async (files: File[]) => {
    if (isDisabled || files.length === 0) return;

    try {
      setIsUploading(true);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({
          current: i + 1,
          total: files.length,
          fileName: file.name,
        });

        try {
          // Upload the file to the server as binary
          await uploadAudioFile({
            file,
            roomId,
          });
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (files.length > 1) {
        toast.success(`Successfully uploaded ${files.length} files`);
      }

      setTimeout(() => setUploadProgress(null), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isDisabled) return;
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    // Filter to only audio files
    const audioFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith("audio/"),
    );

    if (audioFiles.length === 0) {
      toast.error("Please select audio files");
      event.target.value = "";
      return;
    }

    if (audioFiles.length < fileList.length) {
      toast.warning(
        `Only uploading ${audioFiles.length} audio file${audioFiles.length > 1 ? "s" : ""} (${fileList.length - audioFiles.length} non-audio file${fileList.length - audioFiles.length > 1 ? "s" : ""} skipped)`,
      );
    }

    handleFileUpload(audioFiles);

    // Reset the input so the same files can be selected again
    event.target.value = "";
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const onDropEvent = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const fileList = event.dataTransfer?.files;
    if (!fileList || fileList.length === 0) return;

    // Filter to only audio files
    const audioFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith("audio/"),
    );

    if (audioFiles.length === 0) {
      toast.error("Please select audio files");
      return;
    }

    if (audioFiles.length < fileList.length) {
      toast.warning(
        `Only uploading ${audioFiles.length} audio file${audioFiles.length > 1 ? "s" : ""} (${fileList.length - audioFiles.length} non-audio file${fileList.length - audioFiles.length > 1 ? "s" : ""} skipped)`,
      );
    }

    handleFileUpload(audioFiles);
  };

  return (
    <div
      className={cn(
        "border border-neutral-700/50 rounded-md mx-2 transition-all overflow-hidden",
        isDisabled
          ? "bg-neutral-800/20 opacity-50"
          : "bg-neutral-800/30 hover:bg-neutral-800/50",
        isDragging && !isDisabled
          ? "outline outline-primary-400 outline-dashed"
          : "outline-none",
      )}
      id="drop_zone"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnd={onDragLeave}
      onDrop={onDropEvent}
      title={
        isDisabled ? "Admin-only mode - only admins can upload" : undefined
      }
    >
      <label
        htmlFor="audio-upload"
        className={cn("block w-full", isDisabled ? "" : "cursor-pointer")}
      >
        <div className="p-3 flex items-center gap-3">
          <div
            className={cn(
              "p-1.5 rounded-md flex-shrink-0",
              isDisabled
                ? "bg-neutral-600 text-neutral-400"
                : "bg-primary-700 text-white",
            )}
          >
            {isUploading ? (
              <CloudUpload className="h-4 w-4 animate-pulse" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">
              {isUploading && uploadProgress
                ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}...`
                : uploadProgress
                  ? uploadProgress.total > 1
                    ? `Uploaded ${uploadProgress.total} files`
                    : trimFileName(uploadProgress.fileName)
                  : "Upload audio"}
            </div>
            {!isUploading && !uploadProgress && (
              <div
                className={cn(
                  "text-xs truncate",
                  isDisabled ? "text-neutral-500" : "text-neutral-400",
                )}
              >
                {isDisabled
                  ? "Must be an admin to upload"
                  : "Add music to queue (multi-select supported)"}
              </div>
            )}
            {isUploading && uploadProgress && (
              <div className="text-xs text-neutral-400 truncate">
                {trimFileName(uploadProgress.fileName)}
              </div>
            )}
          </div>
        </div>
      </label>

      <input
        id="audio-upload"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/ogg,audio/webm,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        onChange={onInputChange}
        disabled={isUploading || isDisabled}
        className="hidden"
        multiple
      />
    </div>
  );
};
