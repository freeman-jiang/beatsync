import { networkInterfaces } from "os";
import { resolve } from "path";

const envLocalPath = resolve(import.meta.dirname, "../apps/client/.env.local");

// Find the first non-internal IPv4 address (WiFi/Ethernet LAN IP)
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((iface) => iface && iface.family === "IPv4" && !iface.internal)?.address;

const ip = lanIp ?? "localhost";

await Bun.write(envLocalPath, `NETWORK=${ip}\n`);
console.log(`LAN IP detected: ${ip}`);
console.log(`🔗 Production site: http://${ip}:2026`);
console.log(`🔑 Admin site:      http://${ip}:2026?admin=beatsync`);
