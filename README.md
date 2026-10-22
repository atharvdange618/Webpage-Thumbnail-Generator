# Webpage Thumbnail Generator

[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-core-40B5A4?logo=puppeteer&logoColor=white)](https://pptr.dev/)
[![Sharp](https://img.shields.io/badge/Sharp-0.35-99CC00)](https://sharp.pixelplumbing.com/)
[![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](compose.yaml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Give it a URL and it returns a 1200×630 thumbnail (2400×1260 for HiDPI). It uses the page's Open Graph image when the page has a usable one, and takes a live screenshot with headless Chromium when it doesn't.

![The thumbnail generator UI after generating a thumbnail for github.com](docs/screenshot.png)

## Features

- Uses the page's `og:image`, resolving relative paths against the page URL
- Falls back to a Chromium screenshot when there is no OG image or it fails to load
- Can skip the OG image and screenshot the live page with `source=screenshot`
- Returns full-colour PNG at 2x resolution, and never upscales a small OG image
- Lets you download PNG or WebP from the UI; the browser encodes the WebP, and Safari falls back to PNG
- Refuses to fetch private, loopback, link-local and cloud metadata addresses (see [Security](#security))

## Quick start

You need Docker, or Node.js 22.18 or later.

```bash
git clone https://github.com/atharvdange618/Webpage-Thumbnail-Generator.git
cd Webpage-Thumbnail-Generator
docker compose up -d --build
```

Open `http://localhost:3100`. The port binds to loopback only, so other machines on your network can't reach it.

The image build runs the typecheck and the test suite, and fails if either one fails. Run `docker compose up -d --build` again after you change code.

### Without Docker

```bash
npm install
npm run build:client
CHROMIUM_PATH=/path/to/chromium npm start
```

The server listens on port 3000 and runs the `.ts` files directly through Node's type stripping, so there is no build step for the server.

## Configuration

| Variable        | Required        | Description                                                                                                                                              |
| --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHROMIUM_PATH` | For screenshots | Path to a Chrome or Chromium binary. The Docker image sets it to `/usr/bin/chromium`. Without it, OG thumbnails still work and screenshot requests fail. |

You can change the output size and encoding in `src/utils/makeThumbnail.ts`.

## API

```
GET /thumbnail?url=<page-url>[&source=screenshot]
```

| Parameter | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `url`     | Yes      | The page to make a thumbnail for. Must be `http` or `https`. |
| `source`  | No       | `screenshot` skips the OG image and captures the live page.  |

| Status | Meaning                                                                    |
| ------ | -------------------------------------------------------------------------- |
| `200`  | `image/png` body. The `X-Thumbnail-Source` header is `og` or `screenshot`. |
| `400`  | Missing or invalid URL, or a host that resolves to a private address       |
| `500`  | Neither the OG image nor the screenshot worked                             |

```bash
curl -o thumb.png "http://localhost:3100/thumbnail?url=https://github.com"
```

## How it works

1. The route checks that the URL is http(s) and that every address its host resolves to is public.
2. `fetchOgImage` downloads the page and reads its `og:image` tag.
3. If that gives no image, or the image won't load, `captureScreenshot` opens the page in headless Chromium.
4. `makeThumbnail` resizes the result with Sharp and encodes it as PNG.

## Security

Anyone who can reach the service can make the server fetch any URL, so outbound requests go through `src/utils/ssrf.ts`:

- It blocks private, loopback, link-local, carrier-grade NAT, multicast and reserved ranges for both IPv4 and IPv6, including IPv4-mapped and NAT64 addresses.
- Server-side fetches check the address at connect time, so a host can't pass the check and then resolve to a private IP. Each redirect hop gets checked again.
- Chromium's requests go through request interception, which aborts any that point at a private host.

Request interception doesn't cover everything Chromium can do. It misses WebSockets and WebRTC, and Chromium runs its own DNS lookups. When you deploy screenshot mode on a public host, add an egress firewall rule that drops container traffic to private ranges.

## Development

| Script                 | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Runs the server and restarts it on changes                |
| `npm run dev:client`   | Recompiles `src/client/script.ts` on changes              |
| `npm run build:client` | Compiles the client to `public/script.js`                 |
| `npm run typecheck`    | Typechecks the server, tests and client                   |
| `npm run lint`         | ESLint with typescript-eslint's strict type-checked rules |
| `npm test`             | Runs the Vitest suite                                     |

```
src/
├── index.ts                  Starts the server
├── app.ts                    Express app and the /thumbnail route
├── client/script.ts          Frontend, compiled to public/script.js
└── utils/
    ├── captureScreenshot.ts  Headless Chromium screenshots
    ├── fetchOgImage.ts       Open Graph image lookup
    ├── makeThumbnail.ts      Resizing and encoding with Sharp
    └── ssrf.ts               Address checks and a safe HTTP client
public/                       index.html and styles.css
```

Tests sit next to the code they cover, as `*.test.ts`.

## Built with

[Express](https://expressjs.com/), [Puppeteer](https://pptr.dev/), [Sharp](https://sharp.pixelplumbing.com/) and [open-graph-scraper](https://github.com/jshemas/openGraphScraper).

## License

[MIT](LICENSE)

## Author

Atharv Dange ([@atharvdangedev](https://x.com/atharvdangedev))
