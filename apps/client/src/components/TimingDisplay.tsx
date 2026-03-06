import { cn } from "@/lib/utils";
import { formatTimeMicro } from "@/utils/time";

interface TimingDisplayProps {
  currentTime: number; // in milliseconds
  isPlaying: boolean;
  totalNudge: number; // in milliseconds
  clockOffset: number | null; // in milliseconds
}

export const TimingDisplay: React.FC<TimingDisplayProps> = ({ currentTime, isPlaying, totalNudge, clockOffset }) => {
  // Calculate colors based on offset values
  const getOffsetColor = (offset: number) => {
    if (Math.abs(offset) < 1) return "bg-green-500"; // Very close - green
    if (offset > 0) return "bg-red-500"; // Ahead - red
    return "bg-blue-500"; // Behind - blue
  };

  // Get color based on 2-second cycle
  const getTimeCycleColor = (timeMs: number) => {
    const cyclePosition = Math.floor((timeMs % 6000) / 2000);

    switch (cyclePosition) {
      case 0:
        return "bg-red-500"; // 0-2 seconds: Red
      case 1:
        return "bg-green-500"; // 2-4 seconds: Green
      case 2:
        return "bg-blue-500"; // 4-6 seconds: Blue
      default:
        return "bg-gray-500";
    }
  };

  // Get text color based on 2-second cycle
  const getTimeCycleTextColor = (timeMs: number) => {
    const cyclePosition = Math.floor((timeMs % 6000) / 2000);

    switch (cyclePosition) {
      case 0:
        return "text-red-500"; // 0-2 seconds: Red
      case 1:
        return "text-green-500"; // 2-4 seconds: Green
      case 2:
        return "text-blue-500"; // 4-6 seconds: Blue
      default:
        return "text-gray-500";
    }
  };

  // Calculate which 2-second block we're in
  const currentCycleSeconds = Math.floor((currentTime % 6000) / 1000);
  const currentColorName = [
    "Red", // 0s
    "Red", // 1s
    "Green", // 2s
    "Green", // 3s
    "Blue", // 4s
    "Blue", // 5s
  ][currentCycleSeconds];

  return (
    <div className="w-full max-w-md p-4 border rounded bg-gray-50">
      <h3 className="font-bold mb-2">Precise Timing Display</h3>

      {/* Color cycle indicator */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span>Color Cycle (6s):</span>
          <span className={`font-bold ${getTimeCycleTextColor(currentTime)}`}>
            {currentColorName} ({currentCycleSeconds % 2}s)
          </span>
        </div>

        {/* Large color block for easy visual comparison between clients */}
        <div className="mt-2 flex justify-center">
          <div className={cn("w-24 h-24 rounded-lg border-4 border-gray-300", getTimeCycleColor(currentTime))}>
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
              {currentCycleSeconds % 2}
            </div>
          </div>
        </div>
      </div>

      {/* Current playback time with microsecond precision */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span>Playback Time:</span>
          <span className={isPlaying ? "text-green-600 font-mono" : "text-gray-600 font-mono"}>
            {formatTimeMicro(currentTime)}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-600 h-2 rounded-full"
            style={{ width: `${(currentTime % 2000) / 20}%` }} // 2-second loop for visualization
          ></div>
        </div>
      </div>

      {/* Nudge amount visualization */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span>Timing Adjustment:</span>
          <span className="font-mono">
            {totalNudge > 0 ? "+" : ""}
            {totalNudge} ms
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 flex items-center">
          <div className="w-1/2 h-full bg-gray-300 rounded-l-full"></div>
          <div
            className={`h-4 w-1 ${
              Math.abs(totalNudge) < 0.1 ? "bg-green-600" : totalNudge > 0 ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ marginLeft: `${50 + totalNudge * 10}%` }} // Scale for visibility
          ></div>
          <div className="w-1/2 h-full bg-gray-300 rounded-r-full"></div>
        </div>
      </div>

      {/* Clock offset visualization */}
      <div>
        <div className="flex justify-between mb-1">
          <span>Clock Offset:</span>
          <span className="font-mono">
            {clockOffset !== null ? `${clockOffset > 0 ? "+" : ""}${clockOffset.toFixed(3)} ms` : "Unknown"}
          </span>
        </div>
        {clockOffset !== null && (
          <div className="w-full bg-gray-200 rounded-full h-2 flex items-center">
            <div className="w-1/2 h-full bg-gray-300 rounded-l-full"></div>
            <div
              className={`h-4 w-1 ${getOffsetColor(clockOffset)}`}
              style={{
                marginLeft: `${50 + Math.min(Math.max(clockOffset * 5, -49), 49)}%`,
              }} // Scale and clamp
            ></div>
            <div className="w-1/2 h-full bg-gray-300 rounded-r-full"></div>
          </div>
        )}
      </div>
    </div>
  );
};
