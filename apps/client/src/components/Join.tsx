"use client";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { SOCIAL_LINKS } from "@/constants";
import { fetchActiveRooms } from "@/lib/api";
import { generateName } from "@/lib/randomNames";
import { validateFullRoomId, validatePartialRoomId } from "@/lib/room";
import { useRoomStore } from "@/store/room";
import { useQuery } from "@tanstack/react-query";
import { LogIn, PlusCircle, Shuffle, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { toast } from "sonner";
import { ActiveRooms } from "./ActiveRooms";
import { AnnouncementBanner } from "./AnnouncementBanner";

interface JoinFormData {
  roomId: string;
}

export const Join = () => {
  const posthog = usePostHog();
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [useCustomName, setUseCustomName] = useState(false);
  const [customUsername, setCustomUsername] = useState("");
  const setUsername = useRoomStore((state) => state.setUsername);
  const username = useRoomStore((state) => state.username);

  const {
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch,
  } = useForm<JoinFormData>({
    defaultValues: {
      roomId: "",
    },
  });

  // Watch the room code input to determine button state
  const watchedRoomId = watch("roomId");
  const hasRoomCode = watchedRoomId && watchedRoomId.length > 0;

  useEffect(() => {
    // Set a random username when component mounts (only if not using custom name)
    if (!useCustomName) {
      const generatedName = generateName();
      setUsername(generatedName);
    }
  }, [setValue, setUsername, posthog, useCustomName]);

  // Validate username
  const validateUsername = (name: string): boolean => {
    if (!name || name.trim().length === 0) return false;
    if (name.length > 50) return false;
    // Allow alphanumeric characters, spaces, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    return validPattern.test(name);
  };

  // Handle custom username change
  const handleCustomUsernameChange = (value: string) => {
    setCustomUsername(value);
    if (useCustomName && validateUsername(value)) {
      setUsername(value.trim());
    }
  };

  // Toggle between custom and auto-generated name
  const toggleNameMode = () => {
    if (useCustomName) {
      // Switching to auto-generated
      setUseCustomName(false);
      const generatedName = generateName();
      setUsername(generatedName);
      setCustomUsername("");
    } else {
      // Switching to custom
      setUseCustomName(true);
      setUsername(customUsername || "");
    }
  };

  const { data: numActiveUsers } = useQuery({
    queryKey: ["active-rooms"],
    queryFn: fetchActiveRooms,
    refetchInterval: 300, // Poll every
  });

  const router = useRouter();

  const onSubmit = (data: JoinFormData) => {
    setIsJoining(true);
    // Validate roomId
    if (!validateFullRoomId(data.roomId)) {
      toast.error("Invalid room code. Please enter 6 digits.");
      setIsJoining(false);

      // Track validation error
      posthog.capture("join_room_validation_error", {
        room_id: data.roomId,
        error: "Invalid room code",
      });
      return;
    }

    // Track join attempt
    posthog.capture("join_room_attempt", {
      room_id: data.roomId,
      username,
      username_mode: useCustomName ? "custom" : "auto_generated",
    });

    console.log("Joining room with data:", {
      roomId: data.roomId,
      username,
    });
    router.push(`/room/${data.roomId}`);
  };

  const handleCreateRoom = () => {
    setIsCreating(true);

    // Generate a random 6-digit room ID
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();

    // Track room creation
    posthog.capture("create_room", {
      room_id: newRoomId,
      username,
      username_mode: useCustomName ? "custom" : "auto_generated",
    });

    router.push(`/room/${newRoomId}`);
  };

  const handleRegenerateName = () => {
    const newName = generateName();
    setUsername(newName);

    // Track name regeneration
    posthog.capture("regenerate_username", {
      previous_username: username,
      new_username: newName,
      mode: "auto_generated",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnnouncementBanner />
      <div className="w-full px-2.5 lg:px-1 max-w-[28rem] mx-auto mt-20 lg:mt-24">
        <motion.div
          className="flex flex-col items-center justify-center p-6 bg-neutral-900 rounded-lg border border-neutral-800 shadow-xl mx-auto"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {numActiveUsers && numActiveUsers > 0 ? (
            <motion.div
              className="flex items-center gap-1.5 mb-3"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <motion.div className="relative flex items-center justify-center">
                <motion.div className="size-2 bg-green-500 rounded-full" />
                <motion.div className="absolute size-2.5 bg-green-500/30 rounded-full animate-ping" />
              </motion.div>
              <span className="text-xs text-neutral-500 ml-0.5">
                {numActiveUsers} {numActiveUsers === 1 ? "person" : "people"}{" "}
                listening now
              </span>
            </motion.div>
          ) : null}
          <motion.h2
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.13 }}
          >
            Join a Jamhood Room
          </motion.h2>

          <motion.p
            className="text-neutral-400 mb-5 text-center text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            Enter a room code to join or create a new room
          </motion.p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full">
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Controller
                control={control}
                name="roomId"
                rules={{ required: "Room code is required" }}
                render={({ field }) => (
                  <InputOTP
                    autoFocus
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    value={field.value}
                    onChange={(value) => {
                      // Only set the value if it contains only digits
                      if (validatePartialRoomId(value)) {
                        field.onChange(value);

                        // Auto-submit disabled - user must click "Join room" button
                        // if (value.length === 6 && validateFullRoomId(value) && !isJoining) {
                        //   // Small delay to ensure UI updates before submission
                        //   setTimeout(() => {
                        //     handleSubmit(onSubmit)();
                        //   }, 100);
                        // }
                      }
                    }}
                    className="gap-2"
                  >
                    <InputOTPGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="w-9 h-10 text-base bg-neutral-800/80 border-neutral-700 transition-all duration-200 
                          focus-within:border-primary/70 focus-within:bg-neutral-800 focus-within:ring-1 focus-within:ring-primary/30"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                )}
              />
            </motion.div>
            {errors.roomId && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-xs text-red-500 text-center mt-1"
              >
                {errors.roomId.message}
              </motion.p>
            )}

            <motion.div
              className="flex flex-col items-center justify-center mt-5 space-y-3"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              {/* Username Mode Toggle */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={toggleNameMode}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-neutral-500 hover:text-neutral-300 h-6 px-2"
                  disabled={isJoining || isCreating}
                >
                  {useCustomName ? (
                    <>
                      <Shuffle className="w-3 h-3 mr-1" />
                      Auto
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 mr-1" />
                      Custom
                    </>
                  )}
                </Button>
                {!useCustomName && (
                  <Button
                    type="button"
                    onClick={handleRegenerateName}
                    variant="ghost"
                    size="sm"
                    className="text-xs text-neutral-500 hover:text-neutral-300 h-6 px-2"
                    disabled={isJoining || isCreating}
                  >
                    <Shuffle className="w-3 h-3 mr-1" />
                    Shuffle
                  </Button>
                )}
              </div>

              {/* Username Display/Input */}
              {useCustomName ? (
                <div className="w-full max-w-xs">
                  <Input
                    type="text"
                    placeholder="Enter custom room name"
                    value={customUsername}
                    onChange={(e) => handleCustomUsernameChange(e.target.value)}
                    className="text-center text-sm bg-neutral-800/50 border-neutral-700 focus:border-primary/70 text-white placeholder:text-neutral-500"
                    maxLength={50}
                    disabled={isJoining || isCreating}
                  />
                  {customUsername && !validateUsername(customUsername) && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="text-xs text-red-500 text-center mt-1"
                    >
                      Name must be 1-50 characters, letters, numbers, spaces, hyphens, and underscores only
                    </motion.p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-neutral-400">
                  You&apos;ll join as{" "}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={username}
                      className="text-primary font-medium inline-block"
                      initial={{
                        opacity: 0,
                        filter: "blur(8px)",
                      }}
                      animate={{
                        opacity: 1,
                        filter: "blur(0px)",
                      }}
                      exit={{
                        opacity: 0,
                        filter: "blur(8px)",
                      }}
                      transition={{
                        duration: 0.2,
                      }}
                    >
                      {username}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}
            </motion.div>

            <div className="flex flex-col gap-3 mt-5">
              {hasRoomCode ? (
                // Join Room Button - when room code is entered
                <motion.button
                  type="submit"
                  className="px-0.5 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full font-medium text-xs tracking-wide cursor-pointer w-auto flex items-center justify-center shadow-lg hover:bg-white/20 transition-all duration-300"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{
                    scale: 1.02,
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.3 }}
                  disabled={isJoining || isCreating}
                >
                  {isJoining ? (
                    <motion.div
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                    >
                      <LogIn size={16} className="mr-2" />
                    </motion.div>
                  ) : (
                    <LogIn size={16} className="mr-2" />
                  )}
                  <span>{isJoining ? "Joining..." : "Join room"}</span>
                </motion.button>
              ) : (
                // Create Room Button - when no room code is entered
                <motion.button
                  type="button"
                  className="px-0.5 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full font-medium text-xs tracking-wide cursor-pointer w-auto flex items-center justify-center shadow-lg hover:bg-white/20 transition-all duration-300"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{
                    scale: 1.02,
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.3 }}
                  onClick={handleCreateRoom}
                  disabled={isJoining || isCreating}
                >
                  {isCreating ? (
                    <motion.div
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                    >
                      <PlusCircle size={16} className="mr-2" />
                    </motion.div>
                  ) : (
                    <PlusCircle size={16} className="mr-2" />
                  )}
                  <span>{isCreating ? "Creating..." : "Create new room"}</span>
                </motion.button>
              )}
            </div>
          </form>

          <motion.p
            className="text-neutral-500 mt-5 text-center text-xs leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            Use native device speakers.
          </motion.p>

          {/* Divider */}
          <motion.div
            className="w-full h-px bg-neutral-800 my-4"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          />

          {/* Social links */}
          <motion.div
            className="flex items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <a
              href={SOCIAL_LINKS.discord}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs"
            >
              <FaDiscord className="size-[17px]" />
              <span>Join Community</span>
            </a>
            <div className="w-px h-4 bg-neutral-700" />
            <a
              href={SOCIAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs"
            >
              <FaGithub className="size-4" />
              <span>GitHub</span>
            </a>
          </motion.div>
        </motion.div>

        {/* Active Rooms Section */}
        <ActiveRooms />
      </div>
    </motion.div>
  );
};
