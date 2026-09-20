export const categories = ["交通", "住宿", "餐饮", "办公", "其他"];
export const people = [
  {
    id: "employee",
    name: "陈予安",
    role: "employee",
    title: "员工",
    department: "产品设计部",
    initial: "陈",
  },
  {
    id: "approver",
    name: "林知夏",
    role: "approver",
    title: "审批人",
    department: "产品负责人",
    initial: "林",
  },
  {
    id: "finance",
    name: "许嘉宁",
    role: "finance",
    title: "财务",
    department: "财务管理部",
    initial: "许",
  },
];
export const policy = {
  currency: "CNY",
  limits: { 交通: 20000, 住宿: 50000, 餐饮: 15000, 办公: 100000, 其他: 50000 },
  receiptThreshold: 0,
};
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dateDaysAgo(n) {
  return new Date(
    new Date(`${today()}T12:00:00+08:00`).getTime() - n * 86400000,
  )
    .toISOString()
    .slice(0, 10);
}
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function toCents(value) {
  const s = String(value).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s))
    throw new Error("金额必须为正数，最多两位小数");
  const [i, f = ""] = s.split(".");
  const c = Number(i) * 100 + Number(f.padEnd(2, "0"));
  if (c <= 0 || c > 100000000)
    throw new Error("金额应在 0.01 至 1,000,000 元之间");
  return c;
}
export function inferCategory(text) {
  if (/hotel|accommodat|酒店|宾馆|住宿|民宿/i.test(text)) return "住宿";
  if (
    /taxi|transport|ride|rail|train|打车|交通|出租|滴滴|火车|高铁|车票|机票|地铁/i.test(
      text,
    )
  )
    return "交通";
  if (/cafe|meal|restaurant|coffee|餐|咖啡|饮品|饭/i.test(text)) return "餐饮";
  if (/office|办公|文具|打印|耗材/i.test(text)) return "办公";
  return "其他";
}
export function extractReceipt(text) {
  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const normalized = text.replace(/[，,](?=\d{3})/g, "");
  const total = normalized.match(
    /(?:价税合计[^\n]{0,12}|合计|总计|实付|TOTAL(?:\s*CNY)?|AMOUNT DUE)\s*[:：]?\s*[¥￥]?\s*(\d{1,7}(?:\.\d{1,2})?)/i,
  );
  const amounts = [
    ...normalized.matchAll(/(?:[¥￥]\s*|CNY\s*)(\d{1,7}(?:\.\d{1,2})?)/gi),
  ].map((x) => x[1]);
  const dateMatch = text.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
    : "";
  const explicit = text.match(
    /(?:Merchant|商户|销售方名称|销售方|商家)[ \t]*[:：][ \t]*([^\n]+)/i,
  );
  const merchant =
    explicit?.[1]?.trim() ||
    lines.find(
      (l) =>
        /hotel|taxi|cafe|restaurant|酒店|公司|餐厅|咖啡|出租/i.test(l) &&
        !/:|：/.test(l),
    ) ||
    "";
  let amount = total?.[1] || amounts[0] || "";
  try {
    if (amount) amount = (toCents(amount) / 100).toFixed(2);
  } catch {
    amount = "";
  }
  const currency =
    /\b(?:USD|EUR|GBP|MYR)\b/.exec(text)?.[0] ||
    (/CNY|人民币|￥|¥/.test(text) ? "CNY" : "");
  return {
    merchant,
    amount,
    date: validDate(date) ? date : "",
    category: inferCategory(text),
    currency,
    description: /TEST|测试|合成/.test(text)
      ? "TEST 合成票据，仅用于产品体验"
      : "",
  };
}
export function checks(expense, others = []) {
  const result = [];
  if (!expense.receiptId)
    result.push({
      code: "missing_receipt",
      level: "warning",
      title: "缺少票据",
      detail: "请补充票据，或在用途说明中解释原因。",
    });
  const limit = policy.limits[expense.category] ?? 50000;
  if (expense.amountCents > limit)
    result.push({
      code: "over_limit",
      level: "warning",
      title: "超出单笔标准",
      detail: `${expense.category}单笔标准 ¥${limit / 100}，超出 ¥${((expense.amountCents - limit) / 100).toFixed(2)}。请说明业务原因。`,
    });
  const duplicate = others.find(
    (e) =>
      e.id !== expense.id &&
      ((expense.receiptHash && e.receiptHash === expense.receiptHash) ||
        (e.amountCents === expense.amountCents &&
          e.date === expense.date &&
          e.merchant.trim().toLowerCase() ===
            expense.merchant.trim().toLowerCase())),
  );
  if (duplicate)
    result.push({
      code: "duplicate",
      level: "warning",
      title: "疑似重复费用",
      detail: `与「${duplicate.merchant}」的票据或商户、日期、金额一致，请人工核对。`,
      relatedId: duplicate.id,
    });
  if (expense.date > today())
    result.push({
      code: "future_date",
      level: "warning",
      title: "费用日期在未来",
      detail: "请核实日期是否识别正确。",
    });
  return result;
}
export function assertTransition(report, action, user, expenses, note = "") {
  const fail = (m) => {
    throw Object.assign(new Error(m), { status: 409 });
  };
  if (action === "submit") {
    if (user.id !== report.ownerId) fail("只有提报人可以提交");
    if (!["draft", "rejected"].includes(report.status))
      fail("当前报销单不能提交");
    if (!expenses.length) fail("请先添加费用");
    if (
      expenses.some(
        (e) =>
          !e.merchant ||
          !e.description ||
          !validDate(e.date) ||
          e.amountCents <= 0,
      )
    )
      fail("请补全费用信息及用途说明");
    return "pending";
  }
  if (action === "withdraw") {
    if (user.id !== report.ownerId || report.status !== "pending")
      fail("只能撤回自己的待审批报销单");
    return "draft";
  }
  if (["approve", "reject"].includes(action)) {
    if (user.role !== "approver" || user.id === report.ownerId)
      fail("当前角色无审批权限");
    if (report.status !== "pending") fail("报销单不在待审批状态");
    if (action === "reject" && !note.trim()) fail("请填写退回原因");
    return action === "approve" ? "approved" : "rejected";
  }
  if (action === "settle") {
    if (user.role !== "finance" || report.status !== "approved")
      fail("仅财务可以登记已通过报销单的结算");
    return "paid";
  }
  fail("不支持的操作");
}
export function parseInstruction(message) {
  const amount =
    message.match(/(?:[¥￥]\s*)(\d+(?:\.\d{1,2})?)/)?.[1] ||
    message.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块)/)?.[1];
  if (!amount) return null;
  let cents;
  try {
    cents = toCents(amount);
  } catch {
    return null;
  }
  const category = inferCategory(message);
  const date = message.includes("昨天")
    ? dateDaysAgo(1)
    : message.match(/\d{4}-\d{2}-\d{2}/)?.[0] || today();
  const merchant =
    message
      .match(
        /(?:商户|商家)(?:名称)?(?:为|是|：|:)?\s*[「“"]?([^，。\n」”"]+)/,
      )?.[1]
      ?.trim() ||
    {
      交通: "交通出行",
      住宿: "住宿费用",
      餐饮: "餐饮消费",
      办公: "办公采购",
      其他: "待补充商户",
    }[category];
  return {
    merchant,
    amount: (cents / 100).toFixed(2),
    date,
    category,
    currency: "CNY",
    description: message.slice(0, 500),
  };
}
