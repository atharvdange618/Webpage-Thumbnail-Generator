import puppeteer, { type HTTPRequest } from "puppeteer-core";
import { assertPublicUrl } from "./ssrf.ts";

// Chromium resolves DNS itself, so every request it makes (navigation, redirects, iframes,
// images, fetch/XHR) is checked here. Results are cached per host for the life of one page.
function blockPrivateRequests(): (request: HTTPRequest) => void {
  const verdicts = new Map<string, Promise<boolean>>();
  const isAllowed = (raw: string): Promise<boolean> => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return Promise.resolve(false);
    }
    // Inline content never leaves the browser
    if (url.protocol === "data:" || url.protocol === "blob:") return Promise.resolve(true);
    const key = `${url.protocol}//${url.host}`;
    let verdict = verdicts.get(key);
    if (!verdict) {
      verdict = assertPublicUrl(url).then(
        () => true,
        () => false
      );
      verdicts.set(key, verdict);
    }
    return verdict;
  };

  return (request) => {
    void isAllowed(request.url())
      .then((ok) => (ok ? request.continue() : request.abort("blockedbyclient")))
      // The page may close while a check is pending; the request no longer matters then
      .catch(() => undefined);
  };
}

// Each capture runs its own 200-400 MB Chromium, so cap how many run at once and queue the rest.
// ponytail: in-memory queue with no length cap, add one (or a 503) if bursts pile up
const MAX_CONCURRENT = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  // Hand the slot straight to the next caller so active stays the same
  if (next) next();
  else active--;
}

export default async function captureScreenshot(url: string): Promise<Uint8Array> {
  // The Docker image sets this to the system Chromium
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error("CHROMIUM_PATH is not set; point it at a Chrome or Chromium binary");
  }

  await acquireSlot();
  try {
    return await capture(url, executablePath);
  } finally {
    releaseSlot();
  }
}

async function capture(url: string, executablePath: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    args: [
      // No sandbox because Docker's default seccomp profile blocks the namespaces it needs
      "--no-sandbox",
      "--disable-dev-shm-usage",
      // WebRTC traffic never passes request interception; this stops it from opening UDP
      // connections of its own. The VPS egress firewall is the real fix.
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
    executablePath,
    headless: true,
    // Same 1.905 ratio as the 1200x630 output; 2x density so text stays sharp at 2560x1344
    defaultViewport: { width: 1280, height: 672, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    // Service workers fetch outside request interception, so keep the page from using them
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on("request", blockPrivateRequests());
    await page.goto(url, { waitUntil: "networkidle2" });
    return await page.screenshot({ fullPage: false });
  } finally {
    await browser.close();
  }
}
