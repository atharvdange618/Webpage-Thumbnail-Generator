import http, { type ClientRequest, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import https from "node:https";
import type { LookupAddress } from "node:dns";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, BlockedAddressError, isBlockedAddress, safeGet, safeLookup } from "./ssrf.ts";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1", // NAT64 for 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64 for 169.254.169.254
    "64:ff9b::10.0.0.1", // NAT64 written with a dotted tail
    "64:ff9b::", // NAT64 for 0.0.0.0
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "64:ff9b::14cf:4952", // NAT64 for 20.207.73.82 (github.com on a DNS64 network)
    "64:ff9b::1.1.1.1",
  ])(
    "allows %s",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  );
});

describe("assertPublicUrl", () => {
  it("accepts a public IP literal without a DNS lookup", async () => {
    await expect(assertPublicUrl("https://93.184.216.34/path")).resolves.toBeInstanceOf(URL);
  });

  it.each([
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://2130706433/", // decimal for 127.0.0.1
    "http://0x7f000001/", // hex for 127.0.0.1
    "http://0177.0.0.1/", // octal for 127.0.0.1
    "http://localhost/",
  ])("blocks %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it.each(["file:///etc/passwd", "ftp://93.184.216.34/", "gopher://93.184.216.34/"])(
    "blocks the %s scheme",
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toThrow("URLs aren't allowed");
    }
  );

  it("throws a TypeError for something that isn't a URL", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("safeLookup", () => {
  // The check that runs at connect time, which is what stops DNS rebinding
  const lookup = (hostname: string, all: boolean): Promise<string | LookupAddress[]> =>
    new Promise((resolve, reject) => {
      safeLookup(hostname, { all }, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });

  it.each([true, false])("refuses a host that resolves to loopback (all: %s)", async (all) => {
    await expect(lookup("localhost", all)).rejects.toBeInstanceOf(BlockedAddressError);
  });
});

describe("safeGet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fakes one HTTP response per call; safeGet only reads statusCode, headers and the body stream
  function respond(...responses: { status: number; headers?: Record<string, string>; body?: string }[]) {
    const calls: URL[] = [];
    const fake = ((url: URL, options: http.RequestOptions, callback: (res: IncomingMessage) => void) => {
      // Without the connect-time lookup, a host could rebind to a private IP after assertPublicUrl
      expect(options.lookup).toBe(safeLookup);
      calls.push(url);
      const next = responses.shift();
      if (!next) throw new Error("Unexpected request");
      const res = Object.assign(new PassThrough(), { statusCode: next.status, headers: next.headers ?? {} });
      res.end(next.body ?? "");
      queueMicrotask(() => {
        callback(res as unknown as IncomingMessage);
      });
      return { on: () => undefined, destroy: () => undefined } as unknown as ClientRequest;
    }) as unknown as typeof http.get;
    vi.spyOn(http, "get").mockImplementation(fake);
    vi.spyOn(https, "get").mockImplementation(fake);
    return calls;
  }

  it("returns the body, status and content type", async () => {
    respond({ status: 200, headers: { "content-type": "text/html" }, body: "<html>" });
    const res = await safeGet("https://93.184.216.34/");
    expect(res).toMatchObject({ status: 200, contentType: "text/html", url: "https://93.184.216.34/" });
    expect(res.body.toString()).toBe("<html>");
  });

  it("follows a redirect to another public address and reports the final URL", async () => {
    const calls = respond(
      { status: 301, headers: { location: "https://1.1.1.1/final" } },
      { status: 200, body: "ok" }
    );
    const res = await safeGet("https://93.184.216.34/");
    expect(res.url).toBe("https://1.1.1.1/final");
    expect(calls.map(String)).toEqual(["https://93.184.216.34/", "https://1.1.1.1/final"]);
  });

  it.each(["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:6379/", "http://localhost/"])(
    "refuses a redirect to %s without requesting it",
    async (location) => {
      const calls = respond({ status: 302, headers: { location } }, { status: 200 });
      await expect(safeGet("http://93.184.216.34/")).rejects.toBeInstanceOf(BlockedAddressError);
      expect(calls).toHaveLength(1);
    }
  );

  it("resolves a relative redirect against the current host", async () => {
    const calls = respond({ status: 302, headers: { location: "/next" } }, { status: 200 });
    await safeGet("http://93.184.216.34/start");
    expect(calls.map(String)).toEqual(["http://93.184.216.34/start", "http://93.184.216.34/next"]);
  });

  it("gives up after 5 redirects", async () => {
    respond(...Array.from({ length: 6 }, () => ({ status: 302, headers: { location: "https://93.184.216.34/" } })));
    await expect(safeGet("https://93.184.216.34/")).rejects.toThrow("More than 5 redirects");
  });

  it("refuses to start from a private URL", async () => {
    const calls = respond({ status: 200 });
    await expect(safeGet("http://10.0.0.1/")).rejects.toBeInstanceOf(BlockedAddressError);
    expect(calls).toHaveLength(0);
  });

  describe("deadline", () => {
    const realGet = http.get.bind(http);
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    let server: http.Server | undefined;

    afterEach(async () => {
      server?.closeAllConnections();
      await new Promise((resolve) => server?.close(resolve));
      server = undefined;
    });

    // A real server on 127.0.0.1 that sends headers, then one byte every 50ms forever. The
    // socket never goes quiet, so only a deadline over the whole request can end it.
    async function startDripServer(): Promise<number> {
      const drip = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        const timer = setInterval(() => res.write("."), 50);
        res.on("close", () => {
          clearInterval(timer);
        });
      });
      server = drip;
      await new Promise<void>((resolve) => drip.listen(0, "127.0.0.1", resolve));
      return (drip.address() as AddressInfo).port;
    }

    it("aborts a response that drips forever, using one deadline for the whole call", async () => {
      const port = await startDripServer();
      // safeGet rightly refuses 127.0.0.1, so send the request there behind its back,
      // keeping the signal it passed
      vi.spyOn(http, "get").mockImplementation(((url: URL, options: http.RequestOptions, callback) =>
        realGet(
          `http://127.0.0.1:${String(port)}${url.pathname}`,
          { ...options, lookup: undefined },
          callback
        )) as typeof http.get);
      // The real deadline is 10s; 300ms keeps the test fast
      const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(300));

      const started = Date.now();
      await expect(safeGet("http://93.184.216.34/")).rejects.toThrow("Timed out after 10000ms");
      expect(Date.now() - started).toBeLessThan(2000);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    });
  });
});
