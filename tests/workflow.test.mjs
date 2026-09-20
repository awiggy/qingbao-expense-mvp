import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, csvCell } from "../server/app.mjs";
import { toCents, validDate, extractReceipt } from "../server/domain.mjs";

test("金额采用整数分，拒绝精度丢失、非正数与非法日期", () => {
  assert.equal(toCents("0.29"), 29);
  assert.equal(toCents("680.00"), 68000);
  for (const bad of ["0", "-1", "1.001", "1e3", "1000001", "NaN"])
    assert.throws(() => toCents(bad));
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
});

test("按 OCR 文本提取信息，不把下一行字段标签误作商户", () => {
  const result = extractReceipt(
    "TEST CITY TAXI\nMerchant：\nDate：\nTEST CITY TAXI\n2026-09-20\nTOTAL CNY\n38.00",
  );
  assert.equal(result.merchant, "TEST CITY TAXI");
  assert.equal(result.amount, "38.00");
  assert.equal(result.currency, "CNY");
  assert.equal(extractReceipt("unreadable").amount, "");
  assert.equal(extractReceipt("TOTAL USD 38.00").currency, "USD");
});

test("CSV 导出防止用户字段被当作电子表格公式", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("正常用途"), '"正常用途"');
  assert.equal(csvCell('商户"名称'), '"商户""名称"');
});

test("完整工作流：持久化、权限、锁定、异常说明、退回重提、模拟结算", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "qingbao-test-"));
  const { app, db } = createApp({ directory, seed: false });
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
    const res = await fetch(base + url, {
      method,
      headers: {
        Cookie: cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return { status: res.status, data: await res.json() };
  }
  assert.equal((await call("/state")).status, 401);
  await call("/session");
  const foreign = await fetch(base + "/session", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ personId: "finance" }),
  });
  assert.equal(foreign.status, 403);
  let receiptId = null;
  if (existsSync("bin/receipt-ocr")) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([readFileSync("public/samples/test-hotel.pdf")], {
        type: "application/pdf",
      }),
      "test-hotel.pdf",
    );
    const res = await fetch(base + "/receipts", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    const data = await res.json();
    assert.equal(res.status, 201, JSON.stringify(data));
    assert.equal(data.fields.amount, "680.00");
    assert.equal(data.fields.merchant, "TEST RIVERSIDE HOTEL");
    assert.equal(data.fields.currency, "CNY");
    receiptId = data.id;
  }
  const expense = {
    merchant: "TEST RIVERSIDE HOTEL",
    amount: "680.00",
    currency: "CNY",
    date: "2026-09-20",
    category: "住宿",
    description: "TEST 客户访谈住宿，会场附近标准房已满",
    receiptId,
  };
  assert.equal(
    (await call("/expenses", { ...expense, amount: "1.001" })).status,
    400,
  );
  const e = await call("/expenses", expense);
  assert.equal(e.status, 201);
  const eid = e.data.id;
  const report = await call("/reports", {
    title: "TEST 完整流程",
    expenseIds: [eid],
  });
  assert.equal(report.status, 201);
  const rid = report.data.id;
  assert.equal(
    (await call("/reports", { title: "重复归集", expenseIds: [eid] })).status,
    409,
  );
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "approve", note: "越权" }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "submit" })).status,
    200,
  );
  assert.equal((await call(`/expenses/${eid}`, expense, "PATCH")).status, 409);
  await call("/session", { personId: "approver" });
  assert.equal((await call("/expenses", expense)).status, 403);
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "approve" })).status,
    400,
  );
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "reject" })).status,
    409,
  );
  assert.equal(
    (
      await call(`/reports/${rid}/action`, {
        action: "reject",
        note: "补充入住事由",
      })
    ).status,
    200,
  );
  await call("/session", { personId: "employee" });
  assert.equal(
    (
      await call(
        `/expenses/${eid}`,
        { ...expense, description: expense.description + "；已补充事由" },
        "PATCH",
      )
    ).status,
    200,
  );
  await call(`/reports/${rid}/action`, { action: "submit" });
  await call("/session", { personId: "approver" });
  assert.equal(
    (
      await call(`/reports/${rid}/action`, {
        action: "approve",
        note: "TEST，超标原因已核实",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "settle" })).status,
    409,
  );
  await call("/session", { personId: "finance" });
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "settle" })).status,
    200,
  );
  assert.equal(
    (await call(`/reports/${rid}/action`, { action: "settle" })).status,
    409,
  );
  const detail = (await call(`/reports/${rid}`)).data;
  assert.equal(detail.status, "paid");
  assert.equal(detail.totalCents, 68000);
  assert.deepEqual(
    detail.events.map((e) => e.action),
    ["create", "submit", "reject", "edit", "submit", "approve", "settle"],
  );
  assert.match(detail.events.at(-1).note, /未发生真实付款/);
  const csv = await fetch(base + `/reports/${rid}/export`, {
    headers: { Cookie: cookie },
  });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /680.00/);
  const reopened = createApp({ directory, seed: false });
  assert.equal(
    reopened.db.prepare("SELECT status FROM reports WHERE id=?").get(rid)
      .status,
    "paid",
  );
  reopened.db.close();
  await call("/session", { personId: "employee" });
  await call("/expenses", expense);
  const state = (await call("/state")).data;
  assert(
    state.expenses.every((e) => e.warnings.some((w) => w.code === "duplicate")),
  );
  const assistant = await call("/assistant", {
    message: "昨天打车 38 元，前往客户现场",
  });
  assert.equal(assistant.data.draft.amount, "38.00");
  assert.equal(
    (await call("/state")).data.expenses.length,
    2,
    "对话草稿不能自动保存",
  );
  const bad = new FormData();
  bad.append("file", new Blob(["not a png"], { type: "image/png" }), "bad.png");
  assert.equal(
    (
      await fetch(base + "/receipts", {
        method: "POST",
        headers: { Cookie: cookie },
        body: bad,
      })
    ).status,
    400,
  );
});
