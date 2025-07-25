"use client";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { ClientType } from "@beatsync/shared";
import { Crown, MoreVertical, Users } from "lucide-react";
import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ConnectedUserItemProps {
  client: ClientType;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onSetAdmin: (clientId: string, isAdmin: boolean) => void;
}

// Separate connected user list item component
const ConnectedUserItem = memo<ConnectedUserItemProps>(
  ({ client, isCurrentUser, isAdmin, onSetAdmin }) => {
    return (
      <motion.div
        className={cn(
          "flex items-center gap-2 p-1.5 rounded-md transition-all duration-300 text-sm",
          isCurrentUser ? "bg-primary-400/10" : "bg-transparent"
        )}
        initial={{ opacity: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="relative">
          <Avatar className="h-8 w-8">
            <AvatarImage />
            <AvatarFallback
              className={isCurrentUser ? "bg-primary-600" : "bg-neutral-600"}
            >
              {client.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* Admin crown indicator */}
          {client.isAdmin && (
            <div className="absolute -top-0.5 -right-0.5 bg-yellow-500 rounded-full p-0.5">
              <Crown
                className="h-2.5 w-2.5 text-yellow-900"
                fill="currentColor"
              />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate">
            {client.username}
          </span>
        </div>
        <Badge
          variant={isCurrentUser ? "default" : "outline"}
          className={cn(
            "ml-auto text-xs shrink-0 min-w-[60px] text-center py-0 h-5",
            isCurrentUser ? "bg-primary-600 text-primary-50" : ""
          )}
        >
          {isCurrentUser ? "You" : "Connected"}
        </Badge>
        {/* Admin controls dropdown - only show if current user is admin and not targeting self */}
        {isAdmin && !isCurrentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-neutral-700/50"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {client.isAdmin ? (
                <DropdownMenuItem
                  onClick={() => onSetAdmin(client.clientId, false)}
                  className="text-xs"
                >
                  <Crown className="h-3 w-3 mr-2 text-red-500" />
                  Remove Admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => onSetAdmin(client.clientId, true)}
                  className="text-xs"
                >
                  <Crown className="h-3 w-3 mr-2 text-green-500" />
                  Make Admin
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </motion.div>
    );
  }
);
ConnectedUserItem.displayName = "ConnectedUserItem";

export const ConnectedUsersList = () => {
  const userId = useRoomStore((state) => state.userId);
  const clients = useGlobalStore((state) => state.connectedClients);
  // const reorderClient = useGlobalStore((state) => state.reorderClient);
  const setAdminStatus = useGlobalStore((state) => state.setAdminStatus);

  // Get current user from global store
  const currentUser = useGlobalStore((state) => state.currentUser);
  const isCurrentUserAdmin = currentUser?.isAdmin || false;

  // Memoize client data to avoid unnecessary recalculations
  const clientsWithData = useMemo(() => {
    return clients.map((client) => {
      const isCurrentUser = client.clientId === userId;
      return { client, isCurrentUser };
    });
  }, [clients, userId]);

  return (
    <div className="">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>Connected Users</span>
        </h2>
        <span className="text-xs font-medium text-neutral-400">
          {clients.length}
        </span>
      </div>

      <div className="px-4 pb-3">
        {clients.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-xs">
            No other users connected
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex mb-4 justify-end">
              {/* <Button
                className="text-xs px-3 py-1 h-auto bg-neutral-700/60 hover:bg-neutral-700 text-white transition-colors duration-200 cursor-pointer w-full"
                size="sm"
                onClick={() => reorderClient(userId)}
              >
                <ArrowUp className="size-4" /> Move to Top
              </Button> */}
            </div>

            {/* List of connected users - Constrained height */}
            <div className="relative">
              <div className="space-y-1 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20">
                {clientsWithData.map(({ client, isCurrentUser }) => (
                  <ConnectedUserItem
                    key={client.clientId}
                    client={client}
                    isCurrentUser={isCurrentUser}
                    isAdmin={isCurrentUserAdmin}
                    onSetAdmin={setAdminStatus}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
