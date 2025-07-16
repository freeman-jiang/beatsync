import { useEffect, useState } from "react";

const APPLE_MUSIC_DEVELOPER_TOKEN = process.env.NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN;

// Dynamically load MusicKit JS from Apple CDN
function loadMusicKitScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).MusicKit) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v1/musickit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load MusicKit JS"));
    document.body.appendChild(script);
  });
}

interface AppleMusicConnectorProps {
  onTrackSelected?: (track: any) => void;
}

export default function AppleMusicConnector({ onTrackSelected }: AppleMusicConnectorProps) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null);

  useEffect(() => {
    if (!APPLE_MUSIC_DEVELOPER_TOKEN) {
      setError("Apple Music developer token is not set. Please add NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN to your .env file.");
      return;
    }
    loadMusicKitScript()
      .then(() => {
        (window as any).MusicKit.configure({
          developerToken: APPLE_MUSIC_DEVELOPER_TOKEN,
          app: {
            name: "beatsync",
            build: "1.0.0",
          },
        });
        setIsReady(true);
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleSignIn = async () => {
    try {
      const musicKit = (window as any).MusicKit.getInstance();
      const token = await musicKit.authorize();
      setUserToken(token);
      setIsAuthorized(true);
    } catch (err: any) {
      setError(err.message || "Failed to authorize with Apple Music");
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setSearchResults([]);
    setSelectedTrack(null);
    try {
      const musicKit = (window as any).MusicKit.getInstance();
      const result = await musicKit.api.search(searchQuery, { types: ["songs"], limit: 10 });
      const songs = result.songs?.data || [];
      setSearchResults(songs);
    } catch (err: any) {
      setError(err.message || "Failed to search Apple Music");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTrack = (track: any) => {
    setSelectedTrack(track);
    if (onTrackSelected) {
      onTrackSelected(track);
    }
  };

  return (
    <div className="p-4 border rounded bg-neutral-900 text-white w-full max-w-md">
      <h2 className="text-lg font-semibold mb-2">Apple Music Integration</h2>
      {!isReady && !error && <div>Loading Apple Music SDK...</div>}
      {error && <div className="text-red-400 mb-2">Error: {error}</div>}
      {isReady && !isAuthorized && !error && (
        <button
          onClick={handleSignIn}
          className="px-4 py-2 rounded bg-[#FA2A55] text-white font-medium hover:bg-[#fa2a55cc] transition-colors mb-2"
        >
          Sign in with Apple Music
        </button>
      )}
      {isAuthorized && !error && (
        <div>
          <div className="mb-2">Signed in to Apple Music!</div>
          {/* Search Input */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search for songs, artists, albums..."
              className="flex-1 px-2 py-1 rounded text-black"
              disabled={isSearching}
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-[#FA2A55] text-white font-medium hover:bg-[#fa2a55cc] transition-colors"
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>
          {/* Search Results */}
          {searchResults.length > 0 && !selectedTrack && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((track) => (
                <div key={track.id} className="flex items-center gap-3 p-2 bg-neutral-800 rounded">
                  <img
                    src={track.attributes.artwork.url.replace('{w}x{h}bb', '60x60bb')}
                    alt={track.attributes.name}
                    className="w-12 h-12 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{track.attributes.name}</div>
                    <div className="text-xs text-neutral-300 truncate">{track.attributes.artistName}</div>
                  </div>
                  <button
                    onClick={() => handleSelectTrack(track)}
                    className="px-2 py-1 rounded bg-primary-700 text-white text-xs font-semibold hover:bg-primary-600"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Selected Track */}
          {selectedTrack && (
            <div className="mt-4 p-3 bg-neutral-800 rounded flex items-center gap-3">
              <img
                src={selectedTrack.attributes.artwork.url.replace('{w}x{h}bb', '100x100bb')}
                alt={selectedTrack.attributes.name}
                className="w-16 h-16 rounded object-cover"
              />
              <div>
                <div className="font-semibold">{selectedTrack.attributes.name}</div>
                <div className="text-sm text-neutral-300">{selectedTrack.attributes.artistName}</div>
                <div className="text-xs text-neutral-400">Album: {selectedTrack.attributes.albumName}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 