import { networkInterfaces } from "os";
import { config } from "dotenv";
import { resolve } from "path";

// Load server .env to read DEMO_ADMIN_SECRET
config({ path: resolve(import.meta.dirname, "../apps/server/.env") });

const envLocalPath = resolve(import.meta.dirname, "../apps/client/.env.local");

// Find the first non-internal IPv4 address (WiFi/Ethernet LAN IP)
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((iface) => iface && iface.family === "IPv4" && !iface.internal)?.address;

const ip = lanIp ?? "localhost";
const adminSecret = process.env.DEMO_ADMIN_SECRET ?? "beatsync";

await Bun.write(envLocalPath, `NETWORK=${ip}\n`);
console.log(`LAN IP detected: ${ip}`);
const DEMO_PORT = 2026;
console.log(`🔗 Site:  http://${ip}:${DEMO_PORT}`);
console.log(`🔑 Admin: http://${ip}:${DEMO_PORT}?admin=${encodeURIComponent(adminSecret)}`);
