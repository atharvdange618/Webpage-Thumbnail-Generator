const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

async function captureScreenshot(url) {
  const executablePath = await chromium.executablePath(
    "https://github.com/Sparticuz/chromium/releases/download/v126.0.0/chromium-v126.0.0-pack.tar"
  );

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: executablePath || undefined,
    headless: chromium.headless,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  const buffer = await page.screenshot({ fullPage: false });

  await browser.close();
  return buffer;
}

module.exports = captureScreenshot;
