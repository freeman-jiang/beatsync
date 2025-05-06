import { AUDIO_DIR } from "../../config";
import * as fs from "fs";
import * as path from "path";

export const createTestServer = () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("Test server"),
  });
  return server;
};

export const setupTestAudioDir = () => {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
};

export const cleanupTestAudioDir = () => {
  if (fs.existsSync(AUDIO_DIR)) {
    fs.rmSync(AUDIO_DIR, { recursive: true, force: true });
  }
};

export const createTestAudioFile = (filename: string, content = "test audio content") => {
  const filePath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}; 