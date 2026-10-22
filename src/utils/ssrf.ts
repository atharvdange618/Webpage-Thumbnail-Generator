import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net, { type LookupFunction } from "node:net";

export class BlockedAddressError extends Error {
  override name = "BlockedAddressError";
}

// Anything that isn't the public internet. IPv4-mapped IPv6 (::ffff:10.0.0.1) is matched
// against the IPv4 rules by BlockList itself.
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], // "this network"; 0.0.0.0 reaches localhost on Linux
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private, including Docker's default networks
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local (private)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

// DNS64 networks (common on IPv6-only hosts) answer with 64:ff9b::<IPv4>, which a NAT64
// gateway translates back to that IPv4 address
const nat64 = new net.BlockList();
nat64.addSubnet("64:ff9b::", 96, "ipv6");

// The last 32 bits of an IPv6 address as dotted IPv4. Inside a /96 prefix the last two
// groups are always those bits, and "::" leaves empty groups that stand for zeros.
function embeddedIpv4(ip: string): string {
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);
  const [high = "", low = ""] = ip.split(":").slice(-2);
  const bits = ((parseInt(high || "0", 16) << 16) | parseInt(low || "0", 16)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (bits >>> shift) & 255).join(".");
}

export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  // Not an IP at all: refuse rather than guess
  if (family === 0) return true;
  if (family === 6 && nat64.check(ip, "ipv6")) return isBlockedAddress(embeddedIpv4(ip));
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Throws unless the URL is http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedAddressError(`${url.protocol} URLs aren't allowed`);
  }
  // IPv6 literals keep their brackets in URL.hostname
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.promises.lookup(host, { all: true });
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BlockedAddressError(`${url.hostname} points to a private network`);
  }
  return url;
}

/**
 * dns.lookup for http.request that checks the address the socket is about to connect to.
 * Checking here rather than only up front stops DNS rebinding, where a host resolves to a
 * public IP for the check and a private one for the connection.
 */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    const bad = addresses.find(({ address }) => isBlockedAddress(address));
    const first = addresses[0];
    if (bad || !first) {
      callback(new BlockedAddressError(`${hostname} points to a private network`), "");
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};

export interface SafeResponse {
  status: number;
  contentType: string;
  body: Buffer;
  /** Final URL after redirects. */
  url: string;
}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function get(url: URL, signal: AbortSignal): Promise<http.IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; ThumbnailGenerator/1.0)", accept: "*/*" },
      },
      resolve
    );
    req.on("error", reject);
  });
}

function readBody(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        res.destroy(new Error(`Response is larger than ${MAX_BYTES / 1024 / 1024} MB`));
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    res.on("error", reject);
  });
}

/** GET that only talks to public addresses, re-checking every redirect hop. */
export async function safeGet(raw: string): Promise<SafeResponse> {
  // One deadline for every hop and the body. A socket timeout only fires after a quiet
  // stretch, so a server sending a byte every few seconds could hold a request open for days.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let url = await assertPublicUrl(raw);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await get(url, signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        url = await assertPublicUrl(new URL(location, url));
        continue;
      }
      return {
        status,
        contentType: res.headers["content-type"] ?? "",
        body: await readBody(res),
        url: url.href,
      };
    }
    throw new Error(`More than ${MAX_REDIRECTS} redirects`);
  } catch (err) {
    if (signal.aborted) throw new Error(`Timed out after ${TIMEOUT_MS}ms`, { cause: err });
    throw err;
  }
}
