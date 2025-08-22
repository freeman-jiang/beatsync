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
  private stateChangeCallback: ((state: AudioContextState) => void) | null =
    null;

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
      this.audioContext = new AudioContext();
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
        console.error(
          "[AudioContextManager] Failed to resume AudioContext:",
          error
        );
        throw error;
      }
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
        console.warn(
          "[AudioContextManager] AudioContext suspended - user interaction required to resume"
        );
      }
    };
  }

  /**
   * Setup the master gain node
   */
  private setupMasterGain(): void {
    if (!this.audioContext) return;

    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.connect(this.audioContext.destination);

    // Default to full volume
    this.masterGainNode.gain.value = 1.0;
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
      this.masterGainNode.gain.setValueAtTime(
        this.masterGainNode.gain.value,
        now
      );
      this.masterGainNode.gain.linearRampToValueAtTime(
        clampedValue,
        now + rampTime
      );
    } else {
      this.masterGainNode.gain.value = clampedValue;
    }
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
