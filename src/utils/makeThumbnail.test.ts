import { describe, expect, it } from "vitest";
import sharp from "sharp";
import makeThumbnail, { type ThumbnailOptions } from "./makeThumbnail.ts";

const solid = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: "#c33" } }).png().toBuffer();

const ogOptions: ThumbnailOptions = {
  width: 1200,
  height: 630,
  format: "png",
  compressionLevel: 6,
  retina: true,
};

describe("makeThumbnail", () => {
  describe("sizing", () => {
    it.each([
      { source: "larger than the target", w: 3000, h: 2000, expected: [2400, 1260] },
      { source: "smaller than the target", w: 1914, h: 964, expected: [1836, 964] },
      { source: "exactly 1200x630", w: 1200, h: 630, expected: [1200, 630] },
      { source: "portrait", w: 800, h: 1200, expected: [800, 420] },
    ])("crops a source $source to the 1200:630 ratio without upscaling", async ({ w, h, expected }) => {
      const out = await sharp(await makeThumbnail(await solid(w, h), ogOptions)).metadata();
      expect([out.width, out.height]).toEqual(expected);
    });

    it("uses the exact size when retina is off", async () => {
      const out = await sharp(
        await makeThumbnail(await solid(3000, 2000), { ...ogOptions, retina: false })
      ).metadata();
      expect([out.width, out.height]).toEqual([1200, 630]);
    });
  });

  describe("format", () => {
    it("writes full-colour PNG, not a 256-colour palette", async () => {
      const out = await sharp(await makeThumbnail(await solid(3000, 2000), ogOptions)).metadata();
      expect(out.format).toBe("png");
      expect(out.isPalette).toBe(false);
    });

    it("writes JPEG when asked", async () => {
      const out = await sharp(
        await makeThumbnail(await solid(3000, 2000), { width: 600, height: 315, format: "jpeg" })
      ).metadata();
      expect(out.format).toBe("jpeg");
    });

    it("rejects input that isn't an image", async () => {
      await expect(makeThumbnail(Buffer.from("<html>"), ogOptions)).rejects.toThrow();
    });
  });
});
