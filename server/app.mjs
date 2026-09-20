import express from "express";
import multer from "multer";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openDB } from "./db.mjs";
import {
  people,
  categories,
  policy,
  checks,
  toCents,
  validDate,
  assertTransition,
} from "./domain.mjs";
import { recognizeReceipt, assistant } from "./ai.mjs";
import {
  createAgentService,
  mountAgentRoutes,
  messageSchema,
} from "./agent.mjs";

const id = z.string().min(1).max(100);
const expenseSchema = z.object({
  merchant: z.string().trim().min(1, "请填写商户").max(100),
  amount: z.string().min(1),
  date: z.string().refine(validDate, "请输入有效日期"),
  category: z.enum(categories),
  currency: z.literal("CNY").default("CNY"),
  description: z.string().trim().max(500).default(""),
  receiptId: id.nullable().optional(),
});
const reportSchema = z.object({
  title: z.string().trim().min(1, "请填写报销单名称").max(100),
  expenseIds: z.array(id).min(1, "请选择至少一笔费用").max(100),
});
const now = () => new Date().toISOString();
const error = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function csvCell(v) {
  const s = String(v ?? "");
  return (
    '"' + (/^[\s]*[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
}
export function createApp({
  root = process.cwd(),
  directory = path.join(root, "data"),
  seed = true,
  modelFetch = fetch,
} = {}) {
  const app = express();
  const db = openDB(directory, seed);
  const agent = createAgentService(db, directory, { modelFetch });
  const uploadDir = path.join(directory, "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const sessions = new Map();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        const o = new URL(req.headers.origin);
        if (
          !["http:", "https:"].includes(o.protocol) ||
          !["localhost", "127.0.0.1"].includes(o.hostname)
        )
          throw Error();
      } catch {
        return res.status(403).json({ error: "请求来源不受信任" });
      }
    }
    next();
  });
  const sessionId = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("qb_session="))
      ?.slice(11);
  function startSession(res, person) {
    const token = randomBytes(24).toString("hex");
    sessions.set(token, { person, expires: Date.now() + 86400000 });
    res.cookie("qb_session", token, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 86400000,
      path: "/",
    });
    return person;
  }
  app.get("/api/session", (req, res) => {
    const existing = sessions.get(sessionId(req));
    res.json({
      user:
        existing && existing.expires > Date.now()
          ? existing.person
          : startSession(res, people[0]),
      people,
      mode: agent.ready()
        ? "model"
        : existsSync(path.join(root, "bin/receipt-ocr"))
          ? "local-ocr"
          : "manual",
      demo: true,
    });
  });
  app.post("/api/session", (req, res) => {
    const person = people.find((x) => x.id === req.body?.personId);
    if (!person) throw error("请选择有效演示角色");
    sessions.delete(sessionId(req));
    res.json({ user: startSession(res, person) });
  });
  app.use("/api", (req, res, next) => {
    const session = sessions.get(sessionId(req));
    if (!session || session.expires < Date.now())
      return res.status(401).json({ error: "演示会话已过期，请刷新页面" });
    req.user = session.person;
    next();
  });
  const isOwner = (req, owner) => req.user.id === owner;
  mountAgentRoutes(app, agent);
  const assertEmployee = (req) => {
    if (req.user.role !== "employee")
      throw error("请切换为员工角色录入费用", 403);
  };
  const getReport = (req, rid) => {
    const r = db.prepare("SELECT * FROM reports WHERE id=?").get(rid);
    if (!r) throw error("报销单不存在", 404);
    if (req.user.role === "employee" && !isOwner(req, r.ownerId))
      throw error("无权访问", 403);
    return r;
  };
  const allExpenses = () =>
    db
      .prepare(
        "SELECT e.*,r.hash AS receiptHash,r.name AS receiptName,r.mime AS receiptMime FROM expenses e LEFT JOIN receipts r ON r.id=e.receiptId ORDER BY e.createdAt DESC",
      )
      .all();
  const enrich = (list, reports) =>
    list.map((e) => ({
      ...e,
      status: reports.find((r) => r.id === e.reportId)?.status || "draft",
      warnings: checks(e, list),
    }));
  function addEvent(reportId, actorId, action, note = "") {
    db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      randomUUID(),
      reportId,
      actorId,
      action,
      note,
      now(),
    );
  }
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function validateReceipt(req, receiptId) {
    if (!receiptId) return null;
    const r = db.prepare("SELECT * FROM receipts WHERE id=?").get(receiptId);
    if (!r || r.ownerId !== req.user.id) throw error("无法关联该票据", 403);
    return receiptId;
  }
  function canEdit(req, e) {
    if (!e || !isOwner(req, e.ownerId)) throw error("无权修改该费用", 403);
    if (e.reportId) {
      const r = getReport(req, e.reportId);
      if (!["draft", "rejected"].includes(r.status))
        throw error("已提交费用不能直接修改，请先撤回", 409);
    }
  }
  app.get("/api/state", (req, res) => {
    const allReports = db
      .prepare("SELECT * FROM reports ORDER BY updatedAt DESC")
      .all();
    const reports = allReports.filter(
      (r) => req.user.role !== "employee" || r.ownerId === req.user.id,
    );
    const expenses = enrich(
      allExpenses().filter(
        (e) => req.user.role !== "employee" || e.ownerId === req.user.id,
      ),
      reports,
    );
    res.json({
      reports: reports.map((r) => {
        const items = expenses.filter((e) => e.reportId === r.id);
        return {
          ...r,
          totalCents: items.reduce((s, e) => s + e.amountCents, 0),
          count: items.length,
          warningCount: items.filter((e) => e.warnings.length).length,
          owner: people.find((p) => p.id === r.ownerId),
        };
      }),
      expenses,
      policy,
      categories,
      user: req.user,
    });
  });
  app.get("/api/reports/:id", (req, res) => {
    const r = getReport(req, req.params.id);
    const all = allExpenses();
    const expenses = all
      .filter((e) => e.reportId === r.id)
      .map((e) => ({ ...e, status: r.status, warnings: checks(e, all) }));
    const events = db
      .prepare("SELECT * FROM events WHERE reportId=? ORDER BY createdAt,id")
      .all(r.id)
      .map((e) => ({
        ...e,
        actor: people.find((p) => p.id === e.actorId)?.name || "系统",
      }));
    res.json({
      ...r,
      expenses,
      events,
      owner: people.find((p) => p.id === r.ownerId),
      totalCents: expenses.reduce((s, e) => s + e.amountCents, 0),
    });
  });
  app.post("/api/expenses", (req, res) => {
    assertEmployee(req);
    const body = expenseSchema.parse(req.body);
    let cents;
    try {
      cents = toCents(body.amount);
    } catch (e) {
      throw error(e.message);
    }
    const receiptId = validateReceipt(req, body.receiptId);
    const eid = randomUUID();
    db.prepare("INSERT INTO expenses VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
      eid,
      req.user.id,
      body.merchant,
      cents,
      "CNY",
      body.date,
      body.category,
      body.description,
      receiptId,
      null,
      now(),
      now(),
    );
    res.status(201).json({ id: eid });
  });
  app.patch("/api/expenses/:id", (req, res) => {
    assertEmployee(req);
    const e = db
      .prepare("SELECT * FROM expenses WHERE id=?")
      .get(req.params.id);
    canEdit(req, e);
    const body = expenseSchema.parse(req.body);
    let cents;
    try {
      cents = toCents(body.amount);
    } catch (e) {
      throw error(e.message);
    }
    const receiptId = validateReceipt(req, body.receiptId);
    transaction(() => {
      db.prepare(
        "UPDATE expenses SET merchant=?,amountCents=?,date=?,category=?,description=?,receiptId=?,updatedAt=? WHERE id=?",
      ).run(
        body.merchant,
        cents,
        body.date,
        body.category,
        body.description,
        receiptId,
        now(),
        e.id,
      );
      if (e.reportId)
        addEvent(
          e.reportId,
          req.user.id,
          "edit",
          `更新费用「${body.merchant}」`,
        );
    });
    res.json({ id: e.id });
  });
  app.post("/api/reports", (req, res) => {
    assertEmployee(req);
    const b = reportSchema.parse(req.body);
    if (new Set(b.expenseIds).size !== b.expenseIds.length)
      throw error("费用选择重复");
    const rid = randomUUID();
    transaction(() => {
      for (const eid of b.expenseIds) {
        const e = db.prepare("SELECT * FROM expenses WHERE id=?").get(eid);
        if (!e || e.ownerId !== req.user.id || e.reportId)
          throw error("有费用已归入报销单，请刷新后重试", 409);
      }
      db.prepare("INSERT INTO reports VALUES(?,?,?,?,?,?)").run(
        rid,
        b.title,
        req.user.id,
        "draft",
        now(),
        now(),
      );
      const update = db.prepare(
        "UPDATE expenses SET reportId=?,updatedAt=? WHERE id=?",
      );
      b.expenseIds.forEach((eid) => update.run(rid, now(), eid));
      addEvent(
        rid,
        req.user.id,
        "create",
        `归集 ${b.expenseIds.length} 笔费用`,
      );
    });
    res.status(201).json({ id: rid });
  });
  app.post("/api/reports/:id/action", (req, res) => {
    const b = z
      .object({
        action: z.enum(["submit", "withdraw", "approve", "reject", "settle"]),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(req.body);
    transaction(() => {
      const r = getReport(req, req.params.id);
      const all = allExpenses();
      const items = all.filter((e) => e.reportId === r.id);
      const status = assertTransition(r, b.action, req.user, items, b.note);
      if (
        b.action === "approve" &&
        items.some((e) => checks(e, all).length) &&
        !b.note
      )
        throw error("该报销单存在异常，请填写审核说明");
      db.prepare("UPDATE reports SET status=?,updatedAt=? WHERE id=?").run(
        status,
        now(),
        r.id,
      );
      addEvent(
        r.id,
        req.user.id,
        b.action,
        b.action === "settle"
          ? "演示：已登记结算，未发生真实付款。" + b.note
          : b.note,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/reports/:id/comments", (req, res) => {
    const r = getReport(req, req.params.id);
    const { note } = z
      .object({ note: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    addEvent(r.id, req.user.id, "comment", note);
    res.status(201).json({ ok: true });
  });
  app.get("/api/reports/:id/export", (req, res) => {
    const r = getReport(req, req.params.id);
    const rows = db
      .prepare("SELECT * FROM expenses WHERE reportId=?")
      .all(r.id);
    const header = [
      "报销单",
      "状态",
      "商户",
      "日期",
      "分类",
      "金额(CNY)",
      "用途",
    ];
    const csv =
      "\uFEFF" +
      [
        header,
        ...rows.map((e) => [
          r.title,
          r.status,
          e.merchant,
          e.date,
          e.category,
          (e.amountCents / 100).toFixed(2),
          e.description,
        ]),
      ]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qingbao-${r.id}.csv"`,
    );
    res.send(csv);
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) =>
        cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (
        !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
          file.mimetype,
        ) ||
        !/^\.(png|jpg|jpeg|webp|pdf)$/.test(
          path.extname(file.originalname).toLowerCase(),
        )
      )
        return cb(error("仅支持 JPG、PNG、WebP 或 PDF"));
      cb(null, true);
    },
  });
  app.post(
    "/api/receipts",
    (req, res, next) => {
      try {
        assertEmployee(req);
        next();
      } catch (e) {
        next(e);
      }
    },
    upload.single("file"),
    async (req, res) => {
      if (!req.file) throw error("请选择票据");
      const file = req.file;
      const data = readFileSync(file.path);
      const valid =
        file.mimetype === "application/pdf"
          ? data.subarray(0, 5).toString() === "%PDF-"
          : file.mimetype === "image/png"
            ? data
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : file.mimetype === "image/jpeg"
              ? data[0] === 255 && data[1] === 216
              : data.subarray(0, 4).toString() === "RIFF" &&
                data.subarray(8, 12).toString() === "WEBP";
      if (!valid) {
        unlinkSync(file.path);
        throw error("文件内容与格式不符");
      }
      const rid = randomUUID(),
        hash = createHash("sha256").update(data).digest("hex");
      const result = await recognizeReceipt(file.path, root, agent);
      db.prepare("INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)").run(
        rid,
        req.user.id,
        file.path,
        Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 200),
        file.mimetype,
        hash,
        result.text,
        result.mode,
        now(),
      );
      const duplicates = allExpenses()
        .filter((e) => e.ownerId === req.user.id && e.receiptHash === hash)
        .map((e) => ({ id: e.id, merchant: e.merchant }));
      res.status(201).json({
        id: rid,
        name: file.originalname,
        mime: file.mimetype,
        fields: result.fields,
        rawText: result.text,
        mode: result.mode,
        notice: result.notice,
        duplicates,
        url: `/api/receipts/${rid}/file`,
      });
    },
  );
  app.get("/api/receipts/:id/file", (req, res) => {
    const r = db
      .prepare("SELECT * FROM receipts WHERE id=?")
      .get(req.params.id);
    if (!r) throw error("票据不存在", 404);
    const linked = db
      .prepare(
        "SELECT reportId FROM expenses WHERE receiptId=? AND reportId IS NOT NULL",
      )
      .get(r.id);
    if (req.user.id !== r.ownerId && (req.user.role === "employee" || !linked))
      throw error("无权访问该票据", 403);
    res.type(r.mime);
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(path.resolve(r.path));
  });
  const aiBusy = new Set();
  app.post("/api/assistant", async (req, res) => {
    const { message, history } = messageSchema.parse(req.body);
    if (aiBusy.has(req.user.id)) throw error("上一条指令仍在处理", 429);
    aiBusy.add(req.user.id);
    try {
      res.json(await assistant(message, agent, history));
    } finally {
      aiBusy.delete(req.user.id);
    }
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  if (existsSync(path.join(root, "dist"))) {
    app.use(express.static(path.join(root, "dist")));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(root, "dist/index.html")),
    );
  }
  app.use((e, req, res, next) => {
    const status =
      e instanceof z.ZodError
        ? 400
        : e instanceof multer.MulterError
          ? 400
          : e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({
      error:
        e instanceof z.ZodError
          ? e.issues[0]?.message
          : e.code === "LIMIT_FILE_SIZE"
            ? "文件不能超过 10 MB"
            : status === 500
              ? "服务暂时不可用，请重试"
              : e.message,
    });
  });
  return { app, db };
}
