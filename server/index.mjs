import "dotenv/config";
import { createApp } from "./app.mjs";
const { app } = createApp();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "127.0.0.1";
if (!["127.0.0.1", "localhost"].includes(host))
  throw new Error("演示版仅绑定本机；对外部署前请接入正式身份认证。");
app.listen(port, host, () =>
  console.log(`轻报服务已启动：http://${host}:${port}`),
);
