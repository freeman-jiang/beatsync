import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Rotate3D } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Chat } from "./right/Chat";
import { SpatialAudio } from "./right/SpatialAudio";

export const Right = () => {
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
          {/* <div
            className="
              pointer-events-none
              absolute left-0 right-0 top-full h-3
              bg-gradient-to-b from-neutral-900/80 to-transparent
              transition-opacity duration-300
            "
          /> */}
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
