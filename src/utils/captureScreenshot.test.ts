import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import captureScreenshot from "./captureScreenshot.ts";

const launch = vi.spyOn(puppeteer, "launch");
const pixels = new Uint8Array([1, 2, 3]);
const goto = vi.fn<Page["goto"]>();
const close = vi.fn<Browser["close"]>();
const setRequestInterception = vi.fn<Page["setRequestInterception"]>();
const setBypassServiceWorker = vi.fn<Page["setBypassServiceWorker"]>();
// The handler captureScreenshot registers for Chromium's "request" events
let onRequest: ((request: HTTPRequest) => void) | undefined;
let browser: Browser;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHROMIUM_PATH", "/usr/bin/chromium");
  onRequest = undefined;
  close.mockResolvedValue();
  goto.mockResolvedValue(null);
  setRequestInterception.mockResolvedValue();
  setBypassServiceWorker.mockResolvedValue();
  // Only the methods captureScreenshot calls; the real Browser and Page have hundreds
  const page = {
    goto,
    setRequestInterception,
    setBypassServiceWorker,
    screenshot: vi.fn().mockResolvedValue(pixels),
    on: (event: string, handler: (request: HTTPRequest) => void) => {
      if (event === "request") onRequest = handler;
    },
  } as unknown as Page;
  browser = { newPage: vi.fn().mockResolvedValue(page), close } as unknown as Browser;
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

  describe("request filtering", () => {
    // Sends one request through the registered handler and reports what it did with it
    async function route(url: string): Promise<"continued" | "aborted"> {
      await captureScreenshot("https://93.184.216.34/");
      if (!onRequest) throw new Error("No request handler registered");
      const continueRequest = vi.fn().mockResolvedValue(undefined);
      const abort = vi.fn().mockResolvedValue(undefined);
      onRequest({ url: () => url, continue: continueRequest, abort } as unknown as HTTPRequest);
      await vi.waitFor(() => {
        expect(continueRequest.mock.calls.length + abort.mock.calls.length).toBe(1);
      });
      if (abort.mock.calls.length) expect(abort).toHaveBeenCalledWith("blockedbyclient");
      return continueRequest.mock.calls.length ? "continued" : "aborted";
    }

    it("turns on request interception before navigating", async () => {
      await captureScreenshot("https://example.com");
      expect(setRequestInterception).toHaveBeenCalledWith(true);
      expect(setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(
        goto.mock.invocationCallOrder[0] ?? 0
      );
    });

    it("bypasses service workers before navigating", async () => {
      await captureScreenshot("https://example.com");
      expect(setBypassServiceWorker).toHaveBeenCalledWith(true);
      expect(setBypassServiceWorker.mock.invocationCallOrder[0]).toBeLessThan(
        goto.mock.invocationCallOrder[0] ?? 0
      );
    });

    it("launches Chromium with WebRTC limited to proxied traffic", async () => {
      await captureScreenshot("https://example.com");
      expect(launch.mock.calls[0]?.[0]?.args).toContain(
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"
      );
    });

    it.each([
      "https://93.184.216.34/style.css",
      "data:image/png;base64,iVBORw0KGgo=",
      "blob:https://93.184.216.34/5f1c",
    ])("lets %s through", async (url) => {
      expect(await route(url)).toBe("continued");
    });

    it.each([
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:2375/containers/json",
      "http://localhost:3000/",
      "http://[fd00::1]/",
      "file:///etc/passwd",
      "not a url",
    ])("aborts %s", async (url) => {
      expect(await route(url)).toBe("aborted");
    });
  });

  describe("concurrency", () => {
    // Each launch waits until settleNext() lets the oldest one finish or fail
    const pending: ((error?: Error) => void)[] = [];
    function settleNext(error?: Error): void {
      const settle = pending.shift();
      if (!settle) throw new Error("No launch is waiting");
      settle(error);
    }

    beforeEach(() => {
      pending.length = 0;
      launch.mockImplementation(
        () =>
          new Promise<Browser>((resolve, reject) => {
            pending.push((error) => {
              if (error) reject(error);
              else resolve(browser);
            });
          })
      );
    });

    it("runs two captures at once and starts a queued one when a slot frees up", async () => {
      const captures = [1, 2, 3].map(() => captureScreenshot("https://example.com"));
      await vi.waitFor(() => {
        expect(launch).toHaveBeenCalledTimes(2);
      });

      settleNext();
      await expect(captures[0]).resolves.toBe(pixels);
      await vi.waitFor(() => {
        expect(launch).toHaveBeenCalledTimes(3);
      });

      settleNext();
      settleNext();
      await expect(Promise.all(captures)).resolves.toEqual([pixels, pixels, pixels]);
    });

    it("frees the slot when a capture fails", async () => {
      const captures = [1, 2, 3].map(() => captureScreenshot("https://example.com"));
      await vi.waitFor(() => {
        expect(launch).toHaveBeenCalledTimes(2);
      });

      settleNext(new Error("Failed to launch the browser process"));
      await expect(captures[0]).rejects.toThrow("Failed to launch");
      await vi.waitFor(() => {
        expect(launch).toHaveBeenCalledTimes(3);
      });

      settleNext();
      settleNext();
      await expect(Promise.all(captures.slice(1))).resolves.toEqual([pixels, pixels]);
    });
  });
});
