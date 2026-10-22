import { beforeEach, describe, expect, it, vi } from "vitest";
import fetchOgImage from "./fetchOgImage.ts";
import { safeGet } from "./ssrf.ts";

vi.mock("./ssrf.ts");

// Serves a page through the mocked safeGet; the scraper parses it for real
const page = (head: string, { url = "https://example.com/blog/post", status = 200 } = {}): void => {
  vi.mocked(safeGet).mockResolvedValue({
    status,
    contentType: "text/html",
    body: Buffer.from(`<!doctype html><html><head>${head}</head><body></body></html>`),
    url,
  });
};
const og = (content: string): string => `<meta property="og:image" content="${content}">`;

describe("fetchOgImage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the page through safeGet", async () => {
    page(og("https://cdn.example.com/og.png"));
    await fetchOgImage("https://example.com/blog/post");
    expect(safeGet).toHaveBeenCalledWith("https://example.com/blog/post");
  });

  it("returns an absolute og:image URL unchanged", async () => {
    page(og("https://cdn.example.com/og.png"));
    await expect(fetchOgImage("https://example.com/blog/post")).resolves.toBe(
      "https://cdn.example.com/og.png"
    );
  });

  it("resolves a root-relative path against the page origin", async () => {
    page(og("/og-image.png"), { url: "https://usetelemetry.vercel.app/" });
    await expect(fetchOgImage("https://usetelemetry.vercel.app/")).resolves.toBe(
      "https://usetelemetry.vercel.app/og-image.png"
    );
  });

  it("resolves a path-relative URL against the page path", async () => {
    page(og("images/og.png"));
    await expect(fetchOgImage("https://example.com/blog/post")).resolves.toBe(
      "https://example.com/blog/images/og.png"
    );
  });

  it("resolves a relative path against the final URL after a redirect", async () => {
    page(og("/og.png"), { url: "https://www.example.com/" });
    await expect(fetchOgImage("https://example.com/")).resolves.toBe("https://www.example.com/og.png");
  });

  it("uses the first image when the page lists several", async () => {
    page(og("https://example.com/first.png") + og("https://example.com/second.png"));
    await expect(fetchOgImage("https://example.com")).resolves.toBe("https://example.com/first.png");
  });

  it("returns undefined when the page has no og:image", async () => {
    page("<title>No preview</title>");
    await expect(fetchOgImage("https://example.com")).resolves.toBeUndefined();
  });

  it("throws when the page returns an error status", async () => {
    page("", { status: 404 });
    await expect(fetchOgImage("https://example.com/missing")).rejects.toThrow("HTTP 404");
  });

  it("propagates fetch errors, such as a private address", async () => {
    vi.mocked(safeGet).mockRejectedValue(new Error("127.0.0.1 points to a private network"));
    await expect(fetchOgImage("http://127.0.0.1")).rejects.toThrow("private network");
  });
});
