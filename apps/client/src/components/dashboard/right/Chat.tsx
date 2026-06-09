"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useStateTransition } from "@/hooks/useStateTransition";
import { countryCodeEmoji } from "@/lib/country/countryCode";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { formatChatTimestamp } from "@/utils/time";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { ChevronDown, Lock, MessageCircle, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants
const MESSAGE_GROUP_TIME_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const TIMESTAMP_GAP_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute

export const Chat = () => {
  const [message, setMessage] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [inputAreaHeight, setInputAreaHeight] = useState(60);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [messageCountSnapshot, setMessageCountSnapshot] = useState(0);

  const currentMessages = useChatStore((state) => state.messages);
  const isRoomPrivate = useChatStore((state) => state.isRoomPrivate);
  const sendChatMessage = useGlobalStore((state) => state.sendChatMessage);
  const currentUser = useGlobalStore((state) => state.currentUser);
  const socket = useGlobalStore((state) => state.socket);

  // Calculate new messages since user started scrolling
  const newMessageCount = isUserScrolling ? currentMessages.length - messageCountSnapshot : 0;

  // State transition detection: Capture message count when scrolling starts
  const handleScrollTransition = (wasScrolling: boolean, isScrolling: boolean) => {
    if (!wasScrolling && isScrolling) {
      setMessageCountSnapshot(currentMessages.length);
    } else if (wasScrolling && !isScrolling) {
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
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior });
        setIsUserScrolling(false);
        setMessageCountSnapshot(currentMessages.length);
        prevMessageCountRef.current = currentMessages.length;
      }
    },
    [currentMessages.length]
  );

  // Auto-scroll to bottom when new messages arrive (only if not manually scrolling)
  useEffect(() => {
    const hasNewMessages = currentMessages.length > prevMessageCountRef.current;
    if (hasNewMessages) {
      if (!isUserScrolling) {
        queueMicrotask(() => scrollToBottom("smooth"));
      } else {
        prevMessageCountRef.current = currentMessages.length;
      }
    }
  }, [currentMessages, isUserScrolling, scrollToBottom]);

  // Scroll to bottom on mount
  useEffect(() => {
    queueMicrotask(() => scrollToBottom("auto"));
  }, [scrollToBottom]);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!scrollContainer) return;

    const handleScroll = () => {
      const isAtBottom =
        Math.abs(scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop) < 300;
      setIsUserScrolling(!isAtBottom);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Track input area height for dynamic scroll padding
  useEffect(() => {
    const el = inputAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setInputAreaHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSend = () => {
    if (message.trim() && !isComposing) {
      sendChatMessage(message.trim());
      setMessage("");
      scrollToBottom("auto");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUnsend = (messageId: number) => {
    if (!socket) return;
    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.UNSEND_MESSAGE,
        messageId,
      },
    });
  };

  const getUserName = (clientId: string, username: string) => {
    if (clientId === currentUser?.clientId) return "You";
    return username;
  };

  // Group messages by time proximity and sender
  const groupedMessages = currentMessages.reduce(
    (groups, msg, index) => {
      if (index === 0) return [[msg]];
      const lastGroup = groups[groups.length - 1];
      const lastMsg = lastGroup[lastGroup.length - 1];
      const timeDiff = msg.timestamp - lastMsg.timestamp;
      const isWithinTimeWindow = timeDiff < MESSAGE_GROUP_TIME_WINDOW_MS;
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
      {/* Private room badge */}
      {isRoomPrivate && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/20">
          <Lock className="h-2.5 w-2.5" />
          Private
        </div>
      )}

      {/* Messages Area */}
      <div className="h-full" style={{ paddingBottom: `${inputAreaHeight}px` }}>
        <ScrollArea ref={scrollAreaRef} className="h-full px-2 pt-3">
          {/* Empty state */}
          <AnimatePresence>
            {currentMessages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
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
              const showTimestamp =
                groupIndex === 0 ||
                group[0].timestamp -
                  groupedMessages[groupIndex - 1][groupedMessages[groupIndex - 1].length - 1].timestamp >
                  TIMESTAMP_GAP_THRESHOLD_MS;

              return (
                <div key={`group-${group[0].id}`} className="space-y-0.5">
                  {showTimestamp && (
                    <div className="flex items-center justify-center py-1">
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {formatChatTimestamp(group[0].timestamp)}
                      </span>
                    </div>
                  )}

                  <div className={cn("flex flex-col min-w-0 w-full", isOwnMessage ? "items-end" : "items-start")}>
                    {!isOwnMessage && (
                      <span className="text-[10px] text-neutral-500 ml-1 mb-0.5">
                        {(() => {
                          const username = getUserName(group[0].clientId, group[0].username);
                          const countryCode = group[0].countryCode;
                          const senderIsCreator = group[0].isCreator;
                          return (
                            <span title={countryCode ? `Country: ${countryCode}` : undefined}>
                              {countryCode && `${countryCodeEmoji(countryCode)} `}
                              {username}
                              {senderIsCreator && (
                                <span className="text-sky-400 bg-sky-500/15 px-0.5 rounded ml-0.5 font-semibold">
                                  Creator
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </span>
                    )}

                    <div
                      className={cn("flex flex-col gap-[1px] max-w-[85%]", isOwnMessage ? "items-end" : "items-start")}
                    >
                      <AnimatePresence mode="popLayout">
                        {group.map((msg, msgIndex) => {
                          const isFirst = msgIndex === 0;
                          const isLast = msgIndex === group.length - 1;
                          const isSingle = group.length === 1;
                          const isHovered = hoveredMsgId === msg.id;

                          return (
                            <motion.div
                              key={msg.id}
                              className="relative flex items-center gap-1"
                              style={{ flexDirection: isOwnMessage ? "row-reverse" : "row" }}
                              onMouseEnter={() => setHoveredMsgId(msg.id)}
                              onMouseLeave={() => setHoveredMsgId(null)}
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ type: "spring", stiffness: 700, damping: 35, mass: 0.3 }}
                              layout
                            >
                              {/* Unsend button — only own non-deleted messages */}
                              {isOwnMessage && !msg.isDeleted && (
                                <AnimatePresence>
                                  {isHovered && (
                                    <motion.button
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.8 }}
                                      transition={{ duration: 0.12 }}
                                      onClick={() => handleUnsend(msg.id)}
                                      title="Unsend message"
                                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-500 hover:bg-red-900/40 hover:text-red-400 transition-colors duration-150"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </motion.button>
                                  )}
                                </AnimatePresence>
                              )}

                              {/* Bubble */}
                              <div
                                className={cn(
                                  "px-3 py-1.5 text-sm",
                                  msg.isDeleted
                                    ? "bg-neutral-800/40 text-neutral-600 italic"
                                    : msg.isCreator
                                      ? "bg-sky-700 text-white"
                                      : isOwnMessage
                                        ? "bg-green-700 text-white"
                                        : "bg-neutral-800 text-neutral-200",
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
                              >
                                <p className="whitespace-pre-wrap wrap-anywhere">
                                  {msg.isDeleted ? "Message unsent" : msg.text}
                                </p>
                              </div>
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
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            onClick={() => scrollToBottom()}
            className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-3 py-1.5 bg-green-800 hover:bg-green-700 text-white text-xs font-medium rounded-full shadow-lg shadow-green-900/40 transition-colors duration-500"
            style={{ bottom: `${inputAreaHeight + 16}px` }}
          >
            <ChevronDown className="w-3 h-3" />
            {newMessageCount === 1 ? "1 new message" : `${newMessageCount} new messages`}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input Area */}
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
                "field-sizing-content max-h-[120px] overflow-auto",
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
