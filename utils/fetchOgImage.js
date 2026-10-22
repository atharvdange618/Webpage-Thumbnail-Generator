const ogs = require("open-graph-scraper");

module.exports = async function fetchOgImage(url) {
  const { result } = await ogs({ url });
  // v6+ returns ogImage as an array
  const img = result.ogImage?.[0]?.url;
  // Some sites use a relative path ("/og-image.png"); resolve it against the page
  return img && new URL(img, url).href;
};
