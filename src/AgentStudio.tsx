import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import "./agent.css";
import presetPrompts from "../shared/ai-prompts.json";

type Config = {
  name: string;
  model: {
    baseURL: string;
    name: string;
    temperature: number;
    maxTokens: number;
    timeoutSeconds: number;
  };
  prompt: { identity: string; instructions: string; receipt: string };
  output: {
    format: "json_object" | "json_schema";
    tone: "concise" | "detailed";
    maxReplyChars: number;
    requiredFields: string[];
  };
  capabilities: {
    expenseDraft: boolean;
    policyAnswer: boolean;
    receiptExtraction: boolean;
  };
};
type Version = { id: number; note: string; createdAt: string };
type Snapshot = {
  config: Config;
  revision: number;
  activeVersion: number;
  activeConfig: Config;
  updatedAt: string;
  connection: { configured: boolean; source: string; modelReady: boolean };
  activeConnection: { modelReady: boolean };
  versions: Version[];
  schema: object;
};
type Run = {
  id: string;
  source: string;
  kind: string;
  createdAt: string;
  versionId: number | null;
  revision: number;
  configHash: string;
  model: string;
  input: string;
  status: string;
  error: string | null;
  result: {
    message?: string;
    draft?: Record<string, string> | null;
    [key: string]: unknown;
  } | null;
  durationMs: number;
  usage: { totalTokens: number } | null;
};
type Chat = { role: "user" | "assistant"; text: string; run?: Run };
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const res = await fetch(
    "/api" + url,
    body === undefined
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "请求失败");
  return value;
}
const time = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const fieldLabels: Record<string, string> = {
  merchant: "商户名称",
  amount: "金额",
  date: "费用日期",
  category: "费用分类",
  description: "用途说明",
};
const sampleQueries = [
  "昨天打车 38 元，商户是 TEST Taxi，去客户现场做需求访谈。",
  "酒店每晚 680 元，超过标准该怎么办？",
  "帮我报销这次出差费用。",
];

const testExamples = [
  { title: "费用录入", input: "2026-09-18 打车 38 元，商户是 TEST Taxi，去客户现场做需求访谈。", answer: "已整理一笔交通费用：TEST Taxi，38.00 元，2026-09-18，用途为客户现场需求访谈。这是待确认草稿，尚未保存，请核对后再创建费用。", check: "金额、日期与用途是否准确；是否清楚说明待确认、尚未保存。" },
  { title: "超标咨询", input: "酒店每晚 680 元，超过标准该怎么办？", answer: "如已超过适用住宿标准，需要补充超标原因并交由人工审核。请补充出差地点、入住天数，以及 680 元是否为每晚含税金额；最终是否报销以审核结果为准。", check: "是否依据适用制度解释；不编造标准、不承诺报销，能追问必要信息。" },
  { title: "信息缺失", input: "帮我报销这次出差费用。", answer: "请提供费用的金额、日期、商户、分类和用途，也可以先上传票据。我会帮你整理，信息补齐后再生成待确认草稿。", check: "信息不足时先追问，不虚构金额或生成可保存草稿。" },
];

export default function AgentStudio() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState("prompt"),
    [section, setSection] = useState<"identity" | "instructions" | "receipt">(
      "identity",
    );
  const [view, setView] = useState("editor"),
    [mobilePanel, setMobilePanel] = useState("config");
  const [busy, setBusy] = useState(""),
    [debugging, setDebugging] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [key, setKey] = useState(""),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<Chat[]>([]),
    [runs, setRuns] = useState<Run[]>([]);
  const [testMode, setTestMode] = useState<"example" | "live">("example");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false),
    [note, setNote] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const tail = useRef<HTMLDivElement>(null);
  const publishDialog = useRef<HTMLElement>(null);
  const dirty = Boolean(
    snapshot &&
      config &&
      JSON.stringify(snapshot.config) !== JSON.stringify(config),
  );
  function apply(next: Snapshot) {
    setSnapshot(next);
    setConfig(structuredClone(next.config));
  }
  async function loadRuns() {
    setRuns(await api<Run[]>("/agent/runs"));
  }
  useEffect(() => {
    document.title = "AI 配置与测试 · 轻报";
    (async () => {
      try {
        await api("/session");
        apply(await api<Snapshot>("/agent"));
        await loadRuns();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest" });
  }, [messages, debugging]);
  useEffect(() => {
    if (!publishOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    publishDialog.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setPublishOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = publishDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)');
      if (!nodes?.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === publishDialog.current)) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, [publishOpen, busy]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function update<K extends keyof Config>(k: K, value: Config[K]) {
    setConfig((c) => (c ? { ...c, [k]: value } : c));
  }
  async function mutate(
    name: string,
    path: string,
    body: unknown,
    method = "POST",
  ) {
    if (busy || debugging) return;
    setBusy(name);
    setError("");
    try {
      apply(await api<Snapshot>(path, body, method));
      await loadRuns();
      setToast(
        name === "save"
          ? "草稿已保存，员工端仍使用已发布版本"
          : name === "key"
            ? "密钥已保存在本机，尚未测试连接"
            : name === "publish"
              ? "已发布，新请求开始使用此版本"
              : name === "rollback"
                ? "已切换已发布版本，编辑中的草稿保留"
                : "历史配置已复制为草稿",
      );
      if (name === "key") setKey("");
      if (name === "publish") {
        setPublishOpen(false);
        setNote("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function debug() {
    if (testMode !== "live" || !input.trim() || !snapshot?.connection.modelReady || dirty || debugging || busy) return;
    const message = input.trim(),
      history = messages
        .filter((m) => m.role === "user" || m.run?.status === "success")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setDebugging(true);
    setError("");
    try {
      const run = await api<Run>("/agent/debug", {
        message,
        history,
        revision: snapshot.revision,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: run.error || run.result?.message || "已返回结构化结果。",
          run,
        },
      ]);
      await loadRuns();
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (e as Error).message },
      ]);
    } finally {
      setDebugging(false);
    }
  }
  if (!snapshot || !config)
    return (
      <div className="boot">
        <Bot size={36} />
        <h2>AI 配置与测试</h2>
        <p>{error || "正在载入配置…"}</p>
        {error && (
          <button
            className="button secondary"
            onClick={() => location.reload()}
          >
            重试
          </button>
        )}
      </div>
    );
  const changedFromActive =
    JSON.stringify(config) !== JSON.stringify(snapshot.activeConfig);
  const disabled = Boolean(busy || debugging);
  const jsonSchema = JSON.stringify(snapshot.schema, null, 2);

  return (
    <div className="studio-shell">
      <aside className="studio-rail">
        <a href="/" className="studio-logo" aria-label="返回报销工作台">
          <ReceiptText size={23} />
        </a>
        <span className="rail-divider" />
        {[
          { id: "editor", icon: SlidersHorizontal, text: "配置" },
          { id: "versions", icon: GitBranch, text: "版本" },
          { id: "runs", icon: History, text: "记录" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id);
              setError("");
            }}
            className={view === item.id ? "selected" : ""}
            aria-label={item.text}
          >
            <item.icon size={21} />
            <span>{item.text}</span>
          </button>
        ))}
        <a className="rail-back" href="/" title="返回报销端">
          <ArrowLeft size={19} />
          <span>报销端</span>
        </a>
      </aside>
      <div className="studio-workspace">
        <header className="studio-header">
          <div className="studio-title">
            <span className="studio-bot">
              <Bot size={22} />
            </span>
            <div>
              <div className="studio-breadcrumb">
                轻报 <span>/</span> AI 配置与测试
              </div>
              <h1>AI 配置与测试</h1>
            </div>
            <span className="studio-version">
              已发布 v{snapshot.activeVersion}
            </span>
          </div>
          <div className="studio-header-actions">
            <span className={`save-indicator ${dirty ? "dirty" : ""}`}>
              <i />
              {dirty
                ? "草稿未保存"
                : changedFromActive
                  ? "有未发布变更"
                  : "配置已同步"}
            </span>
            <button
              className="button secondary"
              disabled={!dirty || disabled}
              onClick={() =>
                mutate(
                  "save",
                  "/agent/draft",
                  { config, revision: snapshot.revision },
                  "PUT",
                )
              }
            >
              {busy === "save" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Save size={16} />
              )}
              保存草稿
            </button>
            <button
              className="button primary"
              disabled={dirty || disabled || !snapshot.connection.modelReady}
              title={
                !snapshot.connection.modelReady
                  ? "模型接通并调试成功后可发布"
                  : undefined
              }
              onClick={() => {
                setError("");
                setPublishOpen(true);
              }}
            >
              <Upload size={16} />
              发布版本
            </button>
          </div>
        </header>
        {error && (
          <div className="studio-error" role="alert">
            {error}
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {view === "editor" ? (
          <>
            <div className="studio-mobile-tabs">
              <button
                className={mobilePanel === "config" ? "active" : ""}
                onClick={() => setMobilePanel("config")}
              >
                助手配置
              </button>
              <button
                className={mobilePanel === "debug" ? "active" : ""}
                onClick={() => setMobilePanel("debug")}
              >
                示例与测试
              </button>
            </div>
            <div className={`studio-editor mobile-${mobilePanel}`}>
              <section className="studio-config">
                <div className="config-intro">
                  <div>
                    <span className="eyebrow">AI CONFIGURATION</span>
                    <h2>定义你的报销助手</h2>
                    <p>已预置报销提示词。先浏览示例，需要时再接入自己的模型。</p>
                  </div>
                  <span className="draft-tag">
                    <FileText size={14} />
                    草稿 r{snapshot.revision}
                  </span>
                </div>
                <div className="optional-ai-note">
                  <Sparkles size={17} />
                  <div><strong>AI 接入可选 · 基础报销无需密钥</strong><p>预置提示词 → 自选 API → 测试回答 → 按需发布到报销端</p></div>
                  <button onClick={() => setTab("model")}>配置 API <ArrowRight size={13} /></button>
                </div>
                <div
                  className="config-tabs"
                  role="tablist"
                  aria-label="AI 配置模块"
                >
                  {[
                    { id: "prompt", text: "提示词", icon: MessageSquare },
                    { id: "model", text: "API 接入", icon: Settings2 },
                    { id: "output", text: "输出规范", icon: Braces },
                    { id: "capabilities", text: "能力边界", icon: ShieldCheck },
                  ].map((t) => (
                    <button
                      role="tab"
                      aria-selected={tab === t.id}
                      key={t.id}
                      className={tab === t.id ? "active" : ""}
                      onClick={() => setTab(t.id)}
                    >
                      <t.icon size={16} />
                      {t.text}
                    </button>
                  ))}
                </div>
                <fieldset
                  className="config-body"
                  role="tabpanel"
                  disabled={disabled}
                >
                  {tab === "prompt" && (
                    <>
                      <div className="studio-card">
                        <div className="studio-card-title">
                          <div>
                            <MessageSquare size={18} />
                            <h3>系统提示词</h3>
                          </div>
                          <button className="preset-button" onClick={() => {
                            update("prompt", { ...config.prompt, [section]: presetPrompts[section] });
                            setToast("已填入本分区预置提示词，尚未保存");
                          }}>填入预置提示词</button>
                        </div>
                        <div className="prompt-tabs">
                          {(
                            [
                              { id: "identity", text: "角色设定" },
                              { id: "instructions", text: "业务指引" },
                              { id: "receipt", text: "票据提取" },
                            ] as const
                          ).map((s) => (
                            <button
                              key={s.id}
                              className={section === s.id ? "active" : ""}
                              onClick={() => setSection(s.id)}
                            >
                              {s.text}
                            </button>
                          ))}
                        </div>
                        <label className="sr-only" htmlFor="agent-prompt">
                          {section === "identity"
                            ? "角色设定提示词"
                            : section === "instructions"
                              ? "业务指引提示词"
                              : "票据提取提示词"}
                        </label>
                        <textarea
                          id="agent-prompt"
                          className="prompt-editor"
                          value={config.prompt[section]}
                          maxLength={section === "instructions" ? 6000 : 4000}
                          onChange={(e) =>
                            update("prompt", {
                              ...config.prompt,
                              [section]: e.target.value,
                            })
                          }
                          spellCheck={false}
                        />
                        <div className="editor-footer">
                          <span>
                            <Code2 size={13} />
                            仅作为模型指令，不修改报销制度
                          </span>
                          <span>{config.prompt[section].length} 字符</span>
                        </div>
                      </div>
                      <div className="studio-note">
                        <Sparkles size={18} />
                        <div>
                          <strong>让提示词的变化可验证</strong>
                          <p>
                            可以要求“先给结论，再列出缺失信息”。保存草稿后，在右侧「真实 API 测试」中使用同一案例比较回答；发布后才会影响员工端。
                          </p>
                        </div>
                      </div>
                      <div className="studio-card compact">
                        <label className="studio-field">
                          助手名称
                          <input
                            value={config.name}
                            maxLength={50}
                            onChange={(e) => update("name", e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="flow-path">
                        <span>
                          <MessageSquare size={16} />
                          用户输入
                        </span>
                        <ArrowRight size={14} />
                        <span>
                          <Bot size={16} />
                          模型理解
                        </span>
                        <ArrowRight size={14} />
                        <span>
                          <Braces size={16} />
                          格式校验
                        </span>
                        <ArrowRight size={14} />
                        <span>
                          <Check size={16} />
                          人工确认
                        </span>
                      </div>
                    </>
                  )}
                  {tab === "model" && (
                    <>
                      <div className="studio-card padded">
                        <div className="studio-card-title">
                          <div>
                            <Settings2 size={18} />
                            <h3>模型服务</h3>
                          </div>
                          <span>OpenAI 兼容接口</span>
                        </div>
                        <p className="studio-description">
                          是否接入、使用哪家服务和哪个模型，由你决定。支持 Chat Completions 兼容接口及 JSON 输出；填写服务商提供的 API 前缀，不含 /chat/completions。
                        </p>
                        <label className="studio-field">
                          API 服务地址
                          <input
                            type="url"
                            placeholder="https://your-provider.example/v1"
                            value={config.model.baseURL}
                            onChange={(e) => {
                              setKey("");
                              update("model", {
                                ...config.model,
                                baseURL: e.target.value,
                              });
                            }}
                          />
                        </label>
                        <label className="studio-field">
                          模型名称
                          <input
                            placeholder="填写服务商提供的模型名或接入点 ID"
                            value={config.model.name}
                            onChange={(e) =>
                              update("model", {
                                ...config.model,
                                name: e.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="studio-field-grid">
                          <label className="studio-field">
                            Temperature
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.1"
                              value={config.model.temperature}
                              onChange={(e) =>
                                update("model", {
                                  ...config.model,
                                  temperature: Number(e.target.value),
                                })
                              }
                            />
                            <small>越低越稳定，范围 0–1</small>
                          </label>
                          <label className="studio-field">
                            输出 Token 上限
                            <input
                              type="number"
                              min="256"
                              max="4096"
                              value={config.model.maxTokens}
                              onChange={(e) =>
                                update("model", {
                                  ...config.model,
                                  maxTokens: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="studio-field">
                            超时时间（秒）
                            <input
                              type="number"
                              min="5"
                              max="60"
                              value={config.model.timeoutSeconds}
                              onChange={(e) =>
                                update("model", {
                                  ...config.model,
                                  timeoutSeconds: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                      <div className="studio-card padded">
                        <div className="studio-card-title">
                          <div>
                            <KeyRound size={18} />
                            <h3>访问密钥</h3>
                          </div>
                          <span
                            className={
                              snapshot.connection.configured ? "text-green" : ""
                            }
                          >
                            {snapshot.connection.configured
                              ? snapshot.connection.source + " · 已配置"
                              : "尚未配置"}
                          </span>
                        </div>
                        <p className="studio-description">
                          密钥保存到当前本机服务端，仅用于调用你选择的服务。发起真实测试会将输入及最近对话发送给该服务，费用按服务商规则计算。更换地址后需重新配置密钥。
                        </p>
                        <label className="studio-field">
                          API Key
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={key}
                            placeholder="仅在新增或替换时填写，已有密钥不回显"
                            onChange={(e) => setKey(e.target.value)}
                          />
                        </label>
                        <button
                          className="button secondary"
                          disabled={dirty || disabled || !key.trim()}
                          onClick={() =>
                            mutate("key", "/agent/credentials", {
                              baseURL: config.model.baseURL,
                              apiKey: key,
                            })
                          }
                        >
                          <KeyRound size={15} />
                          保存密钥
                        </button>
                        {dirty && (
                          <small className="field-help">
                            请先保存上方草稿，再保存对应服务地址的密钥。
                          </small>
                        )}
                      </div>
                    </>
                  )}
                  {tab === "output" && (
                    <>
                      <div className="studio-card padded">
                        <div className="studio-card-title">
                          <div>
                            <Braces size={18} />
                            <h3>结构化输出</h3>
                          </div>
                          <span>服务端校验</span>
                        </div>
                        <p className="studio-description">
                          固定字段与费用表单保持兼容。可调整生成草稿前必须补齐的信息，以及回答的风格和长度。
                        </p>
                        <label className="studio-field">
                          输出协议
                          <select
                            value={config.output.format}
                            onChange={(e) =>
                              update("output", {
                                ...config.output,
                                format: e.target
                                  .value as Config["output"]["format"],
                              })
                            }
                          >
                            <option value="json_object">
                              JSON Object · 通用兼容
                            </option>
                            <option value="json_schema">
                              JSON Schema · 严格结构
                            </option>
                          </select>
                          <small>
                            严格结构需要模型服务支持；不支持时调试会明确报错。
                          </small>
                        </label>
                        <div className="studio-field-grid">
                          <label className="studio-field">
                            回答风格
                            <select
                              value={config.output.tone}
                              onChange={(e) =>
                                update("output", {
                                  ...config.output,
                                  tone: e.target.value as
                                    | "concise"
                                    | "detailed",
                                })
                              }
                            >
                              <option value="concise">简洁 · 结论优先</option>
                              <option value="detailed">
                                详细 · 结论、依据、下一步
                              </option>
                            </select>
                          </label>
                          <label className="studio-field">
                            回答字数上限
                            <input
                              type="number"
                              min="100"
                              max="2000"
                              value={config.output.maxReplyChars}
                              onChange={(e) =>
                                update("output", {
                                  ...config.output,
                                  maxReplyChars: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="required-title">
                          费用草稿必填项
                          <span>缺失时先追问，不生成可保存草稿</span>
                        </div>
                        <div className="required-fields">
                          {Object.entries(fieldLabels).map(([k, label]) => (
                            <label key={k}>
                              <input
                                type="checkbox"
                                checked={config.output.requiredFields.includes(
                                  k,
                                )}
                                disabled={k === "amount"}
                                onChange={(e) =>
                                  update("output", {
                                    ...config.output,
                                    requiredFields: e.target.checked
                                      ? [...config.output.requiredFields, k]
                                      : config.output.requiredFields.filter(
                                          (v) => v !== k,
                                        ),
                                  })
                                }
                              />
                              {label}
                              {k === "amount" && <small>固定</small>}
                            </label>
                          ))}
                        </div>
                      </div>
                      <details className="studio-schema">
                        <summary>
                          <Code2 size={16} />
                          查看输出 JSON Schema
                          <ChevronDown size={15} />
                        </summary>
                        <pre>{jsonSchema}</pre>
                      </details>
                      <div className="studio-note">
                        <ShieldCheck size={18} />
                        <div>
                          <strong>格式错误不会直接写入费用</strong>
                          <p>
                            服务端校验
                            JSON、金额、日期与币种。调试只生成候选结果，不创建费用、不提交审批。
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "capabilities" && (
                    <>
                      <div className="studio-card padded">
                        <div className="studio-card-title">
                          <div>
                            <ShieldCheck size={18} />
                            <h3>启用的能力</h3>
                          </div>
                          <span>发布后生效</span>
                        </div>
                        {(
                          [
                            {
                              id: "expenseDraft",
                              title: "整理费用草稿",
                              text: "理解费用描述，返回待确认的表单信息；关闭时服务端移除候选草稿。",
                              icon: ReceiptText,
                            },
                            {
                              id: "policyAnswer",
                              title: "演示制度问答",
                              text: "解释当前报销标准。此开关约束模型指令与本地回答，不是独立的权限控制。",
                              icon: FileText,
                            },
                            {
                              id: "receiptExtraction",
                              title: "票据字段整理",
                              text: "在本机 OCR 后由模型整理字段，使用「票据提取」提示词；关闭后保留本机 OCR。",
                              icon: Braces,
                            },
                          ] as const
                        ).map((c) => (
                          <label className="capability-row" key={c.id}>
                            <span className="capability-icon">
                              <c.icon size={20} />
                            </span>
                            <span>
                              <strong>{c.title}</strong>
                              <small>{c.text}</small>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              checked={config.capabilities[c.id]}
                              onChange={(e) =>
                                update("capabilities", {
                                  ...config.capabilities,
                                  [c.id]: e.target.checked,
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="host-boundaries">
                        <ShieldCheck size={20} />
                        <h3>由业务系统控制的边界</h3>
                        <p>
                          报销金额校验、角色权限、状态流转和实际保存仍由后端执行。AI 助手
                          没有提交、审批或付款工具，提示词不能赋予这些操作能力。
                        </p>
                        <a href="/">
                          查看报销工作台 <ArrowRight size={14} />
                        </a>
                      </div>
                    </>
                  )}
                  <p className="studio-local-note">
                    本地单用户管理端 · 配置和运行记录保存在本机
                  </p>
                </fieldset>
              </section>
              <section className="studio-preview">
                <div className="preview-header">
                  <div>
                    <FlaskConical size={18} />
                    <h2>示例与测试</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="清空调试对话"
                    disabled={debugging || !messages.length}
                    onClick={() => setMessages([])}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div className="test-mode-switch" role="group" aria-label="测试模式">
                  <button aria-pressed={testMode === "example"} disabled={debugging} onClick={() => setTestMode("example")}>示例展示</button>
                  <button aria-pressed={testMode === "live"} disabled={debugging} onClick={() => setTestMode("live")}>真实 API 测试</button>
                </div>
                {testMode === "example" ? (
                  <div className="example-showcase">
                    <span className="sandbox-pill">预置示例 · 非模型生成</span>
                    <h3>先看看报销助手如何回答</h3>
                    <p className="studio-description">以下为固定的预期回答，用于了解使用方式。修改提示词不会改变示例，也不会产生调用费用或运行记录。</p>
                    <div className="example-case-tabs" role="group" aria-label="预置测试案例">
                      {testExamples.map((example, index) => <button key={example.title} aria-pressed={index === exampleIndex} onClick={() => setExampleIndex(index)}>{example.title}</button>)}
                    </div>
                    <article className="example-dialogue">
                      <span>用户输入 · TEST 案例</span><p>{testExamples[exampleIndex].input}</p>
                      <span>预期回答示例</span><p>{testExamples[exampleIndex].answer}</p>
                    </article>
                    <div className="example-check"><ShieldCheck size={17} /><div><strong>测试时观察什么</strong><p>{testExamples[exampleIndex].check}</p></div></div>
                    <button className="button secondary" onClick={() => { setInput(testExamples[exampleIndex].input); setTestMode("live"); }}>用此案例测试自己的模型 <ArrowRight size={15} /></button>
                    <small className="field-help">真实回答取决于你的模型、提示词和配置，不要求逐字复现示例。</small>
                  </div>
                ) : (<>
                <div className="preview-meta">
                  <span className="sandbox-pill">SANDBOX</span>
                  <span>{config.model.name || "尚未选择模型"}</span>
                  <span>草稿 r{snapshot.revision}</span>
                </div>
                <div
                  className={`connection-banner ${snapshot.connection.modelReady ? "configured" : ""}`}
                >
                  <span className="connection-dot" />
                  <div>
                    <strong>
                      {snapshot.connection.modelReady
                        ? "模型已配置，等待调试验证"
                        : "尚未接入 · 由你选择模型服务"}
                    </strong>
                    <p>
                      {snapshot.connection.modelReady
                        ? "调试使用已保存的草稿，不改变员工端配置。"
                        : "填写 API 地址、模型名和密钥后即可测试。也可以返回示例展示。"}
                    </p>
                  </div>
                  {!snapshot.connection.modelReady && (
                    <button
                      onClick={() => {
                        setTab("model");
                        setMobilePanel("config");
                      }}
                    >
                      去配置 <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                <div className="preview-chat" aria-live="polite">
                  {!messages.length && (
                    <div className="preview-empty">
                      <span>
                        <Sparkles size={28} />
                      </span>
                      <h3>用一条真实场景，验证你的想法</h3>
                      <p>
                        检查是否理解了费用、是否追问缺失信息，
                        <br />
                        以及输出能否正确填入报销表单。
                      </p>
                      <div className="preview-example">
                        <span>例如</span>
                        <p>“昨天打车 38 元，去客户现场做需求访谈。”</p>
                      </div>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div className={`preview-message ${m.role}`} key={i}>
                      <span className="preview-avatar">
                        {m.role === "user" ? "你" : <Bot size={17} />}
                      </span>
                      <div className="preview-message-content">
                        <p
                          className={
                            m.run && m.run.status !== "success"
                              ? "run-failure"
                              : ""
                          }
                        >
                          {m.text}
                        </p>
                        {m.run?.result?.draft && (
                          <div className="preview-draft">
                            <span>
                              <ReceiptText size={15} />
                              候选费用 · 尚未保存
                            </span>
                            <strong>
                              {m.run.result.draft.merchant || "商户待补充"}
                            </strong>
                            <b>¥{m.run.result.draft.amount}</b>
                            <small>
                              {m.run.result.draft.date} ·{" "}
                              {m.run.result.draft.category}
                            </small>
                          </div>
                        )}
                        {m.run && (
                          <>
                            <div className="run-meta">
                              <span
                                className={
                                  m.run.status === "success" ? "text-green" : ""
                                }
                              >
                                {m.run.status === "success"
                                  ? "模型调用成功"
                                  : m.run.status === "not_configured"
                                    ? "未发起模型调用"
                                    : "调试失败"}
                              </span>
                              <span>{m.run.durationMs} ms</span>
                              <span>
                                {m.run.usage
                                  ? `${m.run.usage.totalTokens} tokens`
                                  : "Token —"}
                              </span>
                            </div>
                            <details className="run-json">
                              <summary>
                                <Braces size={13} />
                                结构化结果与运行信息
                              </summary>
                              <pre>
                                {JSON.stringify(
                                  {
                                    runId: m.run.id,
                                    revision: m.run.revision,
                                    status: m.run.status,
                                    result: m.run.result,
                                    error: m.run.error,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {debugging && (
                    <div className="debug-loading">
                      <Loader2 size={16} className="spin" />
                      正在请求模型并校验输出…
                    </div>
                  )}
                  <div ref={tail} />
                </div>
                <div className="preview-composer">
                  <div className="debug-samples">
                    {["费用录入", "超标咨询", "信息缺失"].map((text, i) => (
                      <button
                        key={text}
                        onClick={() => setInput(sampleQueries[i])}
                        disabled={debugging}
                      >
                        {text}
                        <Plus size={12} />
                      </button>
                    ))}
                  </div>
                  {dirty && (
                    <div className="debug-save-notice">
                      有未保存的配置，请先点击顶部「保存草稿」。
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void debug();
                    }}
                  >
                    <textarea
                      aria-label="AI 测试消息"
                      placeholder={snapshot.connection.modelReady ? "输入测试场景，Enter 发送，Shift+Enter 换行" : "可先准备测试问题，接入 API 后再运行"}
                      rows={3}
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
                          void debug();
                        }
                      }}
                    />
                    <div>
                      <span>
                        <ShieldCheck size={13} />
                        调用自选模型 · 不创建报销单
                      </span>
                      <button
                        className="button primary"
                        aria-label="运行真实 API 测试"
                        disabled={dirty || disabled || !snapshot.connection.modelReady || !input.trim()}
                      >
                        {debugging ? (
                          <Loader2 size={17} className="spin" />
                        ) : (
                          <Send size={17} />
                        )}
                      </button>
                    </div>
                  </form>
                </div>
                </>)}
              </section>
            </div>
          </>
        ) : (
          <main className="studio-history">
            <div className="history-heading">
              <div>
                <span className="eyebrow">
                  {view === "versions"
                    ? "RELEASE MANAGEMENT"
                    : "RUN OBSERVABILITY"}
                </span>
                <h2>{view === "versions" ? "版本与发布" : "运行记录"}</h2>
                <p>
                  {view === "versions"
                    ? "已发布配置不可原地修改。可复制到草稿继续编辑，或切换回历史版本。"
                    : "查看最近 30 次调试与员工端模型请求，追溯配置、输出和错误。"}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  view === "runs"
                    ? loadRuns().catch((e) => setError(e.message))
                    : setView("editor")
                }
              >
                {view === "runs" ? (
                  <RotateCcw size={16} />
                ) : (
                  <ArrowLeft size={16} />
                )}{" "}
                {view === "runs" ? "刷新记录" : "返回配置"}
              </button>
            </div>
            {view === "versions" ? (
              <>
                <div className="release-current">
                  <GitBranch size={24} />
                  <div>
                    <strong>员工端使用 v{snapshot.activeVersion}</strong>
                    <p>
                      {snapshot.activeConnection.modelReady
                        ? snapshot.activeConfig.model.name
                        : "当前未连接模型，员工端使用本地快捷模式"}
                    </p>
                  </div>
                  <span className="sandbox-pill">ACTIVE</span>
                </div>
                <div className="version-list">
                  {snapshot.versions.map((v) => (
                    <article key={v.id}>
                      <div className="version-number">v{v.id}</div>
                      <div>
                        <h3>
                          {v.note}
                          {v.id === snapshot.activeVersion && (
                            <span>使用中</span>
                          )}
                        </h3>
                        <p>{time(v.createdAt)}</p>
                      </div>
                      <div className="version-actions">
                        <button
                          className="button secondary"
                          disabled={dirty || disabled}
                          onClick={() =>
                            mutate("restore", "/agent/restore", {
                              id: v.id,
                              revision: snapshot.revision,
                            })
                          }
                        >
                          <FileText size={14} />
                          复制到草稿
                        </button>
                        <button
                          className="button secondary"
                          disabled={disabled || v.id === snapshot.activeVersion}
                          onClick={() =>
                            mutate("rollback", "/agent/rollback", {
                              id: v.id,
                              revision: snapshot.revision,
                            })
                          }
                        >
                          <RotateCcw size={14} />
                          切换此版本
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {dirty && (
                  <p className="field-help">
                    请先保存当前草稿，再复制历史版本。
                  </p>
                )}
              </>
            ) : (
              <div className="run-list">
                {!runs.length && (
                  <div className="preview-empty">
                    <Terminal size={30} />
                    <h3>还没有运行记录</h3>
                    <p>从配置页发起一次真实 API 测试，结果会保存在这里。</p>
                  </div>
                )}
                {runs.map((r) => (
                  <article key={r.id} className="run-record">
                    <button
                      onClick={() =>
                        setExpanded(expanded === r.id ? null : r.id)
                      }
                      aria-expanded={expanded === r.id}
                    >
                      <span
                        className={`run-status ${r.status === "success" ? "success" : "failed"}`}
                      >
                        {r.status === "success" ? (
                          <Check size={16} />
                        ) : (
                          <CircleHelp size={16} />
                        )}
                      </span>
                      <span>
                        <strong>{r.input.slice(0, 90)}</strong>
                        <small>
                          {time(r.createdAt)} ·{" "}
                          {r.source === "debug"
                            ? `草稿 r${r.revision}`
                            : `已发布 v${r.versionId}`}{" "}
                          · {r.kind === "receipt" ? "票据提取" : "对话"} ·{" "}
                          {r.model}
                        </small>
                      </span>
                      <span className="run-list-state">
                        {r.status === "success"
                          ? "成功"
                          : r.status === "not_configured"
                            ? "未连接"
                            : r.status === "credential_changed"
                              ? "密钥已变更"
                              : "失败"}
                        <small>{r.durationMs} ms</small>
                      </span>
                      <ChevronDown size={16} />
                    </button>
                    {expanded === r.id && (
                      <div className="run-record-detail">
                        <div>
                          <span>输入</span>
                          <p>{r.input}</p>
                        </div>
                        <div>
                          <span>结果 / 错误</span>
                          <pre>
                            {JSON.stringify(
                              r.result || { error: r.error },
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                        <p>
                          Run ID：{r.id}
                          <br />
                          配置摘要：{r.configHash}
                          <br />
                          Token：{r.usage?.totalTokens ?? "不可用"}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {publishOpen && (
        <div className="studio-modal-backdrop">
          <section
            className="studio-publish-modal"
            ref={publishDialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="发布 AI 配置版本"
          >
            <div className="studio-card-title">
              <div>
                <GitBranch size={20} />
                <h2>发布新版本</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭发布窗口"
                onClick={() => setPublishOpen(false)}
                disabled={disabled}
              >
                <X size={19} />
              </button>
            </div>
            <p>
              当前草稿 r{snapshot.revision}{" "}
              将保存为不可修改的版本。员工端后续请求使用新版本；进行中的请求不变。
            </p>
            <div className="publish-summary">
              <span>
                模型<strong>{config.model.name}</strong>
              </span>
              <span>
                输出<strong>{config.output.format}</strong>
              </span>
              <span>
                启用能力
                <strong>
                  {Object.values(config.capabilities).filter(Boolean).length} 项
                </strong>
              </span>
            </div>
            <label className="studio-field">
              版本说明
              <textarea
                placeholder="例如：优化缺失信息追问，增加用途必填"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <small>服务端要求当前配置至少完成一次成功的真实模型调试。</small>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setPublishOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={disabled}
                onClick={() =>
                  mutate("publish", "/agent/publish", {
                    revision: snapshot.revision,
                    note,
                  })
                }
              >
                {busy === "publish" ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Upload size={16} />
                )}
                确认发布
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
