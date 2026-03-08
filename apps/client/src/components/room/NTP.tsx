import { useGlobalStore } from "@/store/global";
import { Button } from "../ui/button";

export const NTP = () => {
  const sendProbePair = useGlobalStore((state) => state.sendProbePair);
  const syncMeasurements = useGlobalStore((state) => state.syncMeasurements);
  const offsetEstimate = useGlobalStore((state) => state.offsetEstimate);
  const roundTripEstimate = useGlobalStore((state) => state.roundTripEstimate);
  const resetNTPConfig = useGlobalStore((state) => state.resetNTPConfig);
  const pauseAudio = useGlobalStore((state) => state.pauseAudio);

  const resync = () => {
    pauseAudio({ when: 0 });
    resetNTPConfig();
    sendProbePair();
  };

  return (
    <div>
      {syncMeasurements.length > 0 && <p>Synced {syncMeasurements.length} times</p>}
      <p>Offset: {offsetEstimate} ms</p>
      <p>Round trip: {roundTripEstimate} ms</p>
      <Button onClick={resync}>Resync</Button>
    </div>
  );
};
