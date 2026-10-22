import ogs from "open-graph-scraper";
import { safeGet } from "./ssrf.ts";

export default async function fetchOgImage(url: string): Promise<string | undefined> {
  // Fetch the page ourselves so the scraper never makes a request that skips the SSRF checks
  const page = await safeGet(url);
  if (page.status >= 400) throw new Error(`Page returned HTTP ${page.status}`);

  const { result } = await ogs({ html: page.body.toString("utf8") });
  // v6+ returns ogImage as an array
  const img = result.ogImage?.[0]?.url;
  // Some sites use a relative path ("/og-image.png"); resolve it against the page,
  // using the final URL in case the page redirected
  return img && new URL(img, page.url).href;
}
