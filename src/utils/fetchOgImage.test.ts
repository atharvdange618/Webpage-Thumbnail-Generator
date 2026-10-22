import { beforeEach, describe, expect, it, vi } from "vitest";
import ogs from "open-graph-scraper";
import fetchOgImage from "./fetchOgImage.ts";

vi.mock("open-graph-scraper");

// Only the fields fetchOgImage reads; the real result type has dozens more
const scrape = (ogImage: { url: string }[] | undefined): void => {
  vi.mocked(ogs).mockResolvedValue({
    error: false,
    result: { ogImage },
    html: "",
    response: {},
  } as unknown as Awaited<ReturnType<typeof ogs>>);
};

describe("fetchOgImage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an absolute og:image URL unchanged", async () => {
    scrape([{ url: "https://cdn.example.com/og.png" }]);
    await expect(fetchOgImage("https://example.com/blog/post")).resolves.toBe(
      "https://cdn.example.com/og.png"
    );
  });

  it("resolves a root-relative path against the page origin", async () => {
    scrape([{ url: "/og-image.png" }]);
    await expect(fetchOgImage("https://usetelemetry.vercel.app/")).resolves.toBe(
      "https://usetelemetry.vercel.app/og-image.png"
    );
  });

  it("resolves a path-relative URL against the page path", async () => {
    scrape([{ url: "images/og.png" }]);
    await expect(fetchOgImage("https://example.com/blog/post")).resolves.toBe(
      "https://example.com/blog/images/og.png"
    );
  });

  it("uses the first image when the page lists several", async () => {
    scrape([{ url: "https://example.com/first.png" }, { url: "https://example.com/second.png" }]);
    await expect(fetchOgImage("https://example.com")).resolves.toBe("https://example.com/first.png");
  });

  it.each([
    { case: "no og:image tag", ogImage: undefined },
    { case: "an empty og:image list", ogImage: [] },
  ])("returns undefined for $case", async ({ ogImage }) => {
    scrape(ogImage);
    await expect(fetchOgImage("https://example.com")).resolves.toBeUndefined();
  });

  it("propagates scraper errors, such as a page that won't load", async () => {
    vi.mocked(ogs).mockRejectedValue(new Error("Page not found"));
    await expect(fetchOgImage("https://nonexistent.invalid")).rejects.toThrow("Page not found");
  });
});
