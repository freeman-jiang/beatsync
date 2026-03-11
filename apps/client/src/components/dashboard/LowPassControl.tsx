"use client";

import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { AudioLines } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LOW_PASS_CONSTANTS } from "@beatsync/shared";
import { throttle } from "throttle-debounce";
import { Slider } from "../ui/slider";

// Logarithmic scale: slider 0-100 maps to frequency range
// This is perceptually linear since frequency perception is logarithmic
const { MIN_FREQ, MAX_FREQ } = LOW_PASS_CONSTANTS;
const LOG_MIN = Math.log(MIN_FREQ);
const LOG_MAX = Math.log(MAX_FREQ);

function sliderToFreq(sliderValue: number): number {
  const t = sliderValue / 100;
  return Math.round(Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN)));
}

function freqToSlider(freq: number): number {
  return ((Math.log(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
}

interface LowPassControlProps {
  className?: string;
  isMobile?: boolean;
}

export const LowPassControl = ({ className, isMobile = false }: LowPassControlProps) => {
  const canMutate = useCanMutate();
  const lowPassFreq = useGlobalStore((state) => state.lowPassFreq);
  const sendLowPassFreqUpdate = useGlobalStore((state) => state.sendLowPassFreqUpdate);

  const [displaySlider, setDisplaySlider] = useState(freqToSlider(lowPassFreq));
  const [isDragging, setIsDragging] = useState(false);

  const targetRef = useRef(freqToSlider(lowPassFreq));
  const currentRef = useRef(freqToSlider(lowPassFreq));
  const animationFrameRef = useRef<number>(0);

  // Smooth interpolation for remote changes
  useEffect(() => {
    targetRef.current = freqToSlider(lowPassFreq);

    if (isDragging) return;

    const animate = () => {
      const diff = targetRef.current - currentRef.current;

      if (Math.abs(diff) < 0.1) {
        currentRef.current = targetRef.current;
        setDisplaySlider(currentRef.current);
        return;
      }

      currentRef.current += diff * 0.25;
      setDisplaySlider(currentRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [lowPassFreq, isDragging]);

  const throttledSendUpdate = useMemo(
    () =>
      throttle(50, (freq: number) => {
        sendLowPassFreqUpdate(freq);
      }),
    [sendLowPassFreqUpdate]
  );

  const handleSliderChange = useCallback(
    (value: number[]) => {
      if (!canMutate) return;
      const sliderVal = value[0];

      setIsDragging(true);
      setDisplaySlider(sliderVal);
      currentRef.current = sliderVal;
      targetRef.current = sliderVal;

      throttledSendUpdate(sliderToFreq(sliderVal));
    },
    [canMutate, throttledSendUpdate]
  );

  const handleSliderCommit = useCallback(
    (value: number[]) => {
      if (!canMutate) return;
      const sliderVal = value[0];

      setDisplaySlider(sliderVal);
      currentRef.current = sliderVal;
      targetRef.current = sliderVal;
      sendLowPassFreqUpdate(sliderToFreq(sliderVal));

      setIsDragging(false);
    },
    [canMutate, sendLowPassFreqUpdate]
  );

  const displayFreq = sliderToFreq(displaySlider);
  const isActive = displayFreq < 19000;

  const freqLabel = useMemo(() => {
    if (displayFreq >= 19000) return "OFF";
    if (displayFreq >= 1000) return `${(displayFreq / 1000).toFixed(1)}k`;
    return `${displayFreq}`;
  }, [displayFreq]);

  if (isMobile) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <AudioLines className="h-3.5 w-3.5" />
            <span>Low-Pass Filter</span>
          </h2>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 mt-2.5">
            <button
              className={cn(
                "transition-colors",
                isActive ? "text-primary-400" : "text-neutral-400",
                canMutate ? "hover:text-white" : "opacity-50"
              )}
              disabled={!canMutate}
            >
              <AudioLines className="h-4 w-4" />
            </button>
            <Slider
              value={[displaySlider]}
              min={0}
              max={100}
              step={0.5}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              disabled={!canMutate}
              className={cn("flex-1", !canMutate && "opacity-50")}
            />
            <div className="text-xs text-neutral-400 min-w-[3rem] text-right">{freqLabel}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        "bg-neutral-800/20 rounded-md p-3 hover:bg-neutral-800/30 transition-colors",
        !canMutate && "opacity-50",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-300 flex items-center gap-1.5">
          <AudioLines className={cn("h-3 w-3", isActive ? "text-primary-500" : "text-neutral-500")} />
          <span>Low-Pass</span>
        </div>
        <div className="text-xs text-neutral-500 min-w-[2.5rem] text-right">{freqLabel}</div>
      </div>
      <div className="mt-2">
        <Slider
          value={[displaySlider]}
          min={0}
          max={100}
          step={0.5}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          disabled={!canMutate}
          className="w-full"
        />
      </div>
    </motion.div>
  );
};
