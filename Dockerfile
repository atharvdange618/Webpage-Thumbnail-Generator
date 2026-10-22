FROM node:24-bookworm-slim

# System Chromium brings its own shared libs; the app uses it via CHROMIUM_PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Dev deps are needed for the checks and the client build, then pruned
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# A type error stops the image from building
RUN npm run typecheck && npm run build:client && npm prune --omit=dev

ENV NODE_ENV=production

# Chromium runs with --no-sandbox, so keep it off root
USER node

EXPOSE 3000
# Node 22.18+ runs .ts directly by stripping the types
CMD ["node", "src/index.ts"]
