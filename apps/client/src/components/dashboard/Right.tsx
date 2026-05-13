import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Rotate3D } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Chat } from "./right/Chat";
import { SpatialAudio } from "./right/SpatialAudio";

interface RightProps {
  /** When true, drops the Spatial tab and renders Chat full-height. Used by map
   *  rooms where the grid-based spatial audio panel doesn't apply (proximity
   *  comes from GPS, not the grid). */
  chatOnly?: boolean;
}

export const Right = ({ chatOnly = false }: RightProps = {}) => {
  if (chatOnly) {
    return (
      <div className="w-full lg:w-80 lg:flex-shrink-0 border-l border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col h-full">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-neutral-800/50">
          <MessageCircle className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-sm font-medium">Chat</span>
        </div>
        <div className="flex-1 overflow-hidden h-full">
          <Chat />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-80 lg:flex-shrink-0 border-l border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col h-full">
      <Tabs defaultValue="chat" className="flex flex-col h-full">
        <div className="p-2 pb-0 flex-shrink-0">
          <TabsList className="bg-neutral-900 w-full">
            <TabsTrigger value="chat" className="flex-1">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="spatial" className="flex-1">
              <Rotate3D className="h-3.5 w-3.5 mr-1.5" />
              Spatial
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="relative">
          <Separator className="bg-neutral-800/50" />
        </div>
        <TabsContent value="chat" className="flex-1 overflow-hidden h-full">
          <Chat />
        </TabsContent>
        <TabsContent value="spatial" className="flex-1 overflow-auto h-full">
          <ScrollArea className="h-full">
            <SpatialAudio />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
