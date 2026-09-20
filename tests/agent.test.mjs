import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";

test("Agent 配置真实参与请求；调试与发布隔离、版本可回退、密钥不回显", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "qingbao-agent-"));
  const calls = [];
  let invalid = false;
  const modelFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: invalid
                ? "{bad JSON}"
                : JSON.stringify({
                    message: "TEST 模型契约桩回答",
                    draft: {
                      merchant: "TEST Taxi",
                      amount: "38.00",
                      date: "2026-09-20",
                      currency: "CNY",
                      category: "交通",
                      description: "TEST 需求访谈",
                    },
                  }),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 40, total_tokens: 90 },
      }),
      { status: 200 },
    );
  };
  const { app, db } = createApp({ directory, seed: false, modelFetch });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  async function call(url, body, method = body ? "POST" : "GET") {
    const r = await fetch(base + url, {
      method,
      headers: {
        Cookie: cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, data: await r.json() };
  }
  assert.equal((await call("/agent")).status, 401);
  await call("/session");
  let s = (await call("/agent")).data;
  assert.equal(s.activeVersion, 1);
  const config = structuredClone(s.config);
  config.model.baseURL = "https://example-model.invalid/v1";
  config.model.name = "test-model";
  config.prompt.identity = "TEST_PROMPT_ALPHA";
  config.output.format = "json_schema";
  s = (await call("/agent/draft", { config, revision: s.revision }, "PUT"))
    .data;
  assert.equal(s.activeConfig.model.name, "");
  assert.equal(s.config.model.name, "test-model");
  assert.equal(
    (await call("/agent/draft", { config, revision: s.revision - 1 }, "PUT"))
      .status,
    409,
  );
  const missing = await call("/agent/debug", {
    message: "TEST",
    revision: s.revision,
  });
  assert.equal(missing.data.status, "not_configured");
  assert.equal(calls.length, 0);
  assert.equal(
    (await call("/agent/publish", { revision: s.revision })).status,
    422,
  );
  s = (
    await call("/agent/credentials", {
      baseURL: config.model.baseURL,
      apiKey: "TEST-ONLY-FAKE-KEY",
    })
  ).data;
  assert.equal(s.connection.configured, true);
  assert(!JSON.stringify(s).includes("TEST-ONLY-FAKE-KEY"));
  assert.equal(
    statSync(path.join(directory, "agent-secrets.json")).mode & 0o777,
    0o600,
  );
  invalid = true;
  assert.equal(
    (await call("/agent/debug", { message: "TEST", revision: s.revision })).data
      .status,
    "error",
  );
  assert.equal(
    (await call("/agent/publish", { revision: s.revision })).status,
    422,
  );
  invalid = false;
  const debug = (
    await call("/agent/debug", {
      message: "TEST 打车 38 元",
      revision: s.revision,
      history: [{ role: "user", content: "TEST 上下文" }],
    })
  ).data;
  assert.equal(debug.status, "success");
  assert.equal(debug.usage.totalTokens, 90);
  assert.match(calls.at(-1).body.messages[0].content, /TEST_PROMPT_ALPHA/);
  assert.equal(calls.at(-1).body.messages[1].content, "TEST 上下文");
  assert.equal(calls.at(-1).body.response_format.type, "json_schema");
  assert.equal(calls.at(-1).options.redirect, "error");
  s = (
    await call("/agent/publish", {
      revision: s.revision,
      note: "TEST 发布配置",
    })
  ).data;
  assert.equal(s.activeVersion, 2);
  assert.equal(s.activeConfig.prompt.identity, "TEST_PROMPT_ALPHA");
  const employee = (await call("/assistant", { message: "TEST 打车 38 元" }))
    .data;
  assert.equal(employee.mode, "model");
  assert.equal(employee.versionId, 2);
  assert.equal(employee.draft.amount, "38.00");
  s = (await call('/agent/credentials', { baseURL: config.model.baseURL, apiKey: 'TEST-ONLY-ROTATED-KEY' })).data;
  assert.equal((await call('/agent/publish', { revision: s.revision })).status, 422, '更换密钥后，旧测试不能批准发布');
  assert.equal((await call('/agent/runs')).data.find(r => r.id === debug.id).status, 'success', '密钥变更不篡改历史运行结果');
  const beta = structuredClone(s.config);
  beta.prompt.identity = "TEST_PROMPT_BETA";
  s = (
    await call("/agent/draft", { config: beta, revision: s.revision }, "PUT")
  ).data;
  await call("/assistant", { message: "TEST" });
  assert.match(calls.at(-1).body.messages[0].content, /TEST_PROMPT_ALPHA/);
  assert.equal(
    (await call("/agent/publish", { revision: s.revision })).status,
    422,
    "新提示词没有成功调试，不能借旧测试发布",
  );
  await call("/agent/debug", { message: "TEST", revision: s.revision });
  assert.match(calls.at(-1).body.messages[0].content, /TEST_PROMPT_BETA/);
  s = (await call("/agent/publish", { revision: s.revision })).data;
  assert.equal(s.activeVersion, 3);
  s = (await call("/agent/rollback", { id: 2, revision: s.revision })).data;
  assert.equal(s.activeVersion, 2);
  assert.equal(
    s.config.prompt.identity,
    "TEST_PROMPT_BETA",
    "回退不覆盖编辑草稿",
  );
  s = (await call("/agent/restore", { id: 2, revision: s.revision })).data;
  assert.equal(s.config.prompt.identity, "TEST_PROMPT_ALPHA");
  assert.equal(
    (await call("/state")).data.expenses.length,
    0,
    "调试、模型回答不能写入费用",
  );
  const records = (await call("/agent/runs")).data;
  assert(records.some((r) => r.source === "published" && r.versionId === 2));
  assert(!JSON.stringify(records).includes("TEST-ONLY-FAKE-KEY"));
  const reopened = createApp({ directory, seed: false, modelFetch });
  assert.equal(
    reopened.db.prepare("SELECT activeVersion FROM agent_state").get()
      .activeVersion,
    2,
  );
  reopened.db.close();
  const invalidURL = {
    ...beta,
    model: { ...beta.model, baseURL: "https://example.com/v1?key=secret" },
  };
  assert.equal(
    (
      await call(
        "/agent/draft",
        { config: invalidURL, revision: s.revision },
        "PUT",
      )
    ).status,
    400,
  );
});

test("输出规范在服务端执行：必填追问、非法金额与日期、关闭草稿能力", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "qingbao-contract-"));
  let output = {
    message: "TEST",
    draft: {
      merchant: "",
      amount: "38.00",
      date: "2026-09-20",
      category: "交通",
      currency: "CNY",
      description: "TEST",
    },
  };
  const { app, db } = createApp({
    directory,
    seed: false,
    modelFetch: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
      ),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  async function request(url, body, method = "POST") {
    const r = await fetch(
      base + url,
      body
        ? {
            method,
            headers: { Cookie: cookie, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { headers: { Cookie: cookie } },
    );
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r.json();
  }
  await request("/session");
  let s = await request("/agent");
  s.config.model = {
    ...s.config.model,
    baseURL: "https://example-contract.invalid/v1",
    name: "contract-test",
  };
  s = await request(
    "/agent/draft",
    { config: s.config, revision: s.revision },
    "PUT",
  );
  await request("/agent/credentials", {
    baseURL: s.config.model.baseURL,
    apiKey: "TEST-FAKE",
  });
  let run = await request("/agent/debug", {
    message: "TEST",
    revision: s.revision,
  });
  assert.equal(run.result.draft, null);
  assert.match(run.result.message, /商户/);
  output.draft.merchant = "TEST";
  output.draft.amount = "38.001";
  assert.equal(
    (await request("/agent/debug", { message: "TEST", revision: s.revision }))
      .status,
    "error",
  );
  output.draft.amount = "38.00";
  output.draft.date = "2026-02-30";
  assert.equal(
    (await request("/agent/debug", { message: "TEST", revision: s.revision }))
      .status,
    "error",
  );
  output.draft.date = "2026-09-20";
  output.draft.currency = "USD";
  assert.equal(
    (await request("/agent/debug", { message: "TEST", revision: s.revision }))
      .status,
    "error",
  );
  output.draft.currency = "CNY";
  s.config.capabilities.expenseDraft = false;
  s = await request(
    "/agent/draft",
    { config: s.config, revision: s.revision },
    "PUT",
  );
  assert.equal(
    (await request("/agent/debug", { message: "TEST", revision: s.revision }))
      .result.draft,
    null,
  );
});
