import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
if (process.platform !== "darwin") {
  console.log("本机 OCR 需要 macOS；其他平台可配置模型接口或手工录入。");
  process.exit(0);
}
mkdirSync("bin", { recursive: true });
const result = spawnSync(
  "swiftc",
  ["scripts/ReceiptOCR.swift", "-o", "bin/receipt-ocr"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
