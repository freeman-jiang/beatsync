"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { formatChatTimestamp } from "@/utils/time";
import { useEffect, useRef, useState } from "react";

// Constants
const MESSAGE_GROUP_TIME_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const TIMESTAMP_GAP_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute
const TEXTAREA_MAX_HEIGHT_PX = 120;
const TEXTAREA_MIN_HEIGHT_PX = 36;

export const Chat = () => {
  const [message, setMessage] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useChatStore((state) => state.messages);
  const sendChatMessage = useGlobalStore((state) => state.sendChatMessage);
  const currentUser = useGlobalStore((state) => state.currentUser);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, TEXTAREA_MAX_HEIGHT_PX) + "px";
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !isComposing) {
      sendChatMessage(message.trim());
      setMessage("");
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
    return username || "Anonymous";
  };

  // Group messages by time proximity (within 3 minutes) and sender
  const groupedMessages = messages.reduce((groups, msg, index) => {
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
  }, [] as (typeof messages)[]);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Messages Area */}
      <ScrollArea
        ref={scrollAreaRef}
        className="absolute inset-0 pb-18 px-2 pt-3 h-full"
      >
        <div className="space-y-2">
          {groupedMessages.map((group, groupIndex) => {
            const isOwnMessage = group[0].clientId === currentUser?.clientId;

            // Show timestamp if more than 1 minute gap between messages or if it's the first group
            const showTimestamp =
              groupIndex === 0 ||
              group[0].timestamp -
                groupedMessages[groupIndex - 1][
                  groupedMessages[groupIndex - 1].length - 1
                ].timestamp >
                TIMESTAMP_GAP_THRESHOLD_MS;

            return (
              <div key={group[0].id} className="space-y-0.5">
                {/* Time divider */}
                {showTimestamp && (
                  <div className="flex items-center justify-center py-1">
                    <span className="text-[10px] text-neutral-500 font-medium">
                      {formatChatTimestamp(group[0].timestamp)}
                    </span>
                  </div>
                )}

                {/* Message group */}
                <div
                  className={cn(
                    "flex flex-col",
                    isOwnMessage ? "items-end" : "items-start"
                  )}
                >
                  {/* Sender name (only for others' messages and first message in group) */}
                  {!isOwnMessage && (
                    <span className="text-[10px] text-neutral-500 ml-2 mb-0.5">
                      {getUserName(group[0].clientId, group[0].username)}
                    </span>
                  )}

                  {/* Messages */}
                  <div
                    className={cn(
                      "flex flex-col gap-[1px]",
                      isOwnMessage ? "items-end" : "items-start"
                    )}
                  >
                    {group.map((msg, msgIndex) => {
                      const isFirst = msgIndex === 0;
                      const isLast = msgIndex === group.length - 1;
                      const isSingle = group.length === 1;

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "px-3 py-1.5 text-sm break-words",
                            isOwnMessage
                              ? "bg-green-600 text-white"
                              : "bg-neutral-800 text-neutral-200",
                            // Corner rounding for message bubbles
                            isSingle
                              ? "rounded-2xl"
                              : [
                                  isFirst &&
                                    isOwnMessage &&
                                    "rounded-2xl rounded-br-md",
                                  isFirst &&
                                    !isOwnMessage &&
                                    "rounded-2xl rounded-bl-md",
                                  isLast &&
                                    isOwnMessage &&
                                    "rounded-2xl rounded-tr-md",
                                  isLast &&
                                    !isOwnMessage &&
                                    "rounded-2xl rounded-tl-md",
                                  !isFirst &&
                                    !isLast &&
                                    isOwnMessage &&
                                    "rounded-l-2xl rounded-r-md",
                                  !isFirst &&
                                    !isLast &&
                                    !isOwnMessage &&
                                    "rounded-r-2xl rounded-l-md",
                                ]
                          )}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Gradient overlay at top for smooth transition */}
      {/* <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-neutral-900 to-transparent pointer-events-none z-10" /> */}

      {/* Input Area - Fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-800/50 bg-neutral-900/95 backdrop-blur-sm p-2">
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
                "border border-neutral-700/50 focus:border-neutral-600",
                "focus:outline-none focus:ring-1 focus:ring-neutral-600/50",
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
