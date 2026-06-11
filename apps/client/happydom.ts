// Registers happy-dom globals (window, document, navigator, WebSocket, ...)
// before any test file imports browser-dependent modules. Wired up via the
// [test].preload entry in bunfig.toml.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// happy-dom has no Web Audio API, but the global store initializes audio on
// creation (via AudioContextManager). A minimal stub keeps the real modules
// importable in tests; nothing asserts on actual audio behavior.
class StubAudioParam {
  value = 1;
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  setTargetAtTime(): void {}
  cancelScheduledValues(): void {}
}

class StubAudioNode {
  gain = new StubAudioParam();
  frequency = new StubAudioParam();
  Q = new StubAudioParam();
  detune = new StubAudioParam();
  playbackRate = new StubAudioParam();
  type = "";
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

class StubAudioContext {
  state = "running";
  currentTime = 0;
  destination = new StubAudioNode();
  onstatechange: (() => void) | null = null;
  baseLatency = 0;
  outputLatency = 0;
  createGain(): StubAudioNode {
    return new StubAudioNode();
  }
  createBufferSource(): StubAudioNode {
    return new StubAudioNode();
  }
  createOscillator(): StubAudioNode {
    return new StubAudioNode();
  }
  createBiquadFilter(): StubAudioNode {
    return new StubAudioNode();
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  decodeAudioData(): Promise<{ duration: number }> {
    return Promise.resolve({ duration: 0 });
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

// happy-dom's window doesn't define these; tests never assert audio output
Object.assign(globalThis, { AudioContext: StubAudioContext });
