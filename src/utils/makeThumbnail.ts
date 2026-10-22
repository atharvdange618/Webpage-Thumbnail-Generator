import sharp from "sharp";

export interface ThumbnailOptions {
  /** Target width in pixels. */
  width: number;
  /** Target height in pixels. */
  height: number;
  /** Output format. */
  format?: "jpeg" | "png";
  /** JPEG quality (1–100). PNG output is always lossless. */
  quality?: number;
  /** PNG zlib compression (0–9). */
  compressionLevel?: number;
  /** Preserve EXIF orientation. */
  retainOrientation?: boolean;
  /** Double dimensions for HiDPI. */
  retina?: boolean;
}

/** Generate a high-quality thumbnail. */
export default async function makeThumbnail(
  imageBuffer: Uint8Array,
  {
    width,
    height,
    format = "jpeg",
    quality = 90,
    compressionLevel = 9,
    retainOrientation = true,
    retina = false,
  }: ThumbnailOptions
): Promise<Buffer> {
  // Initialize pipeline
  let pipeline = sharp(imageBuffer);

  // Calculate dimensions for Retina if needed
  const fullWidth = retina ? width * 2 : width;
  const fullHeight = retina ? height * 2 : height;

  // Shrink the target to fit a smaller source, so it still crops to the target
  // ratio without upscaling (upscaling adds blur, not detail)
  const { width: srcWidth, height: srcHeight } = await pipeline.metadata();
  const scale = Math.min(1, srcWidth / fullWidth, srcHeight / fullHeight);
  const targetWidth = Math.round(fullWidth * scale);
  const targetHeight = Math.round(fullHeight * scale);

  // Preserve orientation metadata
  if (retainOrientation) pipeline = pipeline.withMetadata();

  // Resize with cover-fit
  pipeline = pipeline.resize(targetWidth, targetHeight, { fit: "cover" });

  // Choose output format & settings
  if (format === "png") {
    // No `quality` here: sharp treats it as a request to quantise to a 256-colour palette
    pipeline = pipeline.png({
      compressionLevel,
      adaptiveFiltering: true,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality,
      mozjpeg: true,
    });
  }

  // Return processed buffer
  return pipeline.toBuffer();
}
