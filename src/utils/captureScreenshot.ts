import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export default async function captureScreenshot(url: string): Promise<Uint8Array> {
  // Set in Docker to use the system Chromium instead of the Lambda build
  const localPath = process.env.CHROMIUM_PATH;
  const executablePath =
    localPath ||
    (await chromium.executablePath(
      // Pack version must match the installed @sparticuz/chromium-min version
      "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar"
    ));

  const browser = await puppeteer.launch({
    args: localPath
      ? ["--no-sandbox", "--disable-dev-shm-usage"]
      : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath,
    headless: localPath ? true : "shell",
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
