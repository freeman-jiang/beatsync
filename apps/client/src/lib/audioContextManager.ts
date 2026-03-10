import { IS_DEMO_MODE } from "@/lib/demo";
import iosunmute from "iosunmute";

/**
 * Singleton AudioContext Manager
 *
 * Manages a single AudioContext instance for the entire application lifecycle.
 * This prevents AudioContext limit errors (especially on iOS which has a limit of 6)
 * and improves performance by avoiding repeated context creation.
 */
class AudioContextManager {
  private static instance: AudioContextManager | null = null;
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private stateChangeCallback: ((state: AudioContextState) => void) | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private hasVisibilityListener = false;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of AudioContextManager
   */
  static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  /**
   * Get or create the AudioContext
   * Will reuse existing context unless it's closed
   */
  getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      console.log("[AudioContextManager] Creating new AudioContext");
      this.iosUnmuteDispose?.();
      this.audioContext = new AudioContext();
      this.iosUnmuteDispose = iosunmute(this.audioContext, !IS_DEMO_MODE).dispose;
      this.setupStateChangeListener();
      this.setupMasterGain();
    }
    return this.audioContext;
  }

  /**
   * Get the master gain node for volume control
   */
  getMasterGain(): GainNode {
    if (!this.masterGainNode) {
      const ctx = this.getContext();
      this.masterGainNode = ctx.createGain();
      this.masterGainNode.connect(ctx.destination);
    }
    return this.masterGainNode;
  }

  /**
   * Resume the AudioContext if it's suspended
   * Required for iOS and some browsers after user interaction
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
        console.log("[AudioContextManager] AudioContext resumed");
      } catch (error) {
        console.error("[AudioContextManager] Failed to resume AudioContext:", error);
        throw error;
      }
    }

    // Request wake lock to prevent device sleep and WiFi power-save mode
    await this.requestWakeLock();
  }

  private iosUnmuteDispose: (() => void) | null = null;

  /**
   * Request a screen wake lock to prevent WiFi Power Save Mode (PSM).
   * PSM buffers incoming packets at the AP for 100-300ms, destroying sync.
   * Re-acquires automatically when the page becomes visible again.
   */
  private async requestWakeLock(): Promise<void> {
    if (this.wakeLock) return; // Already held

    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        console.log("[AudioContextManager] Wake lock acquired");

        // Re-acquire on visibility change (lock is released when page is hidden)
        this.wakeLock.addEventListener("release", () => {
          console.log("[AudioContextManager] Wake lock released");
          this.wakeLock = null;
        });

        // Register visibility listener once to re-acquire wake lock after tab becomes visible
        if (!this.hasVisibilityListener) {
          this.hasVisibilityListener = true;
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && !this.wakeLock) {
              this.requestWakeLock().catch(() => {
                // Silently fail — wake lock is best-effort
              });
            }
          });
        }
      }
    } catch {
      // Wake lock request can fail (e.g., low battery, unsupported browser)
      console.warn("[AudioContextManager] Wake lock not available");
    }
  }

  /**
   * Get the current state of the AudioContext
   */
  getState(): AudioContextState | null {
    return this.audioContext?.state || null;
  }

  /**
   * Get the current time from the AudioContext
   */
  getCurrentTime(): number {
    return this.audioContext?.currentTime || 0;
  }

  /**
   * Set a callback for state changes
   */
  setStateChangeCallback(callback: (state: AudioContextState) => void): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Setup listener for AudioContext state changes
   */
  private setupStateChangeListener(): void {
    if (!this.audioContext) return;

    this.audioContext.onstatechange = () => {
      const state = this.audioContext?.state;
      console.log(`[AudioContextManager] State changed to: ${state}`);

      if (state && this.stateChangeCallback) {
        this.stateChangeCallback(state);
      }

      // Handle iOS suspension
      if (state === "suspended") {
        console.warn("[AudioContextManager] AudioContext suspended - user interaction required to resume");
      }
    };
  }

  /**
   * Setup the master gain node and Bluetooth keepalive
   */
  private setupMasterGain(): void {
    if (!this.audioContext) return;

    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.connect(this.audioContext.destination);

    // Default to full volume
    this.masterGainNode.gain.value = 1.0;

    // Bluetooth keepalive: prevents A2DP buffer from resettling between pause/play
    // cycles. Uses inaudibly quiet signal (-80dB) instead of gain=0, because browsers
    // optimize away gain=0 subgraphs and Bluetooth stacks treat that as silence.
    const keepalive = this.audioContext.createOscillator();
    keepalive.frequency.value = 1; // 1Hz — below audible range
    const keepaliveGain = this.audioContext.createGain();
    keepaliveGain.gain.value = 0.0001; // -80dB, inaudible but not optimized away
    keepalive.connect(keepaliveGain);
    keepaliveGain.connect(this.masterGainNode);
    keepalive.start();
  }

  /**
   * Update the master gain value
   */
  setMasterGain(value: number, rampTime?: number): void {
    if (!this.masterGainNode || !this.audioContext) return;

    const clampedValue = Math.max(0, Math.min(1, value));

    if (rampTime && rampTime > 0) {
      const now = this.audioContext.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(this.masterGainNode.gain.value, now);
      this.masterGainNode.gain.linearRampToValueAtTime(clampedValue, now + rampTime);
    } else {
      this.masterGainNode.gain.value = clampedValue;
    }
  }

  /**
   * Convert a performance.now() timestamp to AudioContext.currentTime.
   * Uses getOutputTimestamp() to bridge the two clock domains, correcting
   * for drift between the system oscillator and audio hardware clock.
   */
  perfTimeToAudioTime(perfTimeMs: number): number {
    const ctx = this.audioContext;
    if (!ctx) return perfTimeMs / 1000;

    const ts = ctx.getOutputTimestamp();
    if (!ts.contextTime || !ts.performanceTime) {
      // Fallback: assume clocks are aligned
      return ctx.currentTime + (perfTimeMs - performance.now()) / 1000;
    }

    // Linear mapping: audioTime = contextTime + (perfTime - performanceTime) / 1000
    return ts.contextTime + (perfTimeMs - ts.performanceTime) / 1000;
  }

  /**
   * Check if AudioContext is in a usable state
   */
  isReady(): boolean {
    return this.audioContext?.state === "running";
  }

  /**
   * Decode audio data using the shared context
   */
  async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getContext();
    return await ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Create a new buffer source node
   * Note: BufferSourceNodes are one-time use only
   */
  createBufferSource(): AudioBufferSourceNode {
    const ctx = this.getContext();
    return ctx.createBufferSource();
  }
}

export const audioContextManager = AudioContextManager.getInstance();
export { AudioContextManager };
