"use client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SOCIAL_LINKS } from "@/constants";
import { fetchActiveRooms } from "@/lib/api";
import { generateName } from "@/lib/randomNames";
import { validateFullRoomId, validatePartialRoomId } from "@/lib/room";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/store/room";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
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
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [makePrivate, setMakePrivate] = useState(false);
  const [createPin, setCreatePin] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const setUsername = useRoomStore((state) => state.setUsername);
  const username = useRoomStore((state) => state.username);

  const {
    handleSubmit,
    formState: { errors },
    control,
    setValue,
  } = useForm<JoinFormData>({
    defaultValues: {
      roomId: "",
    },
  });

  useEffect(() => {
    // Set a random username when component mounts
    const generatedName = generateName();
    setUsername(generatedName);
  }, [setValue, setUsername]);

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
      return;
    }

    console.log("Joining room with data:", {
      roomId: data.roomId,
      username,
    });
    router.push(`/room/${data.roomId}`);
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    setMakePrivate(false);
    setCreatePin("");
    setCreateError(null);
  };

  const handleConfirmCreate = () => {
    if (makePrivate) {
      if (!/^\d{6}$/.test(createPin)) {
        setCreateError("PIN must be exactly 6 digits");
        return;
      }
    }

    setIsCreating(true);

    // Generate a random 6-digit room ID
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();

    if (makePrivate) {
      sessionStorage.setItem(`room-password-${newRoomId}`, createPin);
      sessionStorage.setItem(`password-verified-${newRoomId}`, "true");
    }

    router.push(`/room/${newRoomId}`);
  };

  const handleRegenerateName = () => {
    const newName = generateName();
    setUsername(newName);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
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
                {numActiveUsers} {numActiveUsers === 1 ? "person" : "people"} listening now
              </span>
            </motion.div>
          ) : null}
          <motion.h2
            className="text-base font-medium tracking-tight mb-1 text-white"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.13 }}
          >
            Join a Beatsync Room
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

                        // Auto-submit when 6 digits are entered
                        if (value.length === 6) {
                          // handleSubmit(onSubmit)();
                          // Small delay to ensure UI updates before submission
                          setTimeout(() => {
                            handleSubmit(onSubmit)();
                          }, 100);
                        }
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
              className="flex items-center justify-center mt-5"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
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
              <Button
                type="button"
                onClick={handleRegenerateName}
                variant="ghost"
                className="text-xs text-neutral-500 hover:text-neutral-300 ml-2 h-6 px-2"
                disabled={isJoining || isCreating}
              >
                Regenerate
              </Button>
            </motion.div>

            <div className="flex flex-col gap-3 mt-5">
              <motion.button
                type="button"
                className="px-5 py-2 bg-primary text-primary-foreground rounded-full font-medium text-sm tracking-wide cursor-pointer w-full hover:shadow-lg hover:shadow-zinc-50/50 transition-shadow duration-500 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{
                  scale: 1.015,
                }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.3 }}
                onClick={handleOpenCreateModal}
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

              {/* <motion.button
                  className="px-5 py-2 rounded-full font-medium text-sm tracking-wide cursor-pointer w-full hover:shadow-md hover:shadow-zinc-600/40 transition-shadow duration-500 flex items-center justify-center bg-neutral-800 text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{
                    scale: 1.015,
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
                </motion.button> */}
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

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/80"
            >
              <div className="flex items-center gap-2 mb-2">
                <PlusCircle className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-white">Create a Sync Room</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-6">
                Generate a new shared listening space. You can make it private to prevent random users from joining.
              </p>

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/50 border border-neutral-800 mb-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-white">Private Room</span>
                  <span className="text-[11px] text-neutral-500">Require a 6-digit PIN to join</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMakePrivate(!makePrivate);
                    setCreateError(null);
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 outline-none cursor-pointer",
                    makePrivate ? "bg-primary" : "bg-neutral-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-neutral-950 transition-transform duration-200",
                      makePrivate ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* PIN Input field */}
              <AnimatePresence>
                {makePrivate && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-4">
                      <label htmlFor="create-pin-input" className="block text-xs font-semibold text-neutral-400 mb-1.5">
                        6-Digit Room PIN
                      </label>
                      <input
                        id="create-pin-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="e.g. 123456"
                        value={createPin}
                        onChange={(e) => {
                          setCreatePin(e.target.value.replace(/\D/g, "").slice(0, 6));
                          setCreateError(null);
                        }}
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal outline-none focus:border-primary/60 transition-colors"
                      />
                      {createError && <p className="mt-1.5 text-[11px] text-red-400">{createError}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Buttons */}
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleConfirmCreate}
                  disabled={isCreating}
                  className="flex-1 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold py-2.5 transition-all cursor-pointer flex items-center justify-center"
                >
                  {isCreating ? "Creating..." : "Create Room"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="flex-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-semibold py-2.5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
