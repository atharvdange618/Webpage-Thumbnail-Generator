# 🖼️ Webpage Thumbnail Generator

A simple yet powerful Node.js application that generates thumbnails of webpages by either extracting Open Graph images or capturing screenshots when OG images aren't available.

## ✨ Features

- 🔍 Automatically extracts Open Graph images from webpages
- 📸 Falls back to capturing screenshots when OG images aren't available
- 🔧 Generates optimized thumbnails with configurable dimensions
- 🔄 Support for high-DPI (Retina) images
- 🎨 Clean, intuitive UI for generating and downloading thumbnails

## 🚀 Live Demo

[Check out the live demo](https://webpage-thumbnail-generator.onrender.com)

![Screenshot of Thumbnail Generator](image.png)

## 📋 Prerequisites

- Docker, or Node.js 22.18 or later (the server runs `.ts` files directly through Node's type stripping)

## 💻 Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/atharvdange618/Webpage-Thumbnail-Generator.git
   cd webpage-thumbnail-generator
   ```

2. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

   The image build runs the typecheck and tests, so a failure stops it.

3. Open your browser and navigate to `http://localhost:3100`

After the first build you can start and stop the `thumbnail-generator` container from Docker Desktop. Run `docker compose up -d --build` again after code changes.

### Without Docker

```bash
npm install
npm run build:client
npm start
```

Screenshots need a Chromium binary: set `CHROMIUM_PATH` to a local Chrome or Chromium. Without it the app downloads a Linux x64 build of Chromium meant for serverless hosts, which won't run on Windows or macOS.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the server and restarts it on changes |
| `npm run dev:client` | Recompiles `src/client/script.ts` on changes |
| `npm run typecheck` | Typechecks the server, tests and client |
| `npm run lint` | ESLint with typescript-eslint's strict type-checked rules |
| `npm test` | Runs the Vitest suite |

## 🛠️ Tech Stack

- **Language**: TypeScript (strict)
- **Backend**: Node.js with Express
- **Screenshot Capture**: Puppeteer
- **Image Processing**: Sharp
- **Open Graph Extraction**: open-graph-scraper
- **Console Output**: Chalk for colorized logs

## 📝 API Usage

### Generate a Thumbnail

```
GET /thumbnail?url=https://example.com
```

**Parameters:**

- `url` (required): The URL of the webpage to generate a thumbnail for
- `source` (optional): `screenshot` skips the Open Graph image and takes a live screenshot. Leave it out to use the OG image when the page has a usable one.

**Response:**

- Content-Type: `image/png`, 2400×1260 (smaller when the OG image itself is smaller, since it is never upscaled)
- `X-Thumbnail-Source`: `og` or `screenshot`
- Body: Binary image data

## 🧩 How It Works

1. When a URL is submitted, the app first attempts to find the Open Graph image associated with the page.
2. If an OG image is found, it's fetched and processed. Relative `og:image` paths are resolved against the page.
3. If there is no OG image, or it fails to load, Puppeteer takes a screenshot of the page.
4. The image is then processed with Sharp to create an optimized thumbnail.
5. The final thumbnail is served to the user, who can preview and download it.

## ⚙️ Configuration Options

The thumbnail generation can be configured with the following options in `src/utils/makeThumbnail.ts`:

- `width`: Target width in pixels
- `height`: Target height in pixels
- `format`: Output format ("jpeg" or "png")
- `quality`: JPEG quality (1-100). PNG output is always lossless.
- `compressionLevel`: PNG zlib compression level (0-9)
- `retainOrientation`: Whether to preserve EXIF orientation
- `retina`: Whether to generate double-sized images for high-DPI displays

## 📁 Project Structure

```
├── src
│   ├── index.ts              # Starts the server
│   ├── app.ts                # Express app and the /thumbnail route
│   ├── client
│   │   └── script.ts         # Frontend, compiled to public/script.js
│   └── utils
│       ├── captureScreenshot.ts  # Puppeteer screenshot logic
│       ├── fetchOgImage.ts       # Open Graph image extraction
│       └── makeThumbnail.ts      # Image processing with Sharp
├── public
│   ├── index.html            # Frontend HTML
│   └── styles.css            # Frontend styles
├── Dockerfile
└── compose.yaml
```

Tests sit next to the code they cover as `*.test.ts`.

## 📈 Future Improvements

- Add support for custom thumbnail dimensions
- Implement caching to improve performance
- Add AVIF output
- Create a proper error page for failed thumbnail generation
- Add social media previews for the generated thumbnails

## 👨‍💻 Author

Atharv Dange - [@atharvdange.\_](https://www.threads.net/@atharvdange._)

## 🙏 Acknowledgments

- [Puppeteer](https://pptr.dev/) for the screenshot capabilities
- [Sharp](https://sharp.pixelplumbing.com/) for the excellent image processing library
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper) for OG image extraction
