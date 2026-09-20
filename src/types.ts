export type Status = "draft" | "pending" | "approved" | "rejected" | "paid";
export type Person = {
  id: string;
  name: string;
  role: "employee" | "approver" | "finance";
  title: string;
  department: string;
  initial: string;
};
export type Warning = {
  code: string;
  title: string;
  detail: string;
  relatedId?: string;
};
export type Expense = {
  id: string;
  ownerId: string;
  merchant: string;
  amountCents: number;
  currency: string;
  date: string;
  category: string;
  description: string;
  receiptId: string | null;
  receiptName?: string;
  receiptMime?: string;
  reportId: string | null;
  status: Status;
  warnings: Warning[];
};
export type Report = {
  id: string;
  title: string;
  ownerId: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  totalCents: number;
  count: number;
  warningCount: number;
  owner: Person;
};
export type ReportDetail = Report & {
  expenses: Expense[];
  events: {
    id: string;
    actor: string;
    action: string;
    note: string;
    createdAt: string;
  }[];
};
export type FormFields = {
  merchant: string;
  amount: string;
  date: string;
  category: string;
  description: string;
  currency: string;
  receiptId?: string | null;
};
export type ReceiptResult = {
  id: string;
  name: string;
  mime: string;
  url: string;
  mode: string;
  notice: string;
  rawText: string;
  fields: FormFields;
  duplicates: { id: string; merchant: string }[];
};
export type AppState = {
  reports: Report[];
  expenses: Expense[];
  categories: string[];
  user: Person;
  policy: { currency: string; limits: Record<string, number> };
};
