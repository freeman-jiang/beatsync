import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Rotate3D } from "lucide-react";
import { Chat } from "./right/Chat";
import { SpatialAudio } from "./right/SpatialAudio";

export const Right = () => {
  return (
    <div className="w-full lg:w-80 lg:flex-shrink-0 border-l border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col pb-4 lg:pb-0 text-sm space-y-1 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20 h-full">
      <Tabs defaultValue="chat" className="p-2">
        <TabsList className="bg-neutral-900">
          <TabsTrigger value="chat" className="">
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="spatial">
            <Rotate3D className="h-3.5 w-3.5" />
            Spatial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <Chat />
        </TabsContent>
        <TabsContent value="spatial">
          <SpatialAudio />
        </TabsContent>
      </Tabs>
    </div>
  );
};
