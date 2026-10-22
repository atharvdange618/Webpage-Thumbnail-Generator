import puppeteer from "puppeteer-core";

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
    await page.goto(url, { waitUntil: "networkidle2" });
    return await page.screenshot({ fullPage: false });
  } finally {
    await browser.close();
  }
}
