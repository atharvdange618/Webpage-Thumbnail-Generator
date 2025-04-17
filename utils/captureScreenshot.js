const puppeteer = require("puppeteer");

async function captureScreenshot(url) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Set the viewport to 1920×1080
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto(url, { waitUntil: "networkidle2" });

  const buffer = await page.screenshot({ fullPage: false });

  await browser.close();

  return buffer;
}

module.exports = captureScreenshot;
