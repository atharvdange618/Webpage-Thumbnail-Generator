const sharp = require("sharp");

/**
 * Generate a high-quality thumbnail.
 *
 * @param {Buffer} imageBuffer - Original image buffer.
 * @param {Object} options
 * @param {number} options.width - Target width in pixels.
 * @param {number} options.height - Target height in pixels.
 * @param {"jpeg"|"png"} [options.format="jpeg"] - Output format.
 * @param {number} [options.quality=90] - Quality: JPEG (1–100) or PNG color depth (1–100).
 * @param {number} [options.compressionLevel=9] - PNG zlib compression (0–9).
 * @param {boolean} [options.retainOrientation=true] - Preserve EXIF orientation.
 * @param {boolean} [options.retina=false] - Double dimensions for HiDPI.
 * @returns {Promise<Buffer>}
 */
module.exports = async function makeThumbnail(
  imageBuffer,
  {
    width,
    height,
    format = "jpeg",
    quality = 90,
    compressionLevel = 9,
    retainOrientation = true,
    retina = false,
  }
) {
  // Calculate dimensions for Retina if needed
  const targetWidth = retina ? width * 2 : width;
  const targetHeight = retina ? height * 2 : height;

  // Initialize pipeline
  let pipeline = sharp(imageBuffer);

  // Preserve orientation metadata
  if (retainOrientation) pipeline = pipeline.withMetadata();

  // Resize with cover-fit & no enlargement
  pipeline = pipeline.resize(targetWidth, targetHeight, {
    fit: "cover",
    withoutEnlargement: true,
  });

  // Choose output format & settings
  if (format === "png") {
    pipeline = pipeline.png({
      quality,
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
};
