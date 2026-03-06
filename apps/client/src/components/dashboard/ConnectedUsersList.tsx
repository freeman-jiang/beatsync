"use client";
import { useClientId } from "@/hooks/useClientId";
import { useGlobalStore } from "@/store/global";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Navigation, Users } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ConnectedUserItem } from "./ConnectedUserItem";

export const ConnectedUsersList = () => {
  const { clientId } = useClientId();
  const clients = useGlobalStore((state) => state.connectedClients);
  // const reorderClient = useGlobalStore((state) => state.reorderClient);
  const setAdminStatus = useGlobalStore((state) => state.setAdminStatus);

  // Get current user from global store
  const currentUser = useGlobalStore((state) => state.currentUser);
  const isCurrentUserAdmin = currentUser?.isAdmin || false;

  // Memoize client data to avoid unnecessary recalculations
  const clientsWithData = useMemo(() => {
    return clients.map((client) => {
      const isCurrentUser = client.clientId === clientId;
      return { client, isCurrentUser };
    });
  }, [clients, clientId]);

  return (
    <TooltipProvider>
      <div className="">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2 text-neutral-500">
            <Users className="h-3.5 w-3.5" />
            <h2 className="text-xs font-medium uppercase tracking-wider">Connected Users</h2>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Navigation className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="text-xs font-mono p-2">
                    Locations are estimated from IP addresses using public geolocation databases. Accuracy varies by
                    region.
                  </div>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
            <Badge variant="outline">{clients.length}</Badge>
          </div>
        </div>

        <div className="px-4 pb-3">
          {clients.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 text-xs">No other users connected</div>
          ) : (
            <div className="space-y-2">
              {/* List of connected users - Constrained height */}
              <div className="relative mt-2.5">
                <div className="space-y-1 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20 -mx-1">
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
    </TooltipProvider>
  );
};
