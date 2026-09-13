import { isIP } from "node:net";
import { networkInterfaces } from "node:os";

const ipv4Int = (ip: string) => ip.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
export function networkGroup(address: string): string | null {
  const ip = address.replace(/^::ffff:/, "").split("%")[0];
  if (ip === "::1" || ip.startsWith("127.")) return "loopback";
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254))) return null;
    for (const list of Object.values(networkInterfaces())) {
      for (const entry of list ?? []) {
        if (entry.family !== "IPv4" || entry.internal) continue;
        const mask = ipv4Int(entry.netmask);
        if ((ipv4Int(ip) & mask) === (ipv4Int(entry.address) & mask)) return `v4:${(ipv4Int(ip) & mask) >>> 0}/${entry.netmask}`;
      }
    }
    return null;
  }
  // LAN sessions use IPv4 or loopback. Do not infer an IPv6 subnet from text.
  return null;
}
export function compatibleNetworks(a: string, b: string) { return a === b || a === "loopback" || b === "loopback"; }
