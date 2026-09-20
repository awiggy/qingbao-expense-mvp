import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Search,
  SlidersHorizontal,
  LayoutDashboard,
  ReceiptText,
  Files,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wallet,
  Clock3,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Building2,
  TrainFront,
  Hotel,
  Utensils,
  ShoppingBag,
  Paperclip,
  Send,
  Loader2,
  RefreshCw,
  FileText,
  ScanLine,
  History,
  MessageSquare,
  Lightbulb,
  HelpCircle,
  Command,
  Menu,
} from "lucide-react";
import type {
  Person,
  Expense,
  Report,
  ReportDetail,
  FormFields,
  ReceiptResult,
  AppState,
  Status,
} from "./types";

const money = (c: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(c / 100);
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const labels: Record<Status, string> = {
  draft: "草稿",
  pending: "待审批",
  approved: "待结算",
  rejected: "已退回",
  paid: "已结算",
};
const cats = ["交通", "住宿", "餐饮", "办公", "其他"];
const categoryIcon = (cat: string) =>
  ({ 交通: TrainFront, 住宿: Hotel, 餐饮: Utensils, 办公: ShoppingBag })[cat] ||
  ReceiptText;
const emptyForm = (): FormFields => ({
  merchant: "",
  amount: "",
  date: day(),
  category: "交通",
  description: "",
  currency: "CNY",
  receiptId: null,
});
async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + url, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "操作失败，请重试");
  return body;
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
function CatIcon({
  category,
  small = false,
}: {
  category: string;
  small?: boolean;
}) {
  const Icon = categoryIcon(category);
  return (
    <span
      className={`category-icon cat-${cats.indexOf(category)} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 17 : 21} />
    </span>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <ReceiptText size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Modal({
  children,
  title,
  subtitle,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={root}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [mode, setMode] = useState("local-ocr");
  const [page, setPage] = useState("dashboard"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all");
  const [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [navOpen, setNavOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<Expense | null>(null),
    [prefill, setPrefill] = useState<FormFields | null>(null);
  const [reportOpen, setReportOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null),
    [detail, setDetail] = useState<ReportDetail | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<AppState>("/state");
    setState(data);
  }, []);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    (async () => {
      try {
        const session = await api("/session");
        setPeople(session.people);
        setMode(session.mode);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (detailId)
      api<ReportDetail>("/reports/" + detailId)
        .then(setDetail)
        .catch((e) => {
          setError(e.message);
          setDetailId(null);
        });
    else setDetail(null);
  }, [detailId, state]);
  const changePage = (p: string) => {
    setPage(p);
    setFilter("all");
    setQuery("");
    setCategory("all");
    setNavOpen(false);
  };
  async function switchRole(id: string) {
    try {
      await api("/session", {
        method: "POST",
        body: JSON.stringify({ personId: id }),
      });
      await refresh();
      notify("已切换演示角色");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function newExpense(fields: FormFields | null = null) {
    if (state?.user.role !== "employee") {
      notify("请先切换为员工角色录入费用");
      return;
    }
    setEditing(null);
    setPrefill(fields);
    setFormOpen(true);
  }
  function editExpense(e: Expense) {
    if (state?.user.role !== "employee") {
      notify("请从报销单查看费用，当前角色不可修改员工费用");
      return;
    }
    setEditing(e);
    setPrefill(null);
    setFormOpen(true);
  }
  const closeForm = useCallback(() => setFormOpen(false), []),
    closeReport = useCallback(() => setReportOpen(false), []),
    closeDetail = useCallback(() => setDetailId(null), []),
    closeAssistant = useCallback(() => setAssistantOpen(false), []),
    closeHelp = useCallback(() => setHelpOpen(false), []);
  if (loading)
    return (
      <div className="boot">
        <span className="brand-mark">
          <ReceiptText size={30} />
        </span>
        <h2>轻报</h2>
        <p>
          <Loader2 className="spin" size={16} /> 正在准备你的工作台
        </p>
      </div>
    );
  if (!state)
    return (
      <div className="boot">
        <AlertCircle size={32} />
        <h2>暂时无法连接服务</h2>
        <p>{error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新连接
        </button>
      </div>
    );
  const { user, expenses, reports } = state;
  const reportItems = reports.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      r.title.toLowerCase().includes(query.toLowerCase()),
  );
  const expenseItems = expenses.filter(
    (e) =>
      (filter === "all" ||
        (filter === "unsubmitted"
          ? ["draft", "rejected"].includes(e.status)
          : filter === "unreported"
            ? !e.reportId
            : filter === "flagged"
              ? e.warnings.length > 0
              : e.status === filter)) &&
      (category === "all" || e.category === category) &&
      `${e.merchant} ${e.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const sums = (statuses: Status[]) =>
    expenses
      .filter((e) => statuses.includes(e.status))
      .reduce((s, e) => s + e.amountCents, 0);
  const titles: Record<string, [string, string]> = {
    dashboard: [
      "让每一笔报销，都更轻松。",
      "从票据到审批，少一点重复，多一点从容。",
    ],
    expenses: ["我的费用", "整理每一笔支出，把时间留给更重要的事。"],
    reports: ["报销单", "归集费用、提交审批，随时了解每一步进展。"],
    approvals: [
      user.role === "finance" ? "结算工作台" : "审批中心",
      user.role === "finance"
        ? "审批通过的报销单，可以在这里登记模拟结算。"
        : "异常信息先看清，审核决定有依据。",
    ],
    rules: ["报销规则", "清楚的规则，让每一笔费用都有据可依。"],
  };
  const queue = reports.filter((r) =>
    user.role === "finance" ? r.status === "approved" : r.status === "pending",
  );
  return (
    <div className="app-shell">
      {navOpen && (
        <div className="mobile-scrim" onClick={() => setNavOpen(false)} />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changePage("dashboard");
          }}
        >
          <span className="brand-mark">
            <ReceiptText size={25} />
          </span>
          <span>
            轻报<small>QINGBAO</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Building2 size={18} />
          </span>
          <span>
            设计工作室<small>演示工作空间</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">工作空间</div>
        <nav>
          {[
            { key: "dashboard", title: "工作台", icon: LayoutDashboard },
            { key: "expenses", title: "我的费用", icon: ReceiptText },
            { key: "reports", title: "报销单", icon: Files },
            {
              key: "approvals",
              title: user.role === "finance" ? "结算中心" : "审批中心",
              icon: ClipboardCheck,
            },
            { key: "rules", title: "报销规则", icon: ShieldCheck },
          ].map((n) => (
            <button
              className={`nav-item ${page === n.key ? "active" : ""}`}
              key={n.key}
              onClick={() => changePage(n.key)}
            >
              <n.icon size={19} />
              <span>{n.title}</span>
              {n.key === "approvals" && queue.length > 0 && (
                <b>{queue.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="little-star">✦</span>
            <strong>你的报销小助手</strong>
            <p>
              一句话整理费用，
              <br />
              把琐事交给轻报。
            </p>
            <button onClick={() => setAssistantOpen(true)}>
              开始对话 <ArrowUpRight size={15} />
            </button>
          </div>
          <a className="sidebar-help" href="/agent">
            <SlidersHorizontal size={18} />
            AI 配置与测试
            <ArrowUpRight size={15} />
          </a>
          <button className="sidebar-help" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={18} />
            使用指南
            <ArrowUpRight size={15} />
          </button>
          <div className="build-label">
            <span />
            MVP · 本地演示
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <strong>{page === "dashboard" ? "工作台" : titles[page][0]}</strong>
          </div>
          <div className="topbar-right">
            <span className="engine-chip">
              <span />
              {mode === "model"
                ? "模型已配置"
                : mode === "local-ocr"
                  ? "本机 OCR 已就绪"
                  : "手动录入模式"}
            </span>
            <div className="role-control">
              <div className={`avatar avatar-${user.role}`}>{user.initial}</div>
              <div>
                <span className="role-caption">切换演示角色</span>
                <select
                  aria-label="切换演示角色"
                  value={user.id}
                  onChange={(e) => switchRole(e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              {page === "dashboard" && (
                <div className="eyebrow">
                  你好，{user.name}{" "}
                  <span>
                    ／{" "}
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }).format(new Date())}
                  </span>
                </div>
              )}
              <h1>{titles[page][0]}</h1>
              <p>{titles[page][1]}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary assistant-trigger"
                onClick={() => setAssistantOpen(true)}
              >
                <Sparkles size={17} />
                轻报助手
              </button>
              {user.role === "employee" && (
                <button className="button primary" onClick={() => newExpense()}>
                  <Plus size={18} />
                  新建费用
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              {error}
              <button
                className="icon-button"
                aria-label="关闭错误"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: "未提交费用",
                    value: sums(["draft", "rejected"]),
                    icon: ReceiptText,
                    color: "green",
                    note: `${expenses.filter((e) => ["draft", "rejected"].includes(e.status)).length} 笔待整理`,
                    go: "expenses",
                    status: "unsubmitted",
                  },
                  {
                    label: "等待审批",
                    value: sums(["pending"]),
                    icon: Clock3,
                    color: "amber",
                    note: `${reports.filter((r) => r.status === "pending").length} 份报销单处理中`,
                    go: "reports",
                    status: "pending",
                  },
                  {
                    label: "待结算金额",
                    value: sums(["approved"]),
                    icon: Wallet,
                    color: "blue",
                    note: "已审批通过，待财务登记",
                    go: "reports",
                    status: "approved",
                  },
                  {
                    label: "已结算金额",
                    value: sums(["paid"]),
                    icon: CheckCheck,
                    color: "purple",
                    note: "演示结算，不发生真实付款",
                    go: "reports",
                    status: "paid",
                  },
                ].map((s) => (
                  <button
                    className="stat-card"
                    key={s.label}
                    onClick={() => {
                      changePage(s.go);
                      setFilter(s.status);
                    }}
                  >
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={"stat-icon " + s.color}>
                        <s.icon size={18} />
                      </span>
                    </div>
                    <strong>{money(s.value)}</strong>
                    <div className="stat-note">
                      {s.note}
                      <ArrowUpRight size={14} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="dashboard-columns">
                <div className="dashboard-left">
                  <section
                    className="quick-upload"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (user.role === "employee") {
                        newExpense();
                        pendingDrop.current = e.dataTransfer.files[0] || null;
                      } else notify("请切换为员工角色上传票据");
                    }}
                  >
                    <div className="upload-copy">
                      <span className="section-kicker">
                        <Sparkles size={14} />
                        从一张票据开始
                      </span>
                      <h2>票据放进来，费用整理好。</h2>
                      <p>自动提取金额、日期和商户，确认后即可保存。</p>
                      <div className="upload-actions">
                        <button
                          className="button primary"
                          onClick={() => newExpense()}
                        >
                          <UploadCloud size={17} />
                          上传票据
                        </button>
                        <button
                          className="text-button"
                          onClick={() => newExpense()}
                        >
                          手动录入 <ArrowRight size={15} />
                        </button>
                      </div>
                      <small>支持 JPG、PNG、WebP、PDF · 每张不超过 10 MB</small>
                    </div>
                    <div className="receipt-illustration" aria-hidden="true">
                      <div className="receipt-shadow" />
                      <div className="paper-receipt">
                        <div className="paper-logo">
                          <span>✦</span> QINGBAO
                        </div>
                        <div className="paper-line w70" />
                        <div className="paper-line w50" />
                        <div className="paper-dash" />
                        <div className="paper-row">
                          <span>交通费用</span>
                          <b>¥38.00</b>
                        </div>
                        <div className="paper-row">
                          <span>日期</span>
                          <span>{day().slice(5).replace("-", " / ")}</span>
                        </div>
                        <div className="paper-dash" />
                        <div className="paper-row">
                          <b>TOTAL</b>
                          <b>¥38.00</b>
                        </div>
                      </div>
                      <span className="scan-check">
                        <Check size={25} />
                      </span>
                      <span className="scan-spark">✦</span>
                    </div>
                  </section>
                  <section className="panel recent-panel">
                    <div className="panel-heading">
                      <h2>
                        最近的报销单 <span>{reports.length}</span>
                      </h2>
                      <button
                        className="text-button muted"
                        onClick={() => changePage("reports")}
                      >
                        查看全部 <ArrowRight size={15} />
                      </button>
                    </div>
                    {reports.length ? (
                      <ReportTable
                        reports={reports.slice(0, 4)}
                        onOpen={setDetailId}
                      />
                    ) : (
                      <Empty
                        title="第一份报销单，从这里开始"
                        description="保存费用后，把它们归集到一份报销单。"
                      />
                    )}
                  </section>
                </div>
                <div className="dashboard-right">
                  <section className="panel todo-panel">
                    <div className="panel-heading">
                      <h2>接下来做什么</h2>
                      <span className="count-pill">
                        {(expenses.filter((e) => !e.reportId).length ? 1 : 0) +
                          (reports.some((r) => r.status === "rejected")
                            ? 1
                            : 0) +
                          (queue.length ? 1 : 0)}
                      </span>
                    </div>
                    <div className="todo-list">
                      {expenses.some((e) => !e.reportId) && (
                        <button
                          className="todo-item"
                          onClick={() => {
                            changePage("expenses");
                            setFilter("unreported");
                          }}
                        >
                          <span className="todo-icon green">
                            <Files size={19} />
                          </span>
                          <span>
                            <strong>整理未归集费用</strong>
                            <small>
                              {expenses.filter((e) => !e.reportId).length}{" "}
                              笔费用可以生成报销单
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      )}
                      {reports.some((r) => r.status === "rejected") && (
                        <button
                          className="todo-item"
                          onClick={() => {
                            changePage("reports");
                            setFilter("rejected");
                          }}
                        >
                          <span className="todo-icon amber">
                            <RefreshCw size={18} />
                          </span>
                          <span>
                            <strong>补充退回的报销单</strong>
                            <small>完善材料，继续审批流程</small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      )}
                      {queue.length > 0 && (
                        <button
                          className="todo-item"
                          onClick={() => changePage("approvals")}
                        >
                          <span className="todo-icon blue">
                            <ClipboardCheck size={18} />
                          </span>
                          <span>
                            <strong>
                              {user.role === "finance"
                                ? "登记已通过报销单"
                                : "查看待审批报销单"}
                            </strong>
                            <small>{queue.length} 份报销单等待处理</small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      )}
                      {!expenses.length && !reports.length && (
                        <p className="quiet">
                          暂时没有待办，上传第一张票据吧。
                        </p>
                      )}
                    </div>
                  </section>
                  <section className="assistant-card">
                    <div className="assistant-orb">
                      <Sparkles size={25} />
                    </div>
                    <span className="section-kicker">轻报助手</span>
                    <h2>
                      说一句，
                      <br />
                      少填一张表。
                    </h2>
                    <p>
                      “昨天打车 38 元，
                      <br />
                      去客户现场做需求访谈。”
                    </p>
                    <button
                      onClick={() => {
                        setAssistantOpen(true);
                      }}
                    >
                      试试这句话 <ArrowUpRight size={18} />
                    </button>
                    <div className="assistant-card-footer">
                      <span />
                      {mode === "model"
                        ? "模型理解 · 人工确认"
                        : "快捷录入 · 人工确认"}
                    </div>
                  </section>
                </div>
              </div>
              <div className="demo-footer">
                <ShieldCheck size={15} />
                <span>
                  独立 MVP · 内置数据均为 TEST
                  演示。费用记录、审批与结算分开统计。
                </span>
              </div>
            </>
          )}
          {page === "expenses" && (
            <section className="panel list-panel">
              <div className="list-toolbar">
                <div className="tabs">
                  {[
                    ["all", "全部费用"],
                    ["unsubmitted", "未提交"],
                    ["unreported", "未归集"],
                    ["flagged", "需关注"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      className={filter === k ? "active" : ""}
                      onClick={() => setFilter(k)}
                    >
                      {l}
                      {k === "unreported" && (
                        <span>
                          {expenses.filter((e) => !e.reportId).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="toolbar-controls">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索费用"
                      placeholder="搜索商户、用途…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    className="filter-select"
                    aria-label="费用分类筛选"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">全部分类</option>
                    {cats.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {user.role === "employee" && (
                    <button
                      className="button secondary"
                      onClick={() => setReportOpen(true)}
                    >
                      <Files size={16} />
                      生成报销单
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table expenses-table">
                  <thead>
                    <tr>
                      <th>费用 / 商户</th>
                      <th>日期</th>
                      <th>分类</th>
                      <th>状态</th>
                      <th>票据与校验</th>
                      <th className="align-right">金额</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {expenseItems.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() =>
                          e.reportId ? setDetailId(e.reportId) : editExpense(e)
                        }
                      >
                        <td>
                          <div className="expense-name">
                            <CatIcon category={e.category} />
                            <div>
                              <strong>{e.merchant}</strong>
                              <small>{e.description || "待补充用途说明"}</small>
                            </div>
                          </div>
                        </td>
                        <td className="muted nowrap">{e.date}</td>
                        <td>
                          <span className="category-tag">{e.category}</span>
                        </td>
                        <td>
                          <Badge status={e.status} />
                        </td>
                        <td>
                          {e.warnings.length ? (
                            <span className="warning-inline">
                              <AlertCircle size={14} />
                              {e.warnings.length} 项待确认
                            </span>
                          ) : (
                            <span className="okay-inline">
                              <CheckCircle2 size={14} />
                              检查通过
                            </span>
                          )}
                        </td>
                        <td className="amount align-right">
                          {money(e.amountCents)}
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`查看 ${e.merchant}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              e.reportId
                                ? setDetailId(e.reportId)
                                : editExpense(e);
                            }}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!expenseItems.length && (
                <Empty
                  title="没有符合条件的费用"
                  description="试着调整筛选，或添加一笔新费用。"
                  action={
                    <button
                      className="button secondary"
                      onClick={() => {
                        setFilter("all");
                        setQuery("");
                        setCategory("all");
                      }}
                    >
                      清除筛选
                    </button>
                  }
                />
              )}
              <div className="table-footer">
                共 {expenseItems.length} 笔费用
                <span>
                  合计{" "}
                  <b>
                    {money(expenseItems.reduce((s, e) => s + e.amountCents, 0))}
                  </b>
                </span>
              </div>
            </section>
          )}
          {page === "reports" && (
            <section className="panel list-panel">
              <div className="list-toolbar">
                <div className="tabs">
                  {[
                    ["all", "全部"],
                    ["draft", "草稿"],
                    ["pending", "待审批"],
                    ["rejected", "已退回"],
                    ["approved", "待结算"],
                    ["paid", "已结算"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      className={filter === k ? "active" : ""}
                      onClick={() => setFilter(k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="toolbar-controls">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索报销单"
                      placeholder="搜索报销单…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  {user.role === "employee" && (
                    <button
                      className="button secondary"
                      onClick={() => setReportOpen(true)}
                    >
                      <Plus size={16} />
                      新建报销单
                    </button>
                  )}
                </div>
              </div>
              {reportItems.length ? (
                <ReportTable reports={reportItems} onOpen={setDetailId} />
              ) : (
                <Empty
                  title="这里还没有报销单"
                  description="从已保存的费用生成报销单，集中提交审核。"
                />
              )}
            </section>
          )}
          {page === "approvals" && (
            <>
              <div className="info-banner">
                <ShieldCheck size={18} />
                {user.role === "employee"
                  ? "当前是员工视角，可以查看报销单；切换为「审批人」后可通过或退回。"
                  : user.role === "approver"
                    ? "先核对票据与规则提示，再作出审核决定。异常单通过时需填写说明。"
                    : "这里只登记演示结算状态，不会连接银行或发起真实付款。"}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    {user.role === "finance" ? "等待结算" : "待审核报销单"}{" "}
                    <span>{queue.length}</span>
                  </h2>
                </div>
                {queue.length ? (
                  <ReportTable reports={queue} onOpen={setDetailId} />
                ) : (
                  <Empty
                    title="待办已处理完"
                    description="新的报销单进入流程后会显示在这里。"
                  />
                )}
              </section>
            </>
          )}
          {page === "rules" && (
            <>
              <div className="info-banner">
                <Lightbulb size={18} />
                这是 MVP 的演示报销制度，用于体验异常校验；不作为真实企业制度。
              </div>
              <div className="rules-grid">
                {cats.map((c) => (
                  <section className="panel rule-card" key={c}>
                    <CatIcon category={c} />
                    <h3>{c}费用</h3>
                    <strong>
                      {money(state.policy.limits[c])}
                      <small> / 单笔</small>
                    </strong>
                    <p>超出标准会提示补充说明，由审批人核实处理。</p>
                  </section>
                ))}
              </div>
              <section className="panel rule-explainer">
                <h2>每笔费用都会经过这些检查</h2>
                <div>
                  <p>
                    <Paperclip size={19} />
                    <span>
                      <strong>票据完整性</strong>
                      <small>缺少票据时标记提醒，提交前补充或说明原因。</small>
                    </span>
                  </p>
                  <p>
                    <Files size={19} />
                    <span>
                      <strong>疑似重复</strong>
                      <small>
                        比对文件指纹，以及商户、日期和金额；不自动删除费用。
                      </small>
                    </span>
                  </p>
                  <p>
                    <ShieldCheck size={19} />
                    <span>
                      <strong>人工决策与留痕</strong>
                      <small>
                        识别后确认字段，审批后锁定费用，每次流转记录处理人。
                      </small>
                    </span>
                  </p>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {formOpen && (
        <ExpenseModal
          mode={mode}
          editing={editing}
          prefill={prefill}
          pendingFile={pendingDrop.current}
          onClose={() => {
            pendingDrop.current = null;
            closeForm();
          }}
          onSaved={async () => {
            pendingDrop.current = null;
            closeForm();
            await refresh();
            notify(editing ? "费用已更新" : "费用已保存，接下来可以生成报销单");
          }}
        />
      )}
      {reportOpen && (
        <CreateReportModal
          expenses={expenses.filter((e) => !e.reportId)}
          onClose={closeReport}
          onSaved={async (id) => {
            closeReport();
            await refresh();
            setDetailId(id);
            notify("报销单已生成，请核对后提交");
          }}
        />
      )}
      {detailId && detail && (
        <ReportModal
          detail={detail}
          user={user}
          onClose={closeDetail}
          onEdit={(e) => {
            setDetailId(null);
            editExpense(e);
          }}
          onChanged={async () => {
            await refresh();
            notify("报销单已更新");
          }}
        />
      )}
      {assistantOpen && (
        <AssistantModal
          mode={mode}
          onClose={closeAssistant}
          onConfirm={(f) => {
            closeAssistant();
            newExpense(f);
          }}
        />
      )}
      {helpOpen && (
        <Modal
          title="用三种角色，走完一笔报销"
          subtitle="一个可以亲手操作的最小业务流程。"
          onClose={closeHelp}
        >
          <div className="help-steps">
            {[
              [
                "01",
                "员工 · 录入与提交",
                "上传 TEST 样例票据或手动录入，核对信息后保存。在费用列表生成报销单，再提交审批。",
              ],
              [
                "02",
                "审批人 · 核实与处理",
                "在右上角切换为林知夏。查看规则摘要，可填写说明后通过，或退回给员工补充。",
              ],
              [
                "03",
                "财务 · 登记与导出",
                "切换为许嘉宁，为已通过的报销单登记模拟结算，并导出 CSV。",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <b>{n}</b>
                <span>
                  <strong>{t}</strong>
                  <p>{d}</p>
                </span>
              </div>
            ))}
            <div className="info-banner">
              这是本机演示版，角色切换用于体验，不是正式账号登录。所有付款操作均为状态模拟。
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
const pendingDrop = { current: null as File | null };
function ReportTable({
  reports,
  onOpen,
}: {
  reports: Report[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table report-table">
        <thead>
          <tr>
            <th>报销单</th>
            <th>状态</th>
            <th>需关注</th>
            <th className="align-right">金额</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r.id)}>
              <td>
                <div className="report-name">
                  <span className="report-file">
                    <Files size={19} />
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.count} 笔费用 <i>·</i> {r.owner?.name || "陈予安"}
                    </small>
                  </span>
                </div>
              </td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                {r.warningCount ? (
                  <span className="warning-inline">
                    <AlertCircle size={14} />
                    {r.warningCount} 笔费用
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="amount align-right">{money(r.totalCents)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`查看 ${r.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r.id);
                  }}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseModal({
  mode,
  editing,
  prefill,
  pendingFile,
  onClose,
  onSaved,
}: {
  mode: string;
  editing: Expense | null;
  prefill: FormFields | null;
  pendingFile: File | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fields, setFields] = useState<FormFields>(
    editing
      ? {
          merchant: editing.merchant,
          amount: (editing.amountCents / 100).toFixed(2),
          date: editing.date,
          category: editing.category,
          description: editing.description,
          currency: editing.currency,
          receiptId: editing.receiptId,
        }
      : prefill || emptyForm(),
  );
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [rawOpen, setRawOpen] = useState(false),
    [dragging, setDragging] = useState(false),
    [manual, setManual] = useState(Boolean(editing || prefill));
  const input = useRef<HTMLInputElement>(null),
    dropHandled = useRef(false);
  const canEdit = !editing || ["draft", "rejected"].includes(editing.status);
  async function upload(file: File) {
    if (!canEdit) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("文件不能超过 10 MB");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<ReceiptResult>("/receipts", {
        method: "POST",
        body: form,
      });
      setReceipt(r);
      setFields({
        ...emptyForm(),
        ...r.fields,
        currency: r.fields.currency || "CNY",
        receiptId: r.id,
      });
      setManual(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (pendingFile && !dropHandled.current) {
      dropHandled.current = true;
      void upload(pendingFile);
    }
  }, []);
  async function sample(name: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/samples/test-${name}.png`);
      if (!res.ok) throw new Error("样例加载失败");
      await upload(
        new File([await res.blob()], `TEST-${name}.png`, { type: "image/png" }),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function field(key: keyof FormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(editing ? "/expenses/" + editing.id : "/expenses", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(fields),
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const preview =
    receipt?.url ||
    (editing?.receiptId ? `/api/receipts/${editing.receiptId}/file` : null);
  const mime = receipt?.mime || editing?.receiptMime;
  return (
    <Modal
      title={editing ? "费用详情" : "新建费用"}
      subtitle="票据先识别，信息由你确认。"
      onClose={onClose}
      wide
    >
      <div className="expense-modal-content">
        <div className="receipt-pane">
          <div className="pane-label">
            <span>
              <ScanLine size={17} />
              票据原件
            </span>
            <span className="tiny-tag">
              {receipt ? "识别完成" : "支持图片 / PDF"}
            </span>
          </div>
          {busy ? (
            <div className="ocr-loading">
              <div className="scan-animation">
                <ReceiptText size={52} />
                <i />
              </div>
              <strong>正在读取票据</strong>
              <p>提取商户、日期和金额…</p>
              <small>请稍等，清晰的票据识别更准确</small>
            </div>
          ) : preview ? (
            <div className="receipt-preview">
              {mime === "application/pdf" ? (
                <iframe title="票据 PDF 预览" src={preview} />
              ) : (
                <img src={preview} alt="上传的票据原件" />
              )}
              <button
                type="button"
                className="button secondary replace-receipt"
                disabled={!canEdit}
                onClick={() => input.current?.click()}
              >
                <RefreshCw size={14} />
                更换票据
              </button>
            </div>
          ) : (
            <div
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files[0])
                  void upload(e.dataTransfer.files[0]);
              }}
            >
              <span className="drop-icon">
                <UploadCloud size={32} />
              </span>
              <h3>把票据拖到这里</h3>
              <p>或从电脑中选择文件</p>
              <button
                type="button"
                className="button primary"
                disabled={!canEdit}
                onClick={() => input.current?.click()}
              >
                选择票据
              </button>
              <small>JPG / PNG / WebP / PDF，最大 10 MB</small>
            </div>
          )}
          <input
            type="file"
            ref={input}
            className="visually-hidden"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            aria-label="上传票据文件"
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
          {!preview && !busy && (
            <div className="samples">
              <span>没有票据？用 TEST 样例试一试</span>
              <div>
                <button onClick={() => sample("taxi")}>
                  <TrainFront size={15} />
                  交通 ¥38
                </button>
                <button onClick={() => sample("hotel")}>
                  <Hotel size={15} />
                  住宿 ¥680
                </button>
                <button onClick={() => sample("meal")}>
                  <Utensils size={15} />
                  餐饮 ¥86
                </button>
              </div>
            </div>
          )}
          {receipt?.rawText && (
            <div className="raw-text">
              <button onClick={() => setRawOpen(!rawOpen)}>
                <FileText size={14} />
                查看识别原文
                <ChevronDown size={14} />
              </button>
              {rawOpen && <pre>{receipt.rawText}</pre>}
            </div>
          )}
          <div className="receipt-privacy">
            <ShieldCheck size={14} />
            {mode === "model"
              ? "OCR 文本交由已配置模型整理"
              : "本机识别，票据保存在本地"}
          </div>
        </div>
        <form className="expense-form" onSubmit={save}>
          <div className="form-section-title">
            <h3>费用信息</h3>
            {receipt && (
              <span className="okay-inline">
                <Check size={14} />
                {receipt.mode === "model"
                  ? "模型已整理"
                  : receipt.mode === "local-ocr"
                    ? "本机 OCR 已提取"
                    : "待人工填写"}
              </span>
            )}
          </div>
          {!receipt && !manual && (
            <div className="form-hint">
              <Sparkles size={17} />
              <span>
                上传票据后自动填写，也可以
                <button type="button" onClick={() => setManual(true)}>
                  直接手动录入
                </button>
                。
              </span>
            </div>
          )}
          {receipt && (
            <div className="form-hint">
              <Lightbulb size={17} />
              <span>
                请逐项核对识别结果；未识别的信息需要手动补充。当前仅支持人民币，请核对票面币种。
              </span>
            </div>
          )}
          {receipt?.notice && (
            <div className="inline-error">{receipt.notice}</div>
          )}
          {receipt?.duplicates.length ? (
            <div className="inline-warning">
              <AlertCircle size={17} />
              相同票据已关联 {receipt.duplicates.length} 笔费用，保存前请核对。
            </div>
          ) : null}
          {fields.currency && fields.currency !== "CNY" && (
            <div className="inline-warning">
              识别到 {fields.currency}。MVP
              仅支持人民币，请核实票面币种，勿直接当作人民币保存。
            </div>
          )}
          <label className="field">
            商户名称 <span>*</span>
            <input
              required
              maxLength={100}
              disabled={!canEdit || busy}
              placeholder="例如：城市出行"
              value={fields.merchant}
              onChange={(e) => field("merchant", e.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="field">
              金额 <span>*</span>
              <div className="input-prefix">
                <span>¥</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  disabled={!canEdit || busy}
                  placeholder="0.00"
                  value={fields.amount}
                  onChange={(e) => field("amount", e.target.value)}
                />
                <small>CNY</small>
              </div>
            </label>
            <label className="field">
              费用日期 <span>*</span>
              <input
                required
                type="date"
                disabled={!canEdit || busy}
                value={fields.date}
                onChange={(e) => field("date", e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            费用分类 <span>*</span>
            <select
              disabled={!canEdit || busy}
              value={fields.category}
              onChange={(e) => field("category", e.target.value)}
            >
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            用途说明
            <textarea
              disabled={!canEdit || busy}
              maxLength={500}
              rows={3}
              placeholder="这笔费用用于什么？提交前需要填写。"
              value={fields.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <div className="form-bottom-note">
            <History size={14} />
            保存为草稿，不会自动提交审批。
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                busy ||
                !canEdit ||
                Boolean(fields.currency && fields.currency !== "CNY")
              }
              className="button primary"
            >
              {saving ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}{" "}
              {editing ? "保存修改" : "确认并保存"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function CreateReportModal({
  expenses,
  onClose,
  onSaved,
}: {
  expenses: Expense[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/reports", {
        method: "POST",
        body: JSON.stringify({ title, expenseIds: selected }),
      });
      await onSaved(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="生成报销单"
      subtitle="把同一次出差或事项的费用放在一起。"
      onClose={onClose}
    >
      <form onSubmit={submit} className="create-report-form">
        <label className="field">
          报销单名称
          <input
            required
            maxLength={100}
            placeholder="例如：上海客户拜访 · 9 月"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="select-list-label">
          <span>选择未归集费用</span>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setSelected(
                selected.length === expenses.length
                  ? []
                  : expenses.map((e) => e.id),
              )
            }
          >
            {selected.length === expenses.length ? "取消全选" : "全选"}
          </button>
        </div>
        <div className="expense-select-list">
          {expenses.map((e) => (
            <label
              key={e.id}
              className={`expense-select-item ${selected.includes(e.id) ? "selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(e.id)
                      ? s.filter((x) => x !== e.id)
                      : [...s, e.id],
                  )
                }
              />
              <CatIcon category={e.category} small />
              <span>
                <strong>{e.merchant}</strong>
                <small>
                  {e.date} · {e.category}
                </small>
              </span>
              <b>{money(e.amountCents)}</b>
            </label>
          ))}
          {!expenses.length && (
            <Empty
              title="没有未归集费用"
              description="请先新建费用，再生成报销单。"
            />
          )}
        </div>
        {error && <div className="inline-error">{error}</div>}
        <div className="report-total">
          <span>已选 {selected.length} 笔</span>
          <strong>
            {money(
              expenses
                .filter((e) => selected.includes(e.id))
                .reduce((s, e) => s + e.amountCents, 0),
            )}
          </strong>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || !selected.length}
          >
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Files size={16} />
            )}
            生成草稿
          </button>
        </div>
      </form>
    </Modal>
  );
}

const actionLabels: Record<string, string> = {
  create: "创建报销单",
  submit: "提交审批",
  approve: "审批通过",
  reject: "退回补充",
  withdraw: "撤回报销单",
  settle: "登记模拟结算",
  edit: "修改费用",
  comment: "补充说明",
};
function ReportModal({
  detail,
  user,
  onClose,
  onEdit,
  onChanged,
}: {
  detail: ReportDetail;
  user: Person;
  onClose: () => void;
  onEdit: (e: Expense) => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<Expense | null>(null);
  const flagged = detail.expenses.filter((e) => e.warnings.length);
  const editable =
    user.id === detail.ownerId && ["draft", "rejected"].includes(detail.status);
  async function action(action: string) {
    setBusy(action);
    setError("");
    try {
      await api(
        "/reports/" +
          detail.id +
          (action === "comment" ? "/comments" : "/action"),
        { method: "POST", body: JSON.stringify({ action, note }) },
      );
      setNote("");
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title={detail.title}
      subtitle={`${detail.owner.name} · ${detail.owner.department} · ${detail.expenses.length} 笔费用`}
      onClose={onClose}
      wide
    >
      <div className="report-detail-content">
        <div className="report-detail-main">
          <div className="report-summary">
            <div>
              <span>报销金额</span>
              <strong>{money(detail.totalCents)}</strong>
            </div>
            <Badge status={detail.status} />
            <a
              className="button secondary"
              href={`/api/reports/${detail.id}/export`}
              download
            >
              <ArrowDownToLine size={16} />
              导出 CSV
            </a>
          </div>
          <div className="progress-track">
            {["草稿", "待审批", "待结算", "已结算"].map((s, i) => (
              <div
                key={s}
                className={
                  i <=
                  { draft: 0, rejected: 0, pending: 1, approved: 2, paid: 3 }[
                    detail.status
                  ]
                    ? "done"
                    : ""
                }
              >
                <span>
                  {i <
                  { draft: 0, rejected: 0, pending: 1, approved: 2, paid: 3 }[
                    detail.status
                  ] ? (
                    <Check size={12} />
                  ) : (
                    i + 1
                  )}
                </span>
                {s}
              </div>
            ))}
          </div>
          <div
            className={`review-summary ${flagged.length ? "has-warning" : ""}`}
          >
            <div>
              <Sparkles size={18} />
              <strong>规则预检查</strong>
              <span>本地规则</span>
            </div>
            <p>
              {flagged.length
                ? `${detail.expenses.length} 笔费用中，${flagged.length} 笔需要关注。请核实票据及业务用途，再作出决定。`
                : "所有费用均已通过当前规则检查。审批人仍需核实实际业务用途。"}
            </p>
          </div>
          <h3 className="detail-section-title">费用明细</h3>
          <div className="report-expenses">
            {detail.expenses.map((e) => (
              <div className="report-expense" key={e.id}>
                <div className="report-expense-row">
                  <CatIcon category={e.category} />
                  <div>
                    <strong>{e.merchant}</strong>
                    <small>
                      {e.date} · {e.category}
                    </small>
                  </div>
                  <b>{money(e.amountCents)}</b>
                </div>
                <p>{e.description || "尚未填写用途说明"}</p>
                {e.warnings.map((w) => (
                  <div className="expense-warning" key={w.code}>
                    <AlertCircle size={14} />
                    <span>
                      <strong>{w.title}</strong>：{w.detail}
                    </span>
                  </div>
                ))}
                <div className="expense-links">
                  {e.receiptId ? (
                    <button
                      onClick={() =>
                        setReceipt(receipt?.id === e.id ? null : e)
                      }
                    >
                      <Paperclip size={14} />
                      {receipt?.id === e.id ? "收起票据" : "查看票据"}
                    </button>
                  ) : (
                    <span>
                      <Paperclip size={14} />
                      尚未附票据
                    </span>
                  )}
                  {editable && (
                    <button onClick={() => onEdit(e)}>
                      编辑费用 <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
                {receipt?.id === e.id && (
                  <div className="inline-receipt">
                    {e.receiptMime === "application/pdf" ? (
                      <iframe
                        title="报销单票据预览"
                        src={`/api/receipts/${e.receiptId}/file`}
                      />
                    ) : (
                      <img
                        alt={`${e.merchant} 的票据`}
                        src={`/api/receipts/${e.receiptId}/file`}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <aside className="report-activity">
          <h3>
            <History size={17} />
            流转记录
          </h3>
          <div className="timeline">
            {detail.events.map((ev) => (
              <div className={"timeline-item " + ev.action} key={ev.id}>
                <i />
                <div>
                  <strong>{actionLabels[ev.action] || ev.action}</strong>
                  <small>
                    {ev.actor} ·{" "}
                    {new Date(ev.createdAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                  {ev.note && <p>{ev.note}</p>}
                </div>
              </div>
            ))}
          </div>
          <label className="field">
            {user.role === "approver" ? "审核说明" : "补充说明"}
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder={
                user.role === "approver"
                  ? "退回需填写原因；异常单通过需填写核实说明。"
                  : "记录说明，方便后续核对…"
              }
            />
          </label>
          <button
            className="button secondary full"
            disabled={!note.trim() || Boolean(busy)}
            onClick={() => action("comment")}
          >
            <MessageSquare size={15} />
            添加说明
          </button>
        </aside>
      </div>
      {error && (
        <div className="detail-error inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions report-detail-actions">
        <span>
          <ShieldCheck size={15} />
          所有操作留痕 · 不发起真实付款
        </span>
        <div>
          <button className="button secondary" onClick={onClose}>
            关闭
          </button>
          {editable && (
            <button
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => action("submit")}
            >
              {busy === "submit" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Send size={16} />
              )}
              提交审批
            </button>
          )}
          {user.id === detail.ownerId && detail.status === "pending" && (
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => action("withdraw")}
            >
              <RefreshCw size={16} />
              撤回修改
            </button>
          )}
          {user.role === "approver" && detail.status === "pending" && (
            <>
              <button
                className="button danger-secondary"
                disabled={Boolean(busy)}
                onClick={() => action("reject")}
              >
                <RefreshCw size={16} />
                退回补充
              </button>
              <button
                className="button primary"
                disabled={Boolean(busy)}
                onClick={() => action("approve")}
              >
                <Check size={16} />
                审批通过
              </button>
            </>
          )}
          {user.role === "finance" && detail.status === "approved" && (
            <button
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => action("settle")}
            >
              <Wallet size={16} />
              登记模拟结算
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AssistantModal({
  mode,
  onClose,
  onConfirm,
}: {
  mode: string;
  onClose: () => void;
  onConfirm: (fields: FormFields) => void;
}) {
  const [messages, setMessages] = useState<
    { role: string; text: string; draft?: FormFields | null; source?: string }[]
  >([
    {
      role: "assistant",
      text:
        mode === "model"
          ? "描述一笔费用，我会整理为待确认草稿。保存和提交都由你决定。"
          : "现在使用本地快捷助手。可以帮你把含金额的描述整理成草稿，也能查询演示制度。",
    },
  ]);
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function send(message: string) {
    if (!message.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api("/assistant", {
        method: "POST",
        body: JSON.stringify({
          message,
          history: messages
            .slice(1)
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) })),
        }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: r.message,
          draft: r.draft,
          source: `${r.mode === "model" ? "模型回答" : "本地快捷模式"} · AI 配置 v${r.versionId || 1}`,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (e as Error).message },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="轻报助手"
      subtitle={
        mode === "model"
          ? "模型已配置 · 操作前由你确认"
          : "本地快捷模式 · 非大模型对话"
      }
      onClose={onClose}
    >
      <div className="chat-body">
        {messages.map((m, i) => (
          <div className={"chat-message " + m.role} key={i}>
            {m.role === "assistant" && (
              <span className="chat-avatar">
                <Sparkles size={17} />
              </span>
            )}
            <div>
              <p>{m.text}</p>
              {m.source && (
                <small className="assistant-source">{m.source}</small>
              )}
              {m.draft && (
                <div className="chat-draft">
                  <span>
                    <ReceiptText size={16} />
                    待确认费用
                  </span>
                  <h3>{m.draft.merchant}</h3>
                  <strong>
                    {m.draft.amount
                      ? money(Math.round(Number(m.draft.amount) * 100))
                      : "金额待补充"}
                  </strong>
                  <small>
                    {m.draft.date} · {m.draft.category}
                  </small>
                  <button
                    className="button primary full"
                    onClick={() => onConfirm(m.draft!)}
                  >
                    核对并录入 <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-thinking">
            <Loader2 size={15} className="spin" />
            正在整理…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="chat-suggestions">
        <button
          onClick={() => send("昨天打车 38 元，前往客户现场做需求访谈。")}
        >
          昨天打车 38 元
        </button>
        <button onClick={() => send("住宿报销标准是多少？")}>
          住宿报销标准
        </button>
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          aria-label="给轻报助手的指令"
          rows={2}
          placeholder="说说这笔费用，比如：昨天打车 38 元…"
          maxLength={2000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button
          aria-label="发送指令"
          className="button primary"
          disabled={busy || !input.trim()}
        >
          <Send size={17} />
        </button>
      </form>
      <p className="chat-footer">
        助手只生成候选信息，不会自动保存、审批或付款。
      </p>
    </Modal>
  );
}
