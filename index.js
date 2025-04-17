const express = require("express");
const chalk = require("chalk");
const fetchOgImage = require("./utils/fetchOgImage");
const captureScreenshot = require("./utils/captureScreenshot");
const makeThumbnail = require("./utils/makeThumbnail");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

const port = 3000;

app.get("/thumbnail", async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      console.log(chalk.red("[ERROR] No URL provided"));
      return res.status(400).send("Missing URL parameter");
    }

    console.log(chalk.blueBright(`\n🌐 Generating thumbnail for: ${url}`));

    let imgUrl = await fetchOgImage(url);
    let imgBuffer;

    if (imgUrl) {
      console.log(chalk.green("✅ Open Graph image found: ") + imgUrl);
      console.log(chalk.yellow("📥 Fetching Open Graph image..."));
      const resp = await fetch(imgUrl);
      imgBuffer = await resp.buffer();
      console.log(chalk.green("🖼️ Open Graph image fetched successfully!"));
    } else {
      console.log(
        chalk.yellow(
          "⚠️ No Open Graph image found. Falling back to screenshot..."
        )
      );
      imgBuffer = await captureScreenshot(url);
      console.log(chalk.green("📸 Screenshot captured successfully!"));
    }

    console.log(chalk.yellow("🛠️ Generating thumbnail..."));
    const thumb = await makeThumbnail(imgBuffer, {
      width: 500,
      height: 250,
      format: "png",
      quality: 100,
      compressionLevel: 6,
      retina: true,
    });
    console.log(chalk.green("✅ Thumbnail generated successfully!"));

    res.type("image/jpeg").send(thumb);
    console.log(chalk.cyan("🚀 Thumbnail sent to client!\n"));
  } catch (err) {
    console.error(chalk.red("❌ Error generating thumbnail:"), err);
    res.status(500).send("Error generating thumbnail");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () =>
  console.log(
    chalk.magentaBright(`🚀 Server listening on http://localhost:${port}`)
  )
);
