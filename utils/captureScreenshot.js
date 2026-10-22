// ESM-only since v13x; require(esm) exposes it on .default
const chromium = require("@sparticuz/chromium-min").default;
const puppeteer = require("puppeteer-core");

async function captureScreenshot(url) {
  // Pack version must match the installed @sparticuz/chromium-min version
  const executablePath = await chromium.executablePath(
    "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar"
  );

  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath,
    headless: "shell",
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  const buffer = await page.screenshot({ fullPage: false });

  await browser.close();
  return buffer;
}

module.exports = captureScreenshot;
