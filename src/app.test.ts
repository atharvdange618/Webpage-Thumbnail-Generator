import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import app from "./app.ts";
import fetchOgImage from "./utils/fetchOgImage.ts";
import captureScreenshot from "./utils/captureScreenshot.ts";
import { BlockedAddressError, safeGet, type SafeResponse } from "./utils/ssrf.ts";

// Chromium and the OG scraper hit the network; makeThumbnail stays real so responses are real PNGs.
// The SSRF checks stay real except safeGet, which would fetch the og:image over the network.
vi.mock("./utils/fetchOgImage.ts");
vi.mock("./utils/captureScreenshot.ts");
vi.mock("./utils/ssrf.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils/ssrf.ts")>()),
  safeGet: vi.fn(),
}));

// A public IP literal, so the up-front check passes without a DNS lookup
const PAGE = "https://93.184.216.34/";
const OG = "https://93.184.216.34/og.png";

const png = (width: number, height: number, background: string): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

const ogResponse = (overrides: Partial<SafeResponse>): SafeResponse => ({
  status: 200,
  contentType: "image/png",
  body: ogImage,
  url: OG,
  ...overrides,
});

let server: Server;
let base: string;
let screenshot: Buffer;
let ogImage: Buffer;

beforeAll(async () => {
  screenshot = await png(2560, 1344, "#00f");
  ogImage = await png(1200, 630, "#f00");
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => { resolve(); }));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(captureScreenshot).mockResolvedValue(screenshot);
  vi.mocked(safeGet).mockResolvedValue(ogResponse({}));
});

const get = (query: string): Promise<Response> => fetch(`${base}/thumbnail?${query}`);
const getPage = (url: string): Promise<Response> => get(`url=${encodeURIComponent(url)}`);

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

    it("returns 400 for a string that isn't a URL", async () => {
      const resp = await getPage("not a url");
      expect(resp.status).toBe(400);
      expect(await resp.text()).toBe("That isn't a valid URL");
    });
  });

  describe("SSRF protection", () => {
    it.each([
      "http://127.0.0.1:3000/",
      "http://localhost/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://192.168.1.1/admin",
      "http://172.17.0.1/",
      "http://[::1]/",
      "http://0.0.0.0/",
      "http://2130706433/", // 127.0.0.1 written as a decimal number
      "file:///etc/passwd",
    ])("refuses %s before scraping or screenshotting", async (url) => {
      const resp = await getPage(url);

      expect(resp.status).toBe(400);
      expect(fetchOgImage).not.toHaveBeenCalled();
      expect(captureScreenshot).not.toHaveBeenCalled();
    });

    it("explains the refusal", async () => {
      const resp = await getPage("http://169.254.169.254/");
      expect(await resp.text()).toBe("169.254.169.254 points to a private network");
    });

    it("falls back to a screenshot when the og:image points into a private network", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue("http://169.254.169.254/og.png");
      vi.mocked(safeGet).mockRejectedValue(new BlockedAddressError("169.254.169.254 points to a private network"));
      const resp = await getPage(PAGE);

      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
    });

    it("returns 500 when the page redirects into a private network", async () => {
      vi.mocked(fetchOgImage).mockRejectedValue(new BlockedAddressError("127.0.0.1 points to a private network"));
      expect((await getPage(PAGE)).status).toBe(500);
    });
  });

  describe("Open Graph mode (default)", () => {
    it("uses the og:image when it loads", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(OG);
      const resp = await getPage(PAGE);

      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toBe("image/png");
      expect(resp.headers.get("x-thumbnail-source")).toBe("og");
      expect(await topLeftColour(resp)).toBe("og");
      expect(safeGet).toHaveBeenCalledWith(OG);
      expect(captureScreenshot).not.toHaveBeenCalled();
    });

    it("falls back to a screenshot when the page has no og:image", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(undefined);
      const resp = await getPage(PAGE);

      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
      expect(captureScreenshot).toHaveBeenCalledWith(PAGE);
    });

    it.each([
      { case: "returns 404", response: { status: 404, contentType: "text/html" } },
      { case: "returns HTML with a 200", response: { contentType: "text/html", body: Buffer.from("<html>") } },
      { case: "has no content-type", response: { contentType: "", body: Buffer.from([1, 2, 3]) } },
    ])("falls back to a screenshot when the og:image $case", async ({ response }) => {
      vi.mocked(fetchOgImage).mockResolvedValue(OG);
      vi.mocked(safeGet).mockResolvedValue(ogResponse(response));
      const resp = await getPage(PAGE);

      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
    });

    it("falls back to a screenshot when fetching the og:image throws", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(OG);
      vi.mocked(safeGet).mockRejectedValue(new Error("Timed out after 10000ms"));
      const resp = await getPage(PAGE);

      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
    });
  });

  describe("live screenshot mode", () => {
    it("skips the og:image lookup entirely", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(OG);
      const resp = await get(`url=${encodeURIComponent(PAGE)}&source=screenshot`);

      expect(resp.headers.get("x-thumbnail-source")).toBe("screenshot");
      expect(await topLeftColour(resp)).toBe("screenshot");
      expect(fetchOgImage).not.toHaveBeenCalled();
    });

    it("treats unknown source values as the default mode", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(OG);
      const resp = await get(`url=${encodeURIComponent(PAGE)}&source=bogus`);

      expect(resp.headers.get("x-thumbnail-source")).toBe("og");
    });
  });

  describe("failures", () => {
    it("returns 500 when the page itself can't be scraped", async () => {
      vi.mocked(fetchOgImage).mockRejectedValue(new Error("Page returned HTTP 404"));
      expect((await getPage(PAGE)).status).toBe(500);
    });

    it("returns 500 when the screenshot fails", async () => {
      vi.mocked(fetchOgImage).mockResolvedValue(undefined);
      vi.mocked(captureScreenshot).mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
      expect((await getPage(PAGE)).status).toBe(500);
    });
  });
});
