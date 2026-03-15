import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

// ── Flag & Config ──────────────────────────────────────────────
export const IS_DEMO_MODE = process.env.DEMO === "1";
export const DEMO_ROOM_ID = "000000";

const AUDIO_DIR = resolve(process.env.DEMO_AUDIO_DIR ?? "./demo-audio");
export const ADMIN_SECRET = process.env.DEMO_ADMIN_SECRET ?? "beatsync";
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".ogg", ".m4a"]);

// ── Audio filenames (scanned once at startup) ──────────────────
export const AUDIO_FILENAMES: string[] = IS_DEMO_MODE
  ? (() => {
      try {
        return readdirSync(AUDIO_DIR).filter((f) => {
          const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
          return AUDIO_EXTENSIONS.has(ext);
        });
      } catch {
        console.error(`DEMO mode: failed to read audio directory: ${AUDIO_DIR}`);
        console.error(`Create the directory or set DEMO_AUDIO_DIR to an existing path.`);
        process.exit(1);
      }
    })()
  : [];

export const AUDIO_DIR_PATH = AUDIO_DIR;

// ── In-memory audio cache (loaded once at startup) ─────────────
interface CachedAudioFile {
  bytes: Buffer;
  type: string;
}

export const AUDIO_FILE_CACHE = new Map<string, CachedAudioFile>();

if (IS_DEMO_MODE) {
  console.log(`🎤 Demo mode enabled — serving ${AUDIO_FILENAMES.length} files from ${AUDIO_DIR}`);
  let totalBytes = 0;
  for (const filename of AUDIO_FILENAMES) {
    const filePath = resolve(AUDIO_DIR, filename);
    const bytes = readFileSync(filePath);
    const type = Bun.file(filePath).type;
    AUDIO_FILE_CACHE.set(filename, { bytes, type });
    totalBytes += bytes.byteLength;
    console.log(`   📁 ${filename} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log(`   💾 Total cached: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
}

// ── Admin secret auth ──────────────────────────────────────────
export function isValidAdminSecret(secret: string | null): boolean {
  return ADMIN_SECRET !== "" && secret === ADMIN_SECRET;
}
