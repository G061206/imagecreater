import { useEffect, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bell,
  CaretDown,
  ChartBar,
  Check,
  ClockCounterClockwise,
  Code,
  Coins,
  Copy,
  DotsThree,
  DownloadSimple,
  Gauge,
  GearSix,
  Image as ImageIcon,
  Key,
  Layout,
  List,
  MagnifyingGlass,
  PaintBrush,
  PaperPlaneTilt,
  Plus,
  Question,
  Queue,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Trash,
  User,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { AuthScreen } from "./AuthScreen.jsx";
import { AccountSettings } from "./AccountSettings.jsx";
import { UserManagement } from "./UserManagement.jsx";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const DEFAULT_MODELS = [
  {
    id: "openai/gpt-image-2",
    name: "GPT Image 2",
    provider: "OpenAI",
    badge: "精细",
    enabled: true,
    ratios: ["1:1", "3:2", "2:3", "16:9", "9:16"],
    sizes: ["1024", "1536", "2048"],
    qualities: ["标准", "高清", "超高清"],
    cost: 12,
  },
  {
    id: "google/gemini-2.5-flash-image-preview",
    name: "Nano Banana",
    provider: "Google",
    badge: "快速",
    enabled: true,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"],
    sizes: ["1K", "2K", "4K"],
    qualities: ["标准", "高清"],
    cost: 6,
  },
  {
    id: "black-forest-labs/flux.1-kontext-max",
    name: "FLUX Kontext Max",
    provider: "Black Forest Labs",
    badge: "编辑",
    enabled: true,
    ratios: ["1:1", "4:3", "3:4", "16:9"],
    sizes: ["1024", "2048"],
    qualities: ["标准", "高清"],
    cost: 9,
  },
];

const NAV_ITEMS = [
  { id: "create", label: "创作", icon: PaintBrush },
  { id: "library", label: "作品库", icon: SquaresFour },
  { id: "queue", label: "生成队列", icon: Queue },
];

const ADMIN_NAV = [
  { id: "overview", label: "总览", icon: Gauge },
  { id: "users", label: "用户管理", icon: Users },
  { id: "models", label: "模型中心", icon: Sparkle },
  { id: "api", label: "API 配置", icon: Key },
  { id: "billing", label: "额度与计费", icon: Coins },
  { id: "logs", label: "请求日志", icon: List },
];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function IconButton({ label, children, className = "", onClick }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Sparkle weight="fill" size={16} /></span>
      <span>Prism</span>
    </div>
  );
}

function AccountMenu({ open, onClose, onAdmin, onCreator, isAdmin, canAdmin, profile, user, onSignOut, onAccountSettings }) {
  if (!open) return null;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || "Prism 用户";
  const initial = displayName[0]?.toUpperCase() || "U";
  return (
    <div className="account-menu">
      <div className="account-head">
        <span className="avatar avatar-large">{initial}</span>
        <div><strong>{displayName}</strong><span>{user?.email}</span></div>
      </div>
      <button onClick={() => { onCreator(); onClose(); }}><PaintBrush size={17} />创作工作台{!isAdmin && <Check size={16} />}</button>
      {canAdmin && <button onClick={() => { onAdmin(); onClose(); }}><ShieldCheck size={17} />管理后台{isAdmin && <Check size={16} />}</button>}
      <div className="menu-rule" />
      <button onClick={() => { onAccountSettings(); onClose(); }}><User size={17} />账户设置</button>
      <button onClick={onSignOut}><SignOut size={17} />退出登录</button>
    </div>
  );
}

function Header({ isAdmin, onAdmin, onCreator, role, profile, user, onSignOut, onProfileUpdated }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initial = (profile?.full_name || user?.email || "U")[0].toUpperCase();
  return (
    <header className="topbar">
      <div className="top-left">
        <Brand />
        <span className="top-divider" />
        <strong className="workspace-title">{isAdmin ? "管理中心" : "未命名项目"}</strong>
      </div>
      {!isAdmin && (
        <label className="global-search">
          <MagnifyingGlass size={18} />
          <input placeholder="搜索作品、提示词或项目" />
          <kbd>⌘ K</kbd>
        </label>
      )}
      <div className="top-actions">
        <IconButton label="帮助"><Question size={20} /></IconButton>
        <IconButton label="通知"><Bell size={20} /><i className="notification-dot" /></IconButton>
        <button className="credits"><Coins size={16} weight="fill" /><span>1,280</span></button>
        <button className="account-trigger" onClick={() => setAccountOpen((value) => !value)}>
          <span className="role-chip">{role === "admin" ? "ADMIN" : "PRO"}</span>
          <span className="avatar">{initial}</span>
          <CaretDown size={13} />
        </button>
        <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} onAdmin={onAdmin} onCreator={onCreator} isAdmin={isAdmin} canAdmin={role === "admin"} profile={profile} user={user} onSignOut={onSignOut} onAccountSettings={() => setSettingsOpen(true)} />
      </div>
      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={profile} user={user} onProfileUpdated={onProfileUpdated} />
    </header>
  );
}

function CreatorSidebar({ view, setView, collapsed, setCollapsed }) {
  return (
    <aside className={`creator-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="side-main">
        <button className="new-button" onClick={() => setView("create")}><Plus size={19} /><span>新建作品</span></button>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span>{id === "queue" && <b>2</b>}</button>
          ))}
        </nav>
        <div className="side-section-label">项目</div>
        <nav>
          <button><Layout size={19} /><span>品牌视觉</span></button>
          <button><ImageIcon size={19} /><span>电商素材</span></button>
        </nav>
      </div>
      <div className="side-bottom">
        <button><Trash size={19} /><span>回收站</span></button>
        <button onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ArrowRight size={19} /> : <ArrowLeft size={19} />}<span>收起</span></button>
      </div>
    </aside>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((option) => <button key={option} className={option === value ? "selected" : ""} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  );
}

function SelectField({ label, value, children, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function PromptPanel({ models, onGenerated }) {
  const activeModels = models.filter((model) => model.enabled);
  const [modelId, setModelId] = useState(activeModels[0]?.id || "");
  const model = activeModels.find((item) => item.id === modelId) || activeModels[0] || DEFAULT_MODELS[0];
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState(model.ratios[0]);
  const [size, setSize] = useState(model.sizes[0]);
  const [quality, setQuality] = useState(model.qualities[0]);
  const [count, setCount] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [seed, setSeed] = useState("");
  const [negative, setNegative] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setRatio(model.ratios[0]);
    setSize(model.sizes[0]);
    setQuality(model.qualities[0]);
  }, [model.id]);

  async function generate() {
    if (!prompt.trim()) {
      setError("先写下你想生成的画面");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("登录状态已失效，请重新登录");
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          modelId: model.id,
          prompt,
          ratio,
          size,
          quality,
          count,
          negativePrompt: negative,
          ...(seed ? { seed: Number(seed) } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `请求失败 (${response.status})`);
      const imageUrl = payload.assets?.[0]?.url;
      if (!imageUrl) throw new Error("生成任务完成，但没有可显示的图片");
      onGenerated({ imageUrl, prompt, model: model.name, ratio, size, quality, taskId: payload.taskId, createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
      setStatus("success");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }

  return (
    <aside className="prompt-panel">
      <div className="panel-heading"><div><SlidersHorizontal size={18} /><strong>生成设置</strong></div><div><IconButton label="服务端安全托管"><ShieldCheck size={19} /></IconButton><IconButton label="更多"><DotsThree size={20} /></IconButton></div></div>
      <div className="panel-scroll">
        <label className="prompt-box">
          <span>描述你的画面</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：雨后的东京街头，霓虹灯倒映在湿润路面上，电影感构图…" />
          <div className="prompt-tools"><button><Plus size={17} />参考图</button><span>{prompt.length} / 2000</span></div>
        </label>
        <div className="control-group">
          <SelectField label="模型" value={model.id} onChange={setModelId}>
            {activeModels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.provider}</option>)}
          </SelectField>
          <div className="model-meta"><span>{model.badge}</span><small>{model.id}</small></div>
        </div>
        <div className="control-group"><div className="control-title"><span>画面比例</span><small>{ratio}</small></div><Segmented options={model.ratios} value={ratio} onChange={setRatio} /></div>
        <div className="two-fields">
          <SelectField label="分辨率" value={size} onChange={setSize}>{model.sizes.map((item) => <option key={item}>{item}</option>)}</SelectField>
          <SelectField label="生成数量" value={count} onChange={(value) => setCount(Number(value))}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item} 张</option>)}</SelectField>
        </div>
        <div className="control-group"><div className="control-title"><span>品质</span><small>预计 {model.cost * count} 积分</small></div><Segmented options={model.qualities} value={quality} onChange={setQuality} /></div>
        <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><SlidersHorizontal size={17} />高级参数</span><CaretDown className={advanced ? "rotate" : ""} size={16} /></button>
        {advanced && <div className="advanced-fields"><label className="field block"><span>排除内容</span><input value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="模糊、文字、水印…" /></label><label className="field block"><span>随机种子</span><input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动" /></label></div>}
        {error && <div className="inline-error"><WarningCircle size={18} /><span>{error}</span></div>}
      </div>
      <div className="generate-footer">
        <button className="generate-button" disabled={status === "loading"} onClick={generate}>{status === "loading" ? <><span className="spinner" />正在生成</> : <><Sparkle size={18} weight="fill" />生成图像<span>{model.cost * count}</span></>}</button>
        <p><ShieldCheck size={13} />OpenRouter 由服务端安全托管</p>
      </div>
    </aside>
  );
}

function Canvas({ result, onClear }) {
  const [zoom, setZoom] = useState(100);
  if (!result) {
    return (
      <main className="canvas empty-canvas">
        <div className="canvas-toolbar"><div><button className="tool-active"><MagnifyingGlass size={18} /></button><button><ArrowCounterClockwise size={18} /></button></div><span>画布会自动适应生成比例</span></div>
        <div className="empty-state"><span className="empty-icon"><ImageIcon size={27} /></span><h1>从一个想法开始</h1><p>描述你脑海中的画面，Prism 会调用最合适的模型将它呈现出来。</p><div className="suggestions"><button>产品摄影</button><button>电影场景</button><button>角色设定</button></div></div>
        <div className="canvas-status"><span>准备就绪</span><span>自动保存</span></div>
      </main>
    );
  }
  return (
    <main className="canvas result-canvas">
      <div className="canvas-toolbar"><div><IconButton label="重新生成"><ArrowCounterClockwise size={18} /></IconButton><IconButton label="复制"><Copy size={18} /></IconButton><IconButton label="下载"><DownloadSimple size={18} /></IconButton><IconButton label="删除" onClick={onClear}><Trash size={18} /></IconButton></div><div className="zoom-control"><button onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(150, zoom + 10))}>+</button></div></div>
      <div className="image-stage"><img src={result.imageUrl} alt={result.prompt} style={{ width: `${zoom}%` }} /></div>
      <div className="result-meta"><div><span className="status-dot" /><strong>{result.model}</strong><span>{result.ratio} · {result.size} · {result.quality}</span></div><span>{result.createdAt}</span></div>
    </main>
  );
}

function LibraryView({ title, emptyText, icon: Icon }) {
  return <main className="collection-page"><div className="collection-head"><div><p>工作空间</p><h1>{title}</h1></div><button className="button primary"><Plus size={17} />新建作品</button></div><div className="filter-row"><div className="filter-search"><MagnifyingGlass size={17} /><input placeholder="搜索" /></div><button>全部模型<CaretDown size={14} /></button><button>最近创建<CaretDown size={14} /></button><IconButton label="网格视图"><SquaresFour size={18} /></IconButton></div><div className="collection-empty"><span><Icon size={28} /></span><h2>这里还没有内容</h2><p>{emptyText}</p><button className="button ghost"><Plus size={17} />开始创作</button></div></main>;
}

function CreatorApp({ models }) {
  const [view, setView] = useState("create");
  const [collapsed, setCollapsed] = useState(false);
  const [result, setResult] = useState(null);
  return (
    <div className="creator-layout">
      <CreatorSidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} />
      {view === "create" && <><Canvas result={result} onClear={() => setResult(null)} /><PromptPanel models={models} onGenerated={setResult} /></>}
      {view === "library" && <LibraryView title="作品库" emptyText="生成的图像会自动保存到这里。" icon={ImageIcon} />}
      {view === "queue" && <LibraryView title="生成队列" emptyText="所有任务都已完成，没有排队中的生成。" icon={Queue} />}
    </div>
  );
}

function StatCard({ label, value, delta, icon: Icon }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div></div>;
}

function Overview() {
  return (
    <div className="admin-page">
      <div className="page-title"><div><p>2026年6月19日 · 星期五</p><h1>运营总览</h1><span>查看平台实时运行状态与业务数据。</span></div><button className="button ghost"><DownloadSimple size={17} />导出报告</button></div>
      <div className="stats-grid"><StatCard label="今日生成" value="2,418" delta="↑ 18.2% 较昨日" icon={Sparkle} /><StatCard label="活跃用户" value="684" delta="↑ 8.4% 较昨日" icon={Users} /><StatCard label="API 成功率" value="99.7%" delta="稳定运行" icon={ChartBar} /><StatCard label="今日消耗" value="$86.40" delta="预算使用 42%" icon={Coins} /></div>
      <div className="admin-grid">
        <section className="admin-card usage-chart"><div className="card-heading"><div><h3>生成趋势</h3><p>过去 7 天的请求量</p></div><button>近 7 天<CaretDown size={14} /></button></div><div className="chart-area"><div className="chart-y"><span>3k</span><span>2k</span><span>1k</span><span>0</span></div><div className="bars">{[42, 55, 49, 68, 63, 78, 70].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} /><small>{["六", "日", "一", "二", "三", "四", "五"][index]}</small></div>)}</div></div></section>
        <section className="admin-card"><div className="card-heading"><div><h3>模型用量</h3><p>今日请求分布</p></div><DotsThree size={20} /></div><div className="model-usage"><div><span><i className="usage-color purple" />Nano Banana</span><strong>46%</strong></div><div><span><i className="usage-color blue" />GPT Image 2</span><strong>34%</strong></div><div><span><i className="usage-color gray" />FLUX Kontext</span><strong>20%</strong></div></div></section>
      </div>
      <section className="admin-card"><div className="card-heading"><div><h3>系统状态</h3><p>关键服务与供应商健康度</p></div><span className="healthy"><i />全部正常</span></div><div className="service-list"><div><span className="service-icon"><Code size={18} /></span><div><strong>OpenRouter API</strong><span>平均延迟 1.2s</span></div><b>正常</b></div><div><span className="service-icon"><Queue size={18} /></span><div><strong>任务队列</strong><span>2 个任务处理中</span></div><b>正常</b></div><div><span className="service-icon"><ShieldCheck size={18} /></span><div><strong>鉴权服务</strong><span>最后检查 30 秒前</span></div><b>正常</b></div></div></section>
    </div>
  );
}

function ModelCenter({ models, setModels }) {
  const [query, setQuery] = useState("");
  const visible = models.filter((model) => `${model.name}${model.provider}${model.id}`.toLowerCase().includes(query.toLowerCase()));
  function toggle(id) { setModels((items) => items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)); }
  return (
    <div className="admin-page">
      <div className="page-title"><div><p>平台配置</p><h1>模型中心</h1><span>配置可用模型、能力参数与积分成本。</span></div><button className="button primary"><Plus size={17} />添加模型</button></div>
      <div className="table-toolbar"><label><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" /></label><button>全部供应商<CaretDown size={14} /></button><button>全部状态<CaretDown size={14} /></button></div>
      <section className="table-card"><table><thead><tr><th>模型</th><th>能力</th><th>支持分辨率</th><th>积分/张</th><th>状态</th><th /></tr></thead><tbody>{visible.map((model) => <tr key={model.id}><td><div className="model-cell"><span className={`provider-logo ${model.provider.toLowerCase().replaceAll(" ", "-")}`}>{model.provider[0]}</span><div><strong>{model.name}</strong><span>{model.id}</span></div></div></td><td><span className="table-tag">文生图</span><span className="table-tag">{model.badge}</span></td><td>{model.sizes.join(" / ")}</td><td><strong>{model.cost}</strong></td><td><button className={`toggle ${model.enabled ? "on" : ""}`} onClick={() => toggle(model.id)}><span /></button></td><td><IconButton label="更多"><DotsThree size={20} /></IconButton></td></tr>)}</tbody></table></section>
      <div className="config-note"><WarningCircle size={18} /><div><strong>模型能力由管理员维护</strong><p>OpenRouter 会持续更新模型目录。上线时应定期同步供应商元数据，并在服务端校验实际支持参数。</p></div></div>
    </div>
  );
}

function ApiSettings() {
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState(null);
  async function test() {
    setTesting(true);
    try {
      const response = await fetch("/api/health");
      setHealth(response.ok ? "ok" : "error");
    } catch {
      setHealth("error");
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="admin-page narrow-page"><div className="page-title"><div><p>平台配置</p><h1>API 配置</h1><span>生产密钥由 VPS 环境变量管理，浏览器和数据库均不保存明文。</span></div></div>
      <section className="settings-card"><div className="settings-heading"><span><ShieldCheck size={20} /></span><div><h3>OpenRouter 服务端连接</h3><p>所有生成请求经同源 API 鉴权、计费和持久化。</p></div></div><div className="settings-form"><label><span>Base URL</span><input value="https://openrouter.ai/api/v1" disabled readOnly /></label><label><span>API Key</span><div className="password-input"><input value="由 OPENROUTER_API_KEY 环境变量托管" disabled readOnly /></div><small>修改密钥后执行 docker compose up -d app 使配置生效。</small></label><button className="button ghost test-button" onClick={test}>{testing ? <span className="spinner dark" /> : <Gauge size={17} />}{testing ? "正在检查" : health === "ok" ? "服务正常" : health === "error" ? "服务异常" : "检查服务"}</button></div></section>
      <section className="settings-card"><div className="settings-heading"><span><SlidersHorizontal size={20} /></span><div><h3>运行策略</h3><p>超时和并发由 REQUEST_TIMEOUT_MS 与 MAX_CONCURRENT_GENERATIONS 控制。</p></div></div></section>
    </div>
  );
}

function DataPage({ type }) {
  const configs = {
    users: { title: "用户管理", sub: "管理账户权限、状态与使用额度。", headers: ["用户", "角色", "今日生成", "剩余额度", "状态"], rows: [["Zhiheng", "管理员", "42", "1,280", "正常"], ["Mia Chen", "普通用户", "18", "640", "正常"], ["Lin Studio", "团队账户", "126", "3,840", "正常"], ["Avery", "普通用户", "0", "120", "暂停"]] },
    billing: { title: "额度与计费", sub: "设置积分规则并查看平台成本。", headers: ["套餐", "月度积分", "用户数", "月收入", "状态"], rows: [["Free", "100", "1,204", "$0", "启用"], ["Pro", "2,000", "386", "$4,980", "启用"], ["Studio", "10,000", "42", "$3,318", "启用"]] },
    logs: { title: "请求日志", sub: "追踪模型请求、耗时与错误。", headers: ["请求 ID", "用户", "模型", "耗时", "状态"], rows: [["req_a84f92", "Zhiheng", "Nano Banana", "8.4s", "成功"], ["req_b107ce", "Mia Chen", "GPT Image 2", "14.2s", "成功"], ["req_c92a41", "Lin Studio", "FLUX Kontext", "2.1s", "重试中"], ["req_e72d88", "Avery", "GPT Image 2", "—", "失败"]] },
  };
  const config = configs[type];
  return <div className="admin-page"><div className="page-title"><div><p>平台管理</p><h1>{config.title}</h1><span>{config.sub}</span></div><button className="button primary"><Plus size={17} />新增</button></div><div className="table-toolbar"><label><MagnifyingGlass size={17} /><input placeholder="搜索" /></label><button>筛选<CaretDown size={14} /></button><button>导出<DownloadSimple size={14} /></button></div><section className="table-card"><table><thead><tr>{config.headers.map((item) => <th key={item}>{item}</th>)}<th /></tr></thead><tbody>{config.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}{cellIndex === row.length - 1 && <span className={`row-status ${cell === "失败" || cell === "暂停" ? "bad" : cell === "重试中" ? "warn" : ""}`} />}</td>)}<td><IconButton label="更多"><DotsThree size={20} /></IconButton></td></tr>)}</tbody></table></section></div>;
}

function AdminApp({ models, setModels }) {
  const [page, setPage] = useState("overview");
  return <div className="admin-layout"><aside className="admin-sidebar"><div className="admin-nav-title">管理后台</div><nav>{ADMIN_NAV.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={19} /><span>{label}</span></button>)}</nav><div className="admin-sidebar-bottom"><div className="environment"><i /><div><strong>Production</strong><span>运行正常</span></div></div><button><GearSix size={19} />系统设置</button></div></aside><main className="admin-content">{page === "overview" && <Overview />}{page === "users" && <UserManagement />}{page === "models" && <ModelCenter models={models} setModels={setModels} />}{page === "api" && <ApiSettings />}{["billing", "logs"].includes(page) && <DataPage type={page} />}</main></div>;
}

export function App() {
  const [mode, setMode] = useState("creator");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [models, setModels] = useState(() => readStorage("prism_models", DEFAULT_MODELS));

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    supabase.from("ai_models").select("id,name,provider,badge,enabled,ratios,sizes,qualities,credit_cost").eq("enabled", true).order("credit_cost").then(({ data }) => {
      if (data?.length) setModels(data.map((item) => ({ ...item, cost: item.credit_cost })));
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    let active = true;
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("id,email,full_name,avatar_url,role,plan,credits,status")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfile(data || {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name,
          role: "user",
          plan: "free",
          credits: 100,
          status: "active",
        });
        setProfileLoading(false);
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => { localStorage.setItem("prism_models", JSON.stringify(models)); }, [models]);

  if (authLoading) return <div className="app-loading"><span className="brand-mark"><Sparkle size={16} weight="fill" /></span><i className="spinner" />正在恢复安全会话</div>;
  if (!isSupabaseConfigured || !session || recoveryMode) return <AuthScreen recoveryMode={recoveryMode} onRecoveryComplete={() => setRecoveryMode(false)} />;
  if (profileLoading || !profile) return <div className="app-loading"><span className="brand-mark"><Sparkle size={16} weight="fill" /></span><i className="spinner" />正在加载账户资料</div>;
  if (profile.status === "suspended") return <div className="account-blocked"><WarningCircle size={28} /><h1>账户已暂停</h1><p>请联系管理员恢复账户后再继续使用 Prism。</p><button className="button ghost" onClick={() => supabase.auth.signOut()}>退出登录</button></div>;

  const role = profile.role;
  const isAdmin = mode === "admin";
  return (
    <div className="app-shell">
      <Header isAdmin={isAdmin} role={role} profile={profile} user={session.user} onProfileUpdated={setProfile} onSignOut={() => supabase.auth.signOut()} onAdmin={() => { if (role === "admin") setMode("admin"); }} onCreator={() => setMode("creator")} />
      {isAdmin ? <AdminApp models={models} setModels={setModels} /> : <CreatorApp models={models} />}
    </div>
  );
}
