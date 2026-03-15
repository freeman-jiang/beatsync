import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";

const LocalIPFinder = () => {
  const [localIP, setLocalIP] = useState("Detecting...");
  const [status, setStatus] = useState("searching");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLocalIP = async () => {
    const RTCPeerConnection = window.RTCPeerConnection;

    if (!RTCPeerConnection) {
      setError("WebRTC not supported by this browser");
      setStatus("failed");
      return null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [], // Empty STUN servers - we don't need external services
    });

    try {
      // Create a data channel to force ICE candidate generation
      pc.createDataChannel("");

      // Create an offer and set it as local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Set a timeout in case no viable candidates are found
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("IP detection timeout")), 5000);
      });

      // Wait for ICE candidate gathering
      const ipPromise = new Promise<string>((resolve) => {
        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate) return;

          const candidateString = ice.candidate.candidate;
          // Look for candidates that contain IPv4 addresses
          const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
          const matches = ipRegex.exec(candidateString);

          if (matches && matches[1]) {
            const ip = matches[1];
            // Ignore special addresses and loopback
            if (ip !== "0.0.0.0" && !ip.startsWith("127.")) {
              resolve(ip);
            }
          }
        };
      });

      // Race the IP detection against the timeout
      const ip = await Promise.race([ipPromise, timeoutPromise]);
      pc.close();
      setLocalIP(ip);
      setStatus("success");
      return ip;
    } catch (error) {
      console.error("Error getting IP address:", error);
      pc.close();
      setError(error instanceof Error ? error.message : String(error));
      setStatus("failed");
      return null;
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is called inside async callbacks, not synchronously in the effect body
    void getLocalIP();
  }, []);

  return (
    <div className="p-4 w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Local IP Address Finder</h2>

      {status === "searching" && (
        <div className="mb-4">
          <Skeleton className="h-28 w-full mb-2 flex items-center justify-center">
            Detecting your local IP address...
          </Skeleton>
        </div>
      )}

      {status === "success" && (
        <div className="mb-4">
          <div className="bg-green-100 p-3 rounded">
            <h3 className="font-semibold text-green-800">Detected IP Address:</h3>
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => copyToClipboard(localIP)}>
              <p className="text-green-700 text-lg group-hover:underline">{localIP}</p>
              <span className="text-green-600 text-xs flex items-center">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Click to copy
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-green-600 mt-2">
              Use this IP address as the master device for audio synchronization.
            </p>
          </div>
        </div>
      )}

      {status === "manual" && (
        <div className="mb-4">
          <div className="bg-blue-100 p-3 rounded">
            <h3 className="font-semibold text-blue-800">Manual IP Address:</h3>
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => copyToClipboard(localIP)}>
              <p className="text-blue-700 text-lg group-hover:underline">{localIP}</p>
              <span className="text-blue-600 text-xs flex items-center">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Click to copy
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-2">Using manually entered IP address for synchronization.</p>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="mb-4">
          <div className="bg-yellow-100 p-3 rounded">
            <h3 className="font-semibold text-yellow-800">Detection Failed</h3>
            <p className="text-yellow-700">{error}</p>
            <p className="text-sm text-yellow-600 mt-2">
              {error?.includes("timeout")
                ? "Currently, only Chrome browsers are supported. Please try again."
                : "Please enter your local IP address manually."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Find your IP manually</h3>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">
                Show me how
                <HelpCircle className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="text-sm text-gray-600">
                <p className="font-semibold">How to find your IP manually on macOS:</p>
                <ol className="list-decimal pl-5 mt-1 space-y-1">
                  <li>Open System Preferences</li>
                  <li>Click on Network</li>
                  <li>Select your active connection (Wi-Fi or Ethernet)</li>
                  <li>Click &quot;Details...&quot;</li>
                  <li>Click &quot;TCP/IP&quot;</li>
                  <li>Look for &quot;IP Address&quot;</li>
                </ol>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default LocalIPFinder;
