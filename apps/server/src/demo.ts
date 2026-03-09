import { readdirSync } from "fs";
import { resolve } from "path";

// ── Flag & Config ──────────────────────────────────────────────
export const IS_DEMO_MODE = process.env.DEMO === "1";

const AUDIO_DIR = resolve(process.env.DEMO_AUDIO_DIR ?? "./demo-audio");
const ADMIN_SECRET = process.env.DEMO_ADMIN_SECRET ?? "beatsync";
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

// ── Startup log ────────────────────────────────────────────────
if (IS_DEMO_MODE) {
  console.log(`🎤 Demo mode enabled — serving ${AUDIO_FILENAMES.length} files from ${AUDIO_DIR}`);
  AUDIO_FILENAMES.forEach((f) => console.log(`   📁 ${f}`));
}

// ── Admin secret auth ──────────────────────────────────────────
export function isValidAdminSecret(secret: string | null): boolean {
  return ADMIN_SECRET !== "" && secret === ADMIN_SECRET;
}
