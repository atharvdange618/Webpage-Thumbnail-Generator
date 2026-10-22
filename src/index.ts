import chalk from "chalk";
import app from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
// Loopback by default so only a reverse proxy on the same host can reach it; the Docker
// image sets 0.0.0.0 because the published port arrives on the container's own interface
const host = process.env.HOST ?? "127.0.0.1";

app.listen(port, host, () => {
  console.log(
    chalk.magentaBright(`🚀 Server listening on http://${host}:${port}`)
  );
});
