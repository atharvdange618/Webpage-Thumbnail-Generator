const ogs = require("open-graph-scraper");

module.exports = async function fetchOgImage(url) {
  const { result } = await ogs({ url });
  return result.ogImage && result.ogImage.url;
};
