import { useGlobalStore } from "@/store/global";
import { Button } from "../ui/button";

export const NTP = () => {
  const sendNTPRequest = useGlobalStore((state) => state.sendNTPRequest);
  const ntpMeasurements = useGlobalStore((state) => state.ntpMeasurements);
  const offsetEstimate = useGlobalStore((state) => state.offsetEstimate);
  const roundTripEstimate = useGlobalStore((state) => state.roundTripEstimate);

  return (
    <div>
      {ntpMeasurements.length > 0 && (
        <p>Synced {ntpMeasurements.length} times</p>
      )}
      <p>Offset: {offsetEstimate} ms</p>
      <p>Round trip: {roundTripEstimate} ms</p>
      <Button onClick={sendNTPRequest}>Sync</Button>
    </div>
  );
};
