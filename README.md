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

- Node.js (v14 or later recommended)
- NPM or Yarn

## 💻 Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/atharvdange618/Webpage-Thumbnail-Generator.git
   cd webpage-thumbnail-generator
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## 🛠️ Tech Stack

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

**Response:**

- Content-Type: `image/jpeg` or `image/png`
- Body: Binary image data

## 🧩 How It Works

1. When a URL is submitted, the app first attempts to find the Open Graph image associated with the page.
2. If an OG image is found, it's fetched and processed.
3. If no OG image is available, Puppeteer is used to take a screenshot of the page.
4. The image is then processed with Sharp to create an optimized thumbnail.
5. The final thumbnail is served to the user, who can preview and download it.

## ⚙️ Configuration Options

The thumbnail generation can be configured with the following options in `utils/makeThumbnail.js`:

- `width`: Target width in pixels
- `height`: Target height in pixels
- `format`: Output format ("jpeg" or "png")
- `quality`: Image quality (1-100)
- `compressionLevel`: PNG zlib compression level (0-9)
- `retainOrientation`: Whether to preserve EXIF orientation
- `retina`: Whether to generate double-sized images for high-DPI displays

## 📁 Project Structure

```
├── index.js              # Main server file

├── public
│   ├── index.html            # Frontend HTML
│   ├── styles.css        # Frontend styles
│   └── script.js         # Frontend JavaScript
└── utils
    ├── captureScreenshot.js  # Puppeteer screenshot logic
    ├── fetchOgImage.js       # Open Graph image extraction
    └── makeThumbnail.js      # Image processing with Sharp
```

## 📈 Future Improvements

- Add support for custom thumbnail dimensions
- Implement caching to improve performance
- Add more output formats (WebP, AVIF)
- Create a proper error page for failed thumbnail generation
- Add social media previews for the generated thumbnails

## 👨‍💻 Author

Atharv Dange - [@atharvdange.\_](https://www.threads.net/@atharvdange._)

## 🙏 Acknowledgments

- [Puppeteer](https://pptr.dev/) for the screenshot capabilities
- [Sharp](https://sharp.pixelplumbing.com/) for the excellent image processing library
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper) for OG image extraction
