"use client";

import { uploadAudioFile } from "@/lib/api";
import { cn, trimFileName } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { CloudUpload, Plus } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const AudioUploaderMinimal = () => {
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const roomId = useRoomStore((state) => state.roomId);
  const posthog = usePostHog();

  const handleFileUpload = async (file: File, isFromFolder?: boolean) => {
    // Store file name for display
    if (!isFromFolder) setFileName(file.name);

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

          if (!isFromFolder) setTimeout(() => setFileName(null), 3000);
          if (isFromFolder) toast.success(`Uploaded ${file.name}`);
        } catch (err) {
          console.error("Error during upload:", err);
          toast.error("Failed to upload audio file");
          if (!isFromFolder) setFileName(null);

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
        if (!isFromFolder) setFileName(null);

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
      if (!isFromFolder) setFileName(null);

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
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const currentIsFolderUpload = (event.target as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory || isFolderUpload;

    if (currentIsFolderUpload) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("audio/")) {
          handleFileUpload(files[i], true);
        } else {
          toast.error(`Skipping non-audio file: ${files[i].name}`);
        }
      }
      // Reset the input value to allow uploading the same folder again
      event.target.value = '';
      setIsFolderUpload(false); // Reset folder upload mode
    } else {
      if (files[0].type.startsWith("audio/")) {
        handleFileUpload(files[0]);
      } else {
        toast.error("Please select an audio file");
      }
    }
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
      <label htmlFor={isFolderUpload ? "folder-upload-minimal" : "audio-upload"} className="cursor-pointer block w-full">
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
      <input
        id="folder-upload-minimal"
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          // Check if files were selected (i.e., not cancelled)
          if (e.target.files && e.target.files.length > 0) {
            setIsFolderUpload(true);
            onInputChange(e);
          } else {
            // Handle cancellation or no files selected
            setIsFolderUpload(false); 
          }
        }}
        disabled={isUploading}
        webkitdirectory=""
        mozdirectory="true"
        directory="true"
      />
      {fileName && !isFolderUpload && (
        <div className="text-xs text-muted-foreground mt-2 truncate">
          {trimFileName(fileName)}
        </div>
      )}
      <div className="p-3 pt-0">
        <Button variant="outline" size="sm" className="w-full" onClick={() => {
          // Trigger click on the hidden folder input
          const folderInput = document.getElementById('folder-upload-minimal') as HTMLInputElement | null;
          if (folderInput) {
            folderInput.click();
          }
        }} disabled={isUploading}>
          <Plus className="mr-2 h-4 w-4" /> Upload Folder
        </Button>
      </div>
    </div>
  );
};
