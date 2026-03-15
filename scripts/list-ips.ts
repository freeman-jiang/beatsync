import { networkInterfaces } from "os";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dirname, "../apps/server/.env") });

const adminSecret = process.env.DEMO_ADMIN_SECRET ?? "beatsync";

const ifaces = networkInterfaces();

console.log("Network interfaces:\n");

for (const [name, addrs] of Object.entries(ifaces)) {
  if (!addrs) continue;
  for (const addr of addrs) {
    if (addr.family !== "IPv4") continue;
    const label = addr.internal ? "loopback" : "LAN";
    console.log(`  ${name} (${label}): ${addr.address}`);
    if (!addr.internal) {
      console.log(`    🔗 Site:  http://${addr.address}`);
      console.log(`    🔑 Admin: http://${addr.address}?admin=${encodeURIComponent(adminSecret)}`);
    }
  }
}
