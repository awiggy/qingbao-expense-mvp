import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["server/index.mjs"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
function stop() {
  children.forEach((p) => p.kill());
}
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
children.forEach((p) =>
  p.on("exit", (code) => {
    if (code) {
      stop();
      process.exit(code);
    }
  }),
);
