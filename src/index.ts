import chalk from "chalk";
import app from "./app.ts";

const port = 3000;

app.listen(port, () => {
  console.log(
    chalk.magentaBright(`🚀 Server listening on http://localhost:${port}`)
  );
});
