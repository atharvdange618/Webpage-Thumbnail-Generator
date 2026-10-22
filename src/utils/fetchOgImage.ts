import ogs from "open-graph-scraper";

export default async function fetchOgImage(url: string): Promise<string | undefined> {
  const { result } = await ogs({ url });
  // v6+ returns ogImage as an array
  const img = result.ogImage?.[0]?.url;
  // Some sites use a relative path ("/og-image.png"); resolve it against the page
  return img && new URL(img, url).href;
}
