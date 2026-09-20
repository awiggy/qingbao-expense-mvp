import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { extractReceipt, parseInstruction, policy } from "./domain.mjs";
const exec = promisify(execFile);

export async function recognizeReceipt(file, root, agent) {
  let text = "",
    notice = "";
  const binary = path.join(root, "bin/receipt-ocr");
  if (existsSync(binary)) {
    try {
      const { stdout } = await exec(binary, [file], {
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      });
      text = JSON.parse(stdout).text;
    } catch {
      notice = "本次本机 OCR 未能读取票据，请检查文件清晰度或手动补充。";
    }
  } else
    notice =
      "本机 OCR 尚未安装，请运行 npm run ocr:build，或手动补充票据信息。";
  let fields = extractReceipt(text),
    mode = text ? "local-ocr" : "manual";
  if (
    text &&
    agent.ready() &&
    agent.activeConfig().capabilities.receiptExtraction
  ) {
    const run = await agent.run({
      kind: "receipt",
      message: text.slice(0, 15000),
    });
    if (run.status === "success") {
      fields = run.result;
      mode = "model";
    } else notice = run.error + " 已保留本机 OCR 结果，请人工确认。";
  }
  return { fields, text, mode, notice };
}

export async function assistant(message, agent, history = []) {
  const config = agent.activeConfig();
  let failure = "",
    trace = null;
  if (agent.ready()) {
    trace = await agent.run({ message, history });
    if (trace.status === "success")
      return {
        ...trace.result,
        mode: "model",
        versionId: trace.versionId,
        runId: trace.id,
      };
    failure = trace.error + " 已切换为本地快捷模式。";
  }
  const local = config.capabilities.expenseDraft
    ? parseInstruction(message)
    : null;
  const meta = {
    mode: "local",
    versionId: agent.snapshot().activeVersion,
    runId: trace?.id || null,
  };
  if (local)
    return {
      message:
        failure +
        "已按本地快捷录入规则整理费用，尚未保存。请核对商户、日期和用途后确认。",
      draft: local,
      ...meta,
    };
  if (/标准|制度|超标|报销|规则/.test(message)) {
    const rules = Object.entries(policy.limits)
      .map(([k, n]) => `${k}单笔 ¥${n / 100}`)
      .join("、");
    return {
      message:
        failure +
        (config.capabilities.policyAnswer
          ? `演示制度：${rules}。超标或缺票需补充说明，最终由审批人决定。`
          : "当前版本未启用制度问答，请咨询审批人。"),
      draft: null,
      ...meta,
    };
  }
  return {
    message:
      failure +
      (config.capabilities.expenseDraft
        ? "当前为本地快捷助手，支持含金额的费用录入。例如：“昨天打车 38 元，前往客户现场”。配置模型后可处理更灵活的描述。"
        : "当前版本未启用费用草稿能力，可手动录入费用。"),
    draft: null,
    ...meta,
  };
}
