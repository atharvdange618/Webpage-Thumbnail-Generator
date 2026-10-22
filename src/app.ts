import path from "node:path";
import express from "express";
import chalk from "chalk";
import fetchOgImage from "./utils/fetchOgImage.ts";
import captureScreenshot from "./utils/captureScreenshot.ts";
import makeThumbnail from "./utils/makeThumbnail.ts";

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const app = express();

app.use(express.static(path.join(import.meta.dirname, "..", "public")));

app.get("/thumbnail", async (req, res) => {
  try {
    const url = req.query.url;

    // Also rejects ?url=a&url=b, which Express parses as an array
    if (typeof url !== "string" || !url) {
      console.log(chalk.red("[ERROR] No URL provided"));
      res.status(400).send("Missing URL parameter");
      return;
    }

    console.log(chalk.blueBright(`\n🌐 Generating thumbnail for: ${url}`));

    // source=screenshot skips the OG image, which can be stale; anything else tries OG first
    const live = req.query.source === "screenshot";
    let imgUrl = live ? undefined : await fetchOgImage(url);
    let imgBuffer: Uint8Array | undefined;

    if (imgUrl) {
      console.log(chalk.green("✅ Open Graph image found: ") + imgUrl);
      console.log(chalk.yellow("📥 Fetching Open Graph image..."));
      try {
        const resp = await fetch(imgUrl);
        const type = resp.headers.get("content-type") ?? "";
        // A dead og:image often returns a 404 page or HTML, which sharp can't read
        if (!resp.ok || !type.startsWith("image/")) {
          throw new Error(`HTTP ${resp.status}, ${type || "no content-type"}`);
        }
        imgBuffer = Buffer.from(await resp.arrayBuffer());
        console.log(chalk.green("🖼️ Open Graph image fetched successfully!"));
      } catch (err) {
        console.log(
          chalk.yellow(
            `⚠️ Open Graph image unusable (${errorMessage(err)}). Falling back to screenshot...`
          )
        );
        imgUrl = undefined;
      }
    } else if (live) {
      console.log(chalk.yellow("📸 Live screenshot requested..."));
    } else {
      console.log(
        chalk.yellow(
          "⚠️ No Open Graph image found. Falling back to screenshot..."
        )
      );
    }

    if (!imgBuffer) {
      imgBuffer = await captureScreenshot(url);
      console.log(chalk.green("📸 Screenshot captured successfully!"));
    }

    console.log(chalk.yellow("🛠️ Generating thumbnail..."));
    const thumb = await makeThumbnail(imgBuffer, {
      // 1200x630 is the standard OG size; retina doubles it to 2400x1260
      width: 1200,
      height: 630,
      format: "png",
      compressionLevel: 6,
      retina: true,
    });
    console.log(chalk.green("✅ Thumbnail generated successfully!"));

    res
      .type("image/png")
      .set("X-Thumbnail-Source", imgUrl ? "og" : "screenshot")
      .send(thumb);
    console.log(chalk.cyan("🚀 Thumbnail sent to client!\n"));
  } catch (err) {
    console.error(chalk.red("❌ Error generating thumbnail:"), err);
    res.status(500).send("Error generating thumbnail");
  }
});

export default app;
