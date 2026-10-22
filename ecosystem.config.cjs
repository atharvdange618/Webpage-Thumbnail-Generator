// PM2 config for the VPS: npm ci && npm run build, then pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "thumbnail-generator",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        // Match the App Port of the Node.js site in CloudPanel
        PORT: 3000,
        CHROMIUM_PATH: "/usr/bin/chromium",
      },
    },
  ],
};
