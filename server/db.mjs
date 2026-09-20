import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dateDaysAgo, today } from "./domain.mjs";
export function openDB(directory, seed = true) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "qingbao.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,title TEXT NOT NULL,ownerId TEXT NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,hash TEXT NOT NULL,rawText TEXT NOT NULL DEFAULT '',mode TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,merchant TEXT NOT NULL,amountCents INTEGER NOT NULL CHECK(amountCents>0),currency TEXT NOT NULL DEFAULT 'CNY',date TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,receiptId TEXT REFERENCES receipts(id),reportId TEXT REFERENCES reports(id),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,reportId TEXT NOT NULL REFERENCES reports(id),actorId TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);`);
  if (seed && !db.prepare("SELECT value FROM meta WHERE key='seeded'").get()) {
    db.exec("BEGIN");
    try {
      const now = new Date().toISOString();
      const reports = [
        ["r-demo-shanghai", "上海 · 客户需求访谈", "pending"],
        ["r-demo-hangzhou", "杭州 · 产品交流", "approved"],
        ["r-demo-office", "团队办公用品采购", "rejected"],
      ];
      for (const [id, title, status] of reports)
        db.prepare("INSERT INTO reports VALUES(?,?,?,?,?,?)").run(
          id,
          title,
          "employee",
          status,
          now,
          now,
        );
      const entries = [
        [
          "e-demo-1",
          "城际高铁 · TEST",
          55300,
          "交通",
          "往返上海开展客户需求访谈",
          "r-demo-shanghai",
          1,
        ],
        [
          "e-demo-2",
          "江畔酒店 · TEST",
          68000,
          "住宿",
          "临近客户会场，标准房已满；单晚入住，申请超标说明。",
          "r-demo-shanghai",
          1,
        ],
        [
          "e-demo-3",
          "青禾咖啡 · TEST",
          8600,
          "餐饮",
          "产品交流活动工作餐",
          "r-demo-hangzhou",
          3,
        ],
        [
          "e-demo-4",
          "文具工作室 · TEST",
          26800,
          "办公",
          "团队白板及便签采购，待补充票据。",
          "r-demo-office",
          2,
        ],
        [
          "e-demo-5",
          "城市出行 · TEST",
          3800,
          "交通",
          "前往客户现场的交通费",
          null,
          0,
        ],
      ];
      for (const [
        id,
        merchant,
        amount,
        category,
        description,
        reportId,
        days,
      ] of entries)
        db.prepare("INSERT INTO expenses VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
          id,
          "employee",
          merchant,
          amount,
          "CNY",
          dateDaysAgo(days),
          category,
          description,
          null,
          reportId,
          now,
          now,
        );
      for (const [id] of reports) {
        db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
          id + "-created",
          id,
          "employee",
          "create",
          "创建演示报销单（所有数据均为 TEST）",
          now,
        );
      }
      db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
        "ev-shanghai-submit",
        "r-demo-shanghai",
        "employee",
        "submit",
        "已补充酒店超标原因，请审核。",
        now,
      );
      db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
        "ev-hz-approve",
        "r-demo-hangzhou",
        "approver",
        "approve",
        "演示记录：业务用途已核实，凭证后补。",
        now,
      );
      db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
        "ev-office-reject",
        "r-demo-office",
        "approver",
        "reject",
        "请补充采购明细和对应票据后重新提交。",
        now,
      );
      db.prepare("INSERT INTO meta VALUES('seeded',?)").run(today());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}
