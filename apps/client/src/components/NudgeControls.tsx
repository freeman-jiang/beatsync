import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";

interface NudgeControlsProps {
  totalNudge: number;
  onNudge: (amount: number) => void;
  disabled: boolean;
}

export const NudgeControls: React.FC<NudgeControlsProps> = ({
  totalNudge,
  onNudge,
  disabled,
}) => {
  const { watch, setValue } = useForm({
    defaultValues: {
      nudgeAmount: 10,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form's watch() API is incompatible with React Compiler memoization by design
  const nudgeAmount = watch("nudgeAmount");

  const handleNudgeAmountChange = (newAmount: number) => {
    const validValues = [1, 5, 10, 20, 50, 100, 250, 500, 1000];

    // If the value is not in our predefined list, find the closest available option
    if (!validValues.includes(newAmount)) {
      const closest = validValues.reduce((prev, curr) => {
        return Math.abs(curr - newAmount) < Math.abs(prev - newAmount)
          ? curr
          : prev;
      });
      console.log(
        `Nudge amount ${newAmount} not in valid options, using closest value: ${closest}`
      );
      setValue("nudgeAmount", closest);
    } else {
      setValue("nudgeAmount", newAmount);
      console.log(`Nudge amount set to ${newAmount} ms`);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded max-w-md w-full">
      <h3 className="font-bold mb-2">Microscopic Timing Controls</h3>
      <div className="flex items-center justify-between mb-2">
        <span>Nudge Amount: {nudgeAmount} ms</span>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              handleNudgeAmountChange(Math.max(1, Math.floor(nudgeAmount / 2)))
            }
            variant="outline"
            size="sm"
          >
            ÷2
          </Button>
          <Button
            onClick={() =>
              handleNudgeAmountChange(
                Math.min(1000, Math.floor(nudgeAmount * 2))
              )
            }
            variant="outline"
            size="sm"
          >
            ×2
          </Button>
          <Select
            value={String(nudgeAmount)}
            onValueChange={(value) => handleNudgeAmountChange(Number(value))}
            defaultValue="10"
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Nudge amount" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 ms</SelectItem>
              <SelectItem value="5">5 ms</SelectItem>
              <SelectItem value="10">10 ms</SelectItem>
              <SelectItem value="20">20 ms</SelectItem>
              <SelectItem value="50">50 ms</SelectItem>
              <SelectItem value="100">100 ms</SelectItem>
              <SelectItem value="250">250 ms</SelectItem>
              <SelectItem value="500">500 ms</SelectItem>
              <SelectItem value="1000">1000 ms (1s)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-center">
        <Button
          onClick={() => onNudge(-nudgeAmount)}
          variant="secondary"
          size="default"
          disabled={disabled}
        >
          ◀ Slow Down
        </Button>
        <Button
          onClick={() => onNudge(nudgeAmount)}
          variant="secondary"
          size="default"
          disabled={disabled}
        >
          Speed Up ▶
        </Button>
      </div>
      <div className="mt-2 text-center">
        Total adjustment: {totalNudge > 0 ? "+" : ""}
        {totalNudge} ms ({(totalNudge / 1000).toFixed(3)} s)
      </div>
    </div>
  );
};
