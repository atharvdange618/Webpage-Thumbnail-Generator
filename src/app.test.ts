import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import app from "./app.ts";
import fetchOgImage from "./utils/fetchOgImage.ts";
import captureScreenshot from "./utils/captureScreenshot.ts";

// Chromium and the OG scraper hit the network; makeThumbnail stays real so responses are real PNGs
vi.mock("./utils/fetchOgImage.ts");
vi.mock("./utils/captureScreenshot.ts");

const png = (width: number, height: number, background: string): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

const realFetch = globalThis.fetch;
let server: Server;
let base: string;
let screenshot: Buffer;
let ogImage: Buffer;
// What the og:image URL returns when the server fetches it
let ogResponse: () => Response;

beforeAll(async () => {
  screenshot = await png(2560, 1344, "#00f");
  ogImage = await png(1200, 630, "#f00");
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => { resolve(); }));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  base = `http://127.0.0.1:${address.port}`;

  // Requests to the test server go through; anything else is the server fetching an og:image
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const href = input instanceof Request ? input.url : input.toString();
    return href.startsWith(base) ? realFetch(input, init) : Promise.resolve(ogResponse());
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  server.close();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(captureScreenshot).mockResolvedValue(screenshot);
  ogResponse = () => new Response(ogImage, { headers: { "content-type": "image/png" } });
});

const get = (query: string): Promise<Response> => fetch(`${base}/thumbnail?${query}`);

// Red pixels mean the OG image was used, blue means the screenshot
async function topLeftColour(resp: Response): Promise<"og" | "screenshot"> {
  const { data } = await sharp(Buffer.from(await resp.arrayBuffer()))
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[0] === 255 ? "og" : "screenshot";
}

describe("GET /thumbnail", () => {
  describe("input validation", () => {
    it("returns 400 without a url", async () => {
      expect((await get("")).status).toBe(400);
    });

    it("returns 400 when url is given twice (Express parses it as an array)", async () => {
      expect((await get("url=https://a.com&url=https://b.com")).status).toBe(400);
    });
  });

  describe("Open Graph mode (default)", () => {
    it("uses the og:image when it loads", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue("https://example.com/og.png");
      const resp = await get("url=https://example.com");

      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toBe("image/png");
      expect(resp.headers.get("x-thumbnail-source")).toBe("og");
      expect(await topLeftColour(resp)).toBe("og");
      expect(captureScreenshot).not.toHaveBeenCalled();
    });

    it("falls back to a screenshot when the page has no og:image", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(undefined);
      const resp = await get("url=https://example.com");

      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
      expect(captureScreenshot).toHaveBeenCalledWith("https://example.com");
    });

    it.each([
      { case: "returns 404", response: () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } }) },
      { case: "returns HTML with a 200", response: () => new Response("<html>", { headers: { "content-type": "text/html" } }) },
      { case: "has no content-type", response: () => new Response(new Uint8Array([1, 2, 3])) },
    ])("falls back to a screenshot when the og:image $case", async ({ response }) => {
      vi.mocked(fetchOgImage).mockResolvedValue("https://example.com/og.png");
      ogResponse = response;
      const resp = await get("url=https://example.com");

      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
    });

    it("falls back to a screenshot when fetching the og:image throws", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue("https://dead.invalid/og.png");
      ogResponse = () => {
        throw new TypeError("fetch failed");
      };
      const resp = await get("url=https://example.com");

      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
    });
  });

  describe("live screenshot mode", () => {
    it("skips the og:image lookup entirely", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue("https://example.com/og.png");
      const resp = await get("url=https://example.com&source=screenshot");

      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
      expect(fetchOgImage).not.toHaveBeenCalled();
    });

    it("treats unknown source values as the default mode", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue("https://example.com/og.png");
      const resp = await get("url=https://example.com&source=bogus");

      expect(resp.headers.get("x-thumbnail-source")).toBe("og");
    });
  });

  describe("failures", () => {
    it("returns 500 when the page itself can't be scraped", async () => {
      vi.mocked(fetchOgImage).mockRejectedValue(new Error("Page not found"));
      expect((await get("url=https://nonexistent.invalid")).status).toBe(500);
    });

    it("returns 500 when the screenshot fails", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(undefined);
      vi.mocked(captureScreenshot).mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
      expect((await get("url=https://example.com")).status).toBe(500);
    });
  });
});
