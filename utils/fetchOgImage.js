const ogs = require("open-graph-scraper");

module.exports = async function fetchOgImage(url) {
  const { result } = await ogs({ url });
  // v6+ returns ogImage as an array
  return result.ogImage?.[0]?.url;
};
