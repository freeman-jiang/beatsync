"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useStateTransition } from "@/hooks/useStateTransition";
import { countryCodeEmoji } from "@/lib/country/countryCode";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { formatChatTimestamp } from "@/utils/time";
import { ChevronDown, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants
const MESSAGE_GROUP_TIME_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const TIMESTAMP_GAP_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute
const TEXTAREA_MAX_HEIGHT_PX = 120;
const TEXTAREA_MIN_HEIGHT_PX = 36;

export const Chat = () => {
  const [message, setMessage] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [inputAreaHeight, setInputAreaHeight] = useState(60); // Default height for input area
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [messageCountSnapshot, setMessageCountSnapshot] = useState(0);

  const currentMessages = useChatStore((state) => state.messages);
  const sendChatMessage = useGlobalStore((state) => state.sendChatMessage);
  const currentUser = useGlobalStore((state) => state.currentUser);

  // Calculate new messages since user started scrolling
  const newMessageCount = isUserScrolling ? currentMessages.length - messageCountSnapshot : 0;

  // State transition detection: Capture message count when scrolling starts
  const handleScrollTransition = (wasScrolling: boolean, isScrolling: boolean) => {
    if (!wasScrolling && isScrolling) {
      // User started scrolling - snapshot the current message count
      setMessageCountSnapshot(currentMessages.length);
    } else if (wasScrolling && !isScrolling) {
      // User stopped scrolling - update snapshot to current count
      setMessageCountSnapshot(currentMessages.length);
    }
  };

  useStateTransition({
    trackedValue: isUserScrolling,
    onTransition: handleScrollTransition,
  });

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const scrollContainer = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior,
        });
        // Reset scrolling state and update all refs consistently
        setIsUserScrolling(false);
        setMessageCountSnapshot(currentMessages.length);
        prevMessageCountRef.current = currentMessages.length;
      }
    },
    [currentMessages.length]
  );

  // Auto-scroll to bottom when new messages arrive (only if not manually scrolling)
  useEffect(() => {
    // Only auto-scroll if new messages were actually added
    const hasNewMessages = currentMessages.length > prevMessageCountRef.current;

    if (hasNewMessages) {
      if (!isUserScrolling) {
        // Use queueMicrotask to avoid synchronous setState in effect body
        queueMicrotask(() => scrollToBottom("smooth"));
      } else {
        // Update prevMessageCountRef even when scrolling to track total messages
        prevMessageCountRef.current = currentMessages.length;
      }
    }
  }, [currentMessages, isUserScrolling, scrollToBottom]);

  // Scroll to bottom on mount
  useEffect(() => {
    // Use queueMicrotask to avoid synchronous setState in effect body
    queueMicrotask(() => scrollToBottom("auto"));
  }, [scrollToBottom]);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");

    if (!scrollContainer) return;

    const handleScroll = () => {
      const isAtBottom =
        Math.abs(scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop) < 300; // Small threshold for float precision

      setIsUserScrolling(!isAtBottom);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-resize textarea and update input area height
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, TEXTAREA_MAX_HEIGHT_PX) + "px";
    }
    // Update input area height for dynamic padding
    if (inputAreaRef.current) {
      setInputAreaHeight(inputAreaRef.current.offsetHeight);
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !isComposing) {
      sendChatMessage(message.trim());
      setMessage("");
      // Scroll to bottom instantly when sending a message
      scrollToBottom("auto");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const getUserName = (clientId: string, username: string) => {
    if (clientId === currentUser?.clientId) return "You";
    return username;
  };

  // Group messages by time proximity (within 3 minutes) and sender
  const groupedMessages = currentMessages.reduce(
    (groups, msg, index) => {
      if (index === 0) {
        return [[msg]];
      }

      const lastGroup = groups[groups.length - 1];
      const lastMsg = lastGroup[lastGroup.length - 1];
      const timeDiff = msg.timestamp - lastMsg.timestamp;
      const isWithinTimeWindow = timeDiff < MESSAGE_GROUP_TIME_WINDOW_MS; // 3 minutes

      if (msg.clientId === lastMsg.clientId && isWithinTimeWindow) {
        lastGroup.push(msg);
      } else {
        groups.push([msg]);
      }

      return groups;
    },
    [] as (typeof currentMessages)[]
  );

  return (
    <div className="relative h-full overflow-hidden">
      {/* Messages Area with padding container */}
      <div className="h-full" style={{ paddingBottom: `${inputAreaHeight}px` }}>
        <ScrollArea ref={scrollAreaRef} className="h-full px-2 pt-3">
          {/* Empty state */}
          <AnimatePresence>
            {currentMessages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.15,
                  ease: "easeOut",
                }}
                className="absolute inset-0 flex flex-col items-center justify-center px-4"
              >
                <MessageCircle className="w-12 h-12 text-neutral-700 mb-3" />
                <h3 className="text-neutral-400 text-sm font-medium mb-1">No messages yet</h3>
                <p className="text-neutral-600 text-xs">Start the conversation</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className="space-y-2 pb-2">
            {groupedMessages.map((group, groupIndex) => {
              const isOwnMessage = group[0].clientId === currentUser?.clientId;

              // Show timestamp if more than 1 minute gap between messages or if it's the first group
              const showTimestamp =
                groupIndex === 0 ||
                group[0].timestamp -
                  groupedMessages[groupIndex - 1][groupedMessages[groupIndex - 1].length - 1].timestamp >
                  TIMESTAMP_GAP_THRESHOLD_MS;

              return (
                <div key={`group-${group[0].id}`} className="space-y-0.5">
                  {/* Time divider */}
                  {showTimestamp && (
                    <div className="flex items-center justify-center py-1">
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {formatChatTimestamp(group[0].timestamp)}
                      </span>
                    </div>
                  )}

                  {/* Message group */}
                  <div className={cn("flex flex-col min-w-0 w-full", isOwnMessage ? "items-end" : "items-start")}>
                    {/* Sender name (only for others' messages and first message in group) */}
                    {!isOwnMessage && (
                      <span className="text-[10px] text-neutral-500 ml-1 mb-0.5">
                        {(() => {
                          const username = getUserName(group[0].clientId, group[0].username);
                          const countryCode = group[0].countryCode;

                          if (countryCode) {
                            const flagEmoji = countryCodeEmoji(countryCode);
                            return (
                              <span title={`Country: ${countryCode}`}>
                                {flagEmoji} {username}
                              </span>
                            );
                          }
                          return username;
                        })()}
                      </span>
                    )}

                    {/* Messages */}
                    <div
                      className={cn("flex flex-col gap-[1px] max-w-[85%]", isOwnMessage ? "items-end" : "items-start")}
                    >
                      <AnimatePresence mode="popLayout">
                        {group.map((msg, msgIndex) => {
                          const isFirst = msgIndex === 0;
                          const isLast = msgIndex === group.length - 1;
                          const isSingle = group.length === 1;

                          return (
                            <motion.div
                              key={msg.id}
                              className={cn(
                                "px-3 py-1.5 text-sm break-words max-w-full",
                                isOwnMessage ? "bg-green-700 text-white" : "bg-neutral-800 text-neutral-200",
                                // Corner rounding for message bubbles
                                isSingle
                                  ? "rounded-2xl"
                                  : [
                                      isFirst && isOwnMessage && "rounded-2xl rounded-br-md",
                                      isFirst && !isOwnMessage && "rounded-2xl rounded-bl-md",
                                      isLast && isOwnMessage && "rounded-2xl rounded-tr-md",
                                      isLast && !isOwnMessage && "rounded-2xl rounded-tl-md",
                                      !isFirst && !isLast && isOwnMessage && "rounded-l-2xl rounded-r-md",
                                      !isFirst && !isLast && !isOwnMessage && "rounded-r-2xl rounded-l-md",
                                    ]
                              )}
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{
                                type: "spring",
                                stiffness: 700,
                                damping: 35,
                                mass: 0.3,
                              }}
                              layout
                            >
                              <p className="whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>
                                {msg.text}
                              </p>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* New Messages Pill */}
      <AnimatePresence>
        {isUserScrolling && newMessageCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
            }}
            onClick={() => scrollToBottom()}
            className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-3 py-1.5 bg-green-800 hover:bg-green-700 text-white text-xs font-medium rounded-full shadow-lg shadow-green-900/40 transition-colors duration-500"
            style={{ bottom: `${inputAreaHeight + 16}px` }}
          >
            <ChevronDown className="w-3 h-3" />
            {newMessageCount === 1 ? "1 new message" : `${newMessageCount} new messages`}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input Area - Fixed at bottom */}
      <div
        ref={inputAreaRef}
        className="absolute bottom-0 left-0 right-0 border-t border-neutral-800/50 p-2 pt-3 bg-neutral-900 z-10"
      >
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="Message"
              className={cn(
                "w-full resize-none rounded-2xl bg-neutral-800/50 px-4 py-2 text-base sm:text-sm",
                "placeholder:text-neutral-500 text-neutral-100",
                "border border-neutral-700/50",
                "focus:outline-none",
                `min-h-[${TEXTAREA_MIN_HEIGHT_PX}px] max-h-[${TEXTAREA_MAX_HEIGHT_PX}px]`,
                "scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
              )}
              rows={1}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
