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

export default async function captureScreenshot(url: string): Promise<Uint8Array> {
  // The Docker image sets this to the system Chromium
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error("CHROMIUM_PATH is not set; point it at a Chrome or Chromium binary");
  }

  const browser = await puppeteer.launch({
    // No sandbox because Docker's default seccomp profile blocks the namespaces it needs
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath,
    headless: true,
    // Same 1.905 ratio as the 1200x630 output; 2x density so text stays sharp at 2560x1344
    defaultViewport: { width: 1280, height: 672, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", blockPrivateRequests());
    await page.goto(url, { waitUntil: "networkidle2" });
    return await page.screenshot({ fullPage: false });
  } finally {
    await browser.close();
  }
}
