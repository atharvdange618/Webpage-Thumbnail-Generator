import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import captureScreenshot from "./captureScreenshot.ts";

const launch = vi.spyOn(puppeteer, "launch");
const pixels = new Uint8Array([1, 2, 3]);
const goto = vi.fn<Page["goto"]>();
const close = vi.fn<Browser["close"]>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHROMIUM_PATH", "/usr/bin/chromium");
  close.mockResolvedValue();
  goto.mockResolvedValue(null);
  // Only the methods captureScreenshot calls; the real Browser and Page have hundreds
  const page = { goto, screenshot: vi.fn().mockResolvedValue(pixels) } as unknown as Page;
  const browser = { newPage: vi.fn().mockResolvedValue(page), close } as unknown as Browser;
  launch.mockResolvedValue(browser);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("captureScreenshot", () => {
  it("launches the Chromium at CHROMIUM_PATH and returns the screenshot", async () => {
    await expect(captureScreenshot("https://example.com")).resolves.toBe(pixels);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: "/usr/bin/chromium" })
    );
    expect(goto).toHaveBeenCalledWith("https://example.com", { waitUntil: "networkidle2" });
  });

  it("throws a clear error when CHROMIUM_PATH is not set", async () => {
    vi.stubEnv("CHROMIUM_PATH", "");
    await expect(captureScreenshot("https://example.com")).rejects.toThrow("CHROMIUM_PATH is not set");
    expect(launch).not.toHaveBeenCalled();
  });

  it("closes the browser when navigation fails", async () => {
    goto.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    await expect(captureScreenshot("https://nonexistent.invalid")).rejects.toThrow("ERR_NAME_NOT_RESOLVED");
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the browser after a successful screenshot", async () => {
    await captureScreenshot("https://example.com");
    expect(close).toHaveBeenCalledOnce();
  });
});
