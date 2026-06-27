import { useEffect, useRef, useState } from "react";
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
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1024", "1536", "2048"],
    qualities: ["标准", "高清", "超高清"],
    cost: 14,
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
  {
    id: "black-forest-labs/flux.2-klein-4b",
    name: "FLUX.2 Klein 4B",
    provider: "Black Forest Labs",
    badge: "Klein",
    enabled: true,
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    qualities: ["标准", "高清", "超高清"],
    cost: 8,
  },
  {
    id: "bytedance-seed/seedream-4.5",
    name: "Seedream 4.5",
    provider: "ByteDance Seed",
    badge: "Seedream",
    enabled: true,
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    qualities: ["标准", "高清", "超高清"],
    cost: 10,
  },
  {
    id: "black-forest-labs/flux.2-max",
    name: "FLUX.2 Max",
    provider: "Black Forest Labs",
    badge: "Max",
    enabled: true,
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    qualities: ["标准", "高清", "超高清"],
    cost: 16,
  },
  {
    id: "x-ai/grok-imagine-image-quality",
    name: "Grok Imagine Image Quality",
    provider: "xAI",
    badge: "Quality",
    enabled: true,
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"],
    sizes: ["1K", "2K", "4K"],
    qualities: ["标准", "高清", "超高清"],
    cost: 12,
  },
];

const QUALITY_CREDIT_MULTIPLIERS = { "标准": 1, "高清": 2, "超高清": 4 };

function calculateCreditCost(model, quality, count = 1) {
  return (model?.cost || 0) * (QUALITY_CREDIT_MULTIPLIERS[quality] || 1) * count;
}

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

function appNotify(message, type = "info") {
  window.dispatchEvent(new CustomEvent("prism:notify", { detail: { message, type } }));
}

function IconButton({ label, children, className = "", onClick, disabled = false }) {
  const handleClick = onClick || (() => appNotify(label));
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={handleClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <button className={"toast " + (toast.type || "info")} onClick={onClose}>{toast.message}</button>;
}


async function fetchWithAuth(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("登录状态已失效");
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + token },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Request failed (" + response.status + ")");
  return payload;
}

function formatInteger(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function formatMoney(value) {
  return "$" + (Number(value) || 0).toFixed(2);
}

function trendLabel(value) {
  const number = Number(value) || 0;
  if (number > 0) return "↑ " + number + "% 较昨日";
  if (number < 0) return "↓ " + Math.abs(number) + "% 较昨日";
  return "与昨日持平";
}

function csvCell(value) {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readReferenceFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function createClientRequestId() {
  return "client-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function buildEditPrompt(sourceResult, turns, instruction) {
  const previousTurns = turns
    .filter((turn) => turn.status === "completed")
    .slice(-5)
    .map((turn, index) => String(index + 1) + ". " + turn.instruction)
    .join("\n");
  return [
    "Edit the provided reference image. Preserve the subject identity, composition, lighting, and style unless the user explicitly asks to change them.",
    sourceResult?.prompt ? "Original prompt: " + sourceResult.prompt : "",
    previousTurns ? "Previous edit instructions:\n" + previousTurns : "",
    "Current edit instruction: " + instruction,
    "Return only the revised image output.",
  ].filter(Boolean).join("\n").slice(0, 2000);
}

function generationTaskToResult(task, models) {
  const asset = task.assets?.[0];
  const parameters = task.parameters || {};
  const model = models.find((item) => item.id === task.model_id);
  return {
    assets: task.assets || [],
    imageUrl: asset?.url,
    prompt: task.prompt,
    model: model?.name || task.model_id,
    modelId: task.model_id,
    ratio: parameters.ratio || "-",
    size: parameters.size || "-",
    quality: parameters.quality || "-",
    taskId: task.id,
    creditCost: task.credit_cost,
    createdAt: task.created_at ? new Date(task.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "-",
  };
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
        <IconButton label="帮助" onClick={() => appNotify("Help is available in README.md and the API settings page.")}><Question size={20} /></IconButton>
        <IconButton label="通知" onClick={() => appNotify("No new notifications.")}><Bell size={20} /><i className="notification-dot" /></IconButton>
        <button className="credits" onClick={() => setSettingsOpen(true)}><Coins size={16} weight="fill" /><span>{profile?.credits ?? 0}</span></button>
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

function CreatorSidebar({ view, setView, collapsed, setCollapsed, queueCount = 0 }) {
  return (
    <aside className={"creator-sidebar " + (collapsed ? "collapsed" : "")}>
      <div className="side-main">
        <button className="new-button" onClick={() => setView("create")}><Plus size={19} /><span>{"新建作品"}</span></button>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span>{id === "queue" && queueCount > 0 && <b>{queueCount}</b>}</button>
          ))}
        </nav>
      </div>
      <div className="side-bottom">
        <button onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ArrowRight size={19} /> : <ArrowLeft size={19} />}<span>{"收起"}</span></button>
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

function PromptPanel({ models, availableCredits = null, onQueued, onGenerated, onFailed }) {
  const activeModels = models.filter((model) => model.enabled);
  const [modelId, setModelId] = useState(activeModels[0]?.id || "");
  const model = activeModels.find((item) => item.id === modelId) || activeModels[0] || DEFAULT_MODELS[0];
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState(model.ratios[0]);
  const [size, setSize] = useState(model.sizes[0]);
  const [quality, setQuality] = useState(model.qualities[0]);
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState([]);
  const [advanced, setAdvanced] = useState(false);
  const [seed, setSeed] = useState("");
  const [negative, setNegative] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [queuedNotice, setQueuedNotice] = useState(false);
  const queuedNoticeTimer = useRef(null);
  const estimatedCreditCost = calculateCreditCost(model, quality, count);
  const canAfford = availableCredits == null || availableCredits >= estimatedCreditCost;

  useEffect(() => {
    setRatio(model.ratios[0]);
    setSize(model.sizes[0]);
    setQuality(model.qualities[0]);
  }, [model.id]);

  useEffect(() => {
    function applyPrompt(event) {
      setPrompt(event.detail || "");
      appNotify("Prompt inserted into the editor.");
    }
    window.addEventListener("prism:set-prompt", applyPrompt);
    return () => window.removeEventListener("prism:set-prompt", applyPrompt);
  }, [setPrompt]);

  useEffect(() => {
    return () => window.clearTimeout(queuedNoticeTimer.current);
  }, []);

  function flashQueuedNotice() {
    setQueuedNotice(true);
    window.clearTimeout(queuedNoticeTimer.current);
    queuedNoticeTimer.current = window.setTimeout(() => setQueuedNotice(false), 900);
  }

  async function loadReferenceImages(event) {
    const files = Array.from(event.target.files || []).slice(0, 4);
    try {
      const images = await Promise.all(files.map(readReferenceFile));
      setReferenceImages(images);
      appNotify(String(images.length) + " reference image(s) loaded.");
    } catch (readError) {
      setError(readError.message);
    }
  }

  async function generate() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("先写下你想生成的画面");
      return;
    }
    if (!canAfford) {
      setError(`剩余积分不足：当前 ${availableCredits ?? 0}，本次需要 ${estimatedCreditCost}。`);
      setStatus("error");
      return;
    }
    const clientRequestId = createClientRequestId();
    const createdAt = new Date().toISOString();
    const requestBody = {
      modelId: model.id,
      prompt: trimmedPrompt,
      ratio,
      size,
      quality,
      count,
      referenceImages,
      negativePrompt: negative,
      clientRequestId,
      ...(seed ? { seed: Number(seed) } : {}),
    };
    const pendingTask = {
      id: clientRequestId,
      model_id: model.id,
      prompt: trimmedPrompt,
      parameters: { ratio, size, quality, reference_count: referenceImages.length, negative_prompt: negative || null, seed: seed ? Number(seed) : null, client_request_id: clientRequestId },
      image_count: count,
      status: "processing",
      credit_cost: estimatedCreditCost,
      created_at: createdAt,
      completed_at: null,
      assets: [],
      local: true,
    };
    setStatus("idle");
    setError("");
    onQueued?.(pendingTask);
    flashQueuedNotice();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("登录状态已失效，请重新登录");
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "请求失败 (" + response.status + ")");
      const assets = Array.isArray(payload.assets) ? payload.assets.filter((asset) => asset?.url) : [];
      if (!assets.length) throw new Error("生成任务完成，但没有可显示的图片");
      const completedAt = new Date().toISOString();
      const completedTask = {
        ...pendingTask,
        id: payload.taskId,
        status: "completed",
        credit_cost: payload.creditCost,
        completed_at: completedAt,
        assets,
        local: false,
      };
      onGenerated({ assets, imageUrl: assets[0].url, prompt: trimmedPrompt, model: model.name, ratio, size, quality, taskId: payload.taskId, creditCost: payload.creditCost, creditsRemaining: payload.creditsRemaining, createdAt: new Date(completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }, clientRequestId, completedTask);
      setStatus("idle");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
      onFailed?.(clientRequestId, requestError.message);
    }
  }
  return (
    <aside className="prompt-panel">
      <div className="panel-heading"><div><SlidersHorizontal size={18} /><strong>生成设置</strong></div><div><IconButton label="服务端安全托管" onClick={() => appNotify("Secrets are kept on the server side.")}><ShieldCheck size={19} /></IconButton></div></div>
      <div className="panel-scroll">
        <label className="prompt-box">
          <span>描述你的画面</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：雨后的东京街头，霓虹灯倒映在湿润路面上，电影感构图…" />
          <div className="prompt-tools"><label><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={loadReferenceImages} /><Plus size={17} />{"参考图"}{referenceImages.length > 0 && <b>{referenceImages.length}</b>}</label><span>{prompt.length} / 2000</span></div>
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
        <div className="control-group"><div className="control-title"><span>品质</span><small>预计 {estimatedCreditCost} 积分</small></div><Segmented options={model.qualities} value={quality} onChange={setQuality} /></div>
        <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><SlidersHorizontal size={17} />高级参数</span><CaretDown className={advanced ? "rotate" : ""} size={16} /></button>
        {advanced && <div className="advanced-fields"><label className="field block"><span>排除内容</span><input value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="模糊、文字、水印…" /></label><label className="field block"><span>随机种子</span><input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动" /></label></div>}
        {error && <div className="inline-error"><WarningCircle size={18} /><span>{error}</span></div>}
      </div>
      <div className="generate-footer">
        <button className="generate-button" onClick={generate} disabled={!canAfford}>{queuedNotice ? <><Queue size={18} />{"已加入队列"}</> : <><Sparkle size={18} weight="fill" />{"生成图像"}<span className="credit-pill">{estimatedCreditCost}</span></>}</button>
        <p><ShieldCheck size={13} />OpenRouter 由服务端安全托管</p>
      </div>
    </aside>
  );
}

function Canvas({ result, onClear, onEdit, editTurns = [] }) {
  const [zoom, setZoom] = useState(100);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
  const [editInstruction, setEditInstruction] = useState("");
  const [editError, setEditError] = useState("");
  const assets = result?.assets?.length ? result.assets : result?.imageUrl ? [{ url: result.imageUrl, mimeType: "image" }] : [];
  const selectedAsset = assets[Math.min(selectedAssetIndex, Math.max(assets.length - 1, 0))];
  const editing = editTurns.some((turn) => turn.status === "processing");

  useEffect(() => { setSelectedAssetIndex(0); setEditInstruction(""); setEditError(""); }, [result?.taskId]);

  async function submitEdit() {
    const instruction = editInstruction.trim();
    if (!instruction) {
      setEditError("写下这一轮想修改的内容");
      return;
    }
    if (!selectedAsset?.url) {
      setEditError("当前没有可修改的图像");
      return;
    }
    setEditError("");
    try {
      await onEdit?.({ instruction, sourceResult: result, referenceAsset: selectedAsset });
      setEditInstruction("");
    } catch (error) {
      setEditError(error.message);
    }
  }

  if (!result) {
    return (
      <main className="canvas empty-canvas">
        <div className="canvas-toolbar"><div><button className="tool-active" onClick={() => appNotify("Generated images will appear here.")}><MagnifyingGlass size={18} /></button><button disabled title="Generate an image first"><ArrowCounterClockwise size={18} /></button></div><span>画布会自动适应生成比例</span></div>
        <div className="empty-state"><span className="empty-icon"><ImageIcon size={27} /></span><h1>从一个想法开始</h1><p>描述你脑海中的画面，Prism 会调用最合适的模型将它呈现出来。</p><div className="suggestions"><button onClick={() => window.dispatchEvent(new CustomEvent("prism:set-prompt", { detail: "Commercial product photo of a transparent perfume bottle on wet black stone, side rim light, water droplets, shallow depth of field" }))}>产品摄影</button><button onClick={() => window.dispatchEvent(new CustomEvent("prism:set-prompt", { detail: "Rainy Tokyo street at night, neon reflections on wet pavement, cinematic framing, high contrast lighting" }))}>电影场景</button><button onClick={() => window.dispatchEvent(new CustomEvent("prism:set-prompt", { detail: "Futuristic mechanic character design, short jacket, tool belt, warm expression, clean concept art background" }))}>角色设定</button></div></div>
        <div className="canvas-status"><span>准备就绪</span><span>自动保存</span></div>
      </main>
    );
  }
  return (
    <main className="canvas result-canvas">
      <div className="canvas-toolbar"><div><IconButton label="重新生成" onClick={() => { window.dispatchEvent(new CustomEvent("prism:set-prompt", { detail: result.prompt })); appNotify("Previous prompt restored."); }}><ArrowCounterClockwise size={18} /></IconButton><IconButton label="复制" onClick={() => { navigator.clipboard?.writeText(result.prompt); appNotify("Prompt copied."); }}><Copy size={18} /></IconButton><IconButton label="下载" onClick={() => { const link = document.createElement("a"); link.href = selectedAsset?.url || result.imageUrl; link.download = (result.taskId || "prism-image") + "-" + (selectedAssetIndex + 1) + ".png"; link.target = "_blank"; document.body.appendChild(link); link.click(); link.remove(); appNotify("Image download started."); }}><DownloadSimple size={18} /></IconButton></div><div className="zoom-control"><button onClick={() => setZoom((value) => Math.max(50, value - 10))} disabled={zoom <= 50}>{"−"}</button><span>{zoom}%</span><button onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150}>+</button><button className="close-view" onClick={onClear} title="关闭查看" aria-label="关闭查看"><X size={18} /></button></div></div>
      <div className="image-stage"><img src={selectedAsset?.url} alt={result.prompt} style={{ maxWidth: `${zoom}%`, maxHeight: `${zoom}%` }} /></div>
      <section className="edit-panel">
        <div className="edit-panel-head"><div><strong>{"对话修图"}</strong><span>{"基于当前图继续修改"}</span></div>{editing && <span className="edit-live"><i />{"生成中"}</span>}</div>
        {editTurns.length > 0 && <div className="edit-turns">{editTurns.slice(-4).map((turn, index) => <div key={turn.id} className={"edit-turn " + turn.status}><b>{index + 1}</b><span>{turn.instruction}</span><small>{turn.status === "completed" ? "已完成" : turn.status === "failed" ? turn.error || "失败" : "处理中"}</small></div>)}</div>}
        <textarea value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} placeholder="例如：保留香水瓶体，把背景改成暖色大理石台面" />
        {editError && <div className="edit-error"><WarningCircle size={14} />{editError}</div>}
        <button className="edit-submit" disabled={editing || !editInstruction.trim()} onClick={submitEdit}>{editing ? <span className="spinner" /> : <PaperPlaneTilt size={16} weight="fill" />}{editing ? "正在修改" : "发送修改"}</button>
      </section>
      {assets.length > 1 && <div className="result-thumbnails">{assets.map((asset, index) => <button key={asset.url} className={index === selectedAssetIndex ? "active" : ""} onClick={() => setSelectedAssetIndex(index)} aria-label={`查看第 ${index + 1} 张`}><img src={asset.thumbnailUrl || asset.url} alt="" loading="lazy" decoding="async" /></button>)}</div>}
      <div className="result-meta"><div><span className="status-dot" /><strong>{result.model}</strong><span>{result.ratio}{" · "}{result.size}{" · "}{result.quality}{" · "}{assets.length} {"张"}</span></div><span>{result.createdAt}</span></div>
    </main>
  );
}


function LibraryView({ title, emptyText, icon: Icon, tasks = [], models = [], loading = false, queueOnly = false, onSelect, onRefresh, onDelete }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(queueOnly ? "active" : "all");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const normalized = query.trim().toLowerCase();
  const visibleTasks = tasks.filter((task) => {
    const isActive = task.status === "processing" || task.status === "reserved";
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isActive : task.status === statusFilter);
    const matchesQuery = !normalized || (task.prompt || "").toLowerCase().includes(normalized) || (task.model_id || "").toLowerCase().includes(normalized);
    return matchesStatus && matchesQuery;
  });
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every((task) => selectedIds.has(task.id));
  const statusLabels = { all: "全部状态", active: "队列中", completed: "已完成", failed: "失败" };

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => tasks.some((task) => task.id === id))));
  }, [tasks]);

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleTasks.forEach((task) => next.delete(task.id));
      else visibleTasks.forEach((task) => next.add(task.id));
      return next;
    });
  }

  async function deleteSelected() {
    if (!selectedCount || deleting) return;
    if (!window.confirm("确定删除选中作品吗？这会同时删除存储中的图片文件。")) return;
    const ids = [...selectedIds];
    setDeleting(true);
    try {
      await onDelete?.(ids);
      setSelectedIds(new Set());
      appNotify(String(ids.length) + " item(s) deleted.");
    } catch (error) {
      appNotify(error.message, "error");
    } finally {
      setDeleting(false);
    }
  }

  return <main className="collection-page"><div className="collection-head"><div><p>{"工作空间"}</p><h1>{title}</h1></div><button className="button primary" onClick={() => window.dispatchEvent(new CustomEvent("prism:set-view", { detail: "create" }))}><Plus size={17} />{"新建作品"}</button></div><div className="filter-row"><div className="filter-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></div><button onClick={() => setStatusFilter((value) => value === "all" ? "completed" : value === "completed" ? "failed" : value === "failed" ? "active" : "all")}>{statusLabels[statusFilter]}<CaretDown size={14} /></button><button disabled={!visibleTasks.length} onClick={toggleVisible}>{allVisibleSelected ? "取消全选" : "全选"}</button><button className="danger-action" disabled={!selectedCount || deleting} onClick={deleteSelected}><Trash size={14} />{deleting ? "删除中" : "删除"}{selectedCount > 0 && <b>{selectedCount}</b>}</button><IconButton label="Refresh" onClick={onRefresh}><ClockCounterClockwise size={18} /></IconButton></div>{loading ? <div className="collection-empty"><span className="spinner" /><h2>{"正在读取"}</h2></div> : visibleTasks.length ? <div className="generation-list">{visibleTasks.map((task) => { const result = generationTaskToResult(task, models); const thumb = task.assets?.[0]?.thumbnailUrl || task.assets?.[0]?.url; const model = models.find((item) => item.id === task.model_id); const selected = selectedIds.has(task.id); return <article key={task.id} className={"generation-card " + (selected ? "selected" : "")}><button type="button" className="select-check" onClick={() => toggleSelected(task.id)} aria-label={selected ? "取消选择" : "选择作品"}>{selected && <Check size={13} weight="bold" />}</button><button type="button" className="generation-open" onClick={() => thumb && onSelect?.(result)} disabled={!thumb}><span className="generation-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" /> : <Icon size={22} />}</span><div><strong>{task.prompt}</strong><span>{model?.name || task.model_id}</span><small>{task.created_at ? new Date(task.created_at).toLocaleString("zh-CN") : "-"}</small></div><b className={"task-status " + task.status}>{task.status === "completed" ? "成功" : task.status === "failed" ? "失败" : task.status === "processing" ? "处理中" : "排队中"}</b></button></article>; })}</div> : <div className="collection-empty"><span><Icon size={28} /></span><h2>{"这里还没有内容"}</h2><p>{emptyText}</p><button className="button ghost" onClick={() => window.dispatchEvent(new CustomEvent("prism:set-view", { detail: "create" }))}><Plus size={17} />{"开始创作"}</button></div>}</main>;
}

function CreatorApp({ models, profile, onCreditsChanged }) {
  const [view, setView] = useState("create");
  const [collapsed, setCollapsed] = useState(false);
  const [result, setResult] = useState(null);
  const [editTurns, setEditTurns] = useState([]);
  const [generationTasks, setGenerationTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  function isClientTaskId(id) {
    return String(id).startsWith("client-");
  }

  async function deleteTasks(ids) {
    const remoteIds = ids.filter((id) => !isClientTaskId(id));
    await Promise.all(remoteIds.map((id) => fetchWithAuth(`/api/generations/${encodeURIComponent(id)}`, { method: "DELETE" })));
    setGenerationTasks((items) => items.filter((task) => !ids.includes(task.id)));
    setResult((current) => current && ids.includes(current.taskId) ? null : current);
    setEditTurns((turns) => turns.filter((turn) => !ids.includes(turn.taskId)));
  }

  async function loadTasks() {
    setTasksLoading(true);
    try {
      const payload = await fetchWithAuth("/api/generations");
      const remoteTasks = payload.tasks || [];
      const remoteClientIds = new Set(remoteTasks.map((task) => task.parameters?.client_request_id).filter(Boolean));
      setGenerationTasks((current) => [
        ...current.filter((task) => isClientTaskId(task.id) && !remoteClientIds.has(task.id)),
        ...remoteTasks,
      ]);
    } catch (error) {
      appNotify(error.message, "error");
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => { loadTasks(); }, []);
  useEffect(() => {
    function switchView(event) { setView(event.detail || "create"); }
    window.addEventListener("prism:set-view", switchView);
    return () => window.removeEventListener("prism:set-view", switchView);
  }, []);

  const queueCount = generationTasks.filter((task) => task.status === "processing" || task.status === "reserved").length;
  const selectTask = (taskResult) => { setResult(taskResult); setEditTurns([]); setView("create"); };
  const queued = (task) => {
    setGenerationTasks((items) => [task, ...items.filter((item) => item.id !== task.id)]);
    appNotify("已加入生成队列");
  };
  const generated = (nextResult, clientRequestId, completedTask) => {
    setResult(nextResult);
    setEditTurns([]);
    if (Number.isFinite(Number(nextResult.creditsRemaining))) onCreditsChanged?.(Number(nextResult.creditsRemaining));
    setGenerationTasks((items) => [completedTask, ...items.filter((item) => item.id !== clientRequestId && item.id !== completedTask.id)]);
    loadTasks();
  };
  const failed = (clientRequestId, errorMessage) => {
    setGenerationTasks((items) => items.map((task) => task.id === clientRequestId ? { ...task, status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() } : task));
  };

  async function submitImageEdit({ instruction, sourceResult, referenceAsset }) {
    const model = models.find((item) => item.id === sourceResult?.modelId) || models.find((item) => item.name === sourceResult?.model) || models.find((item) => item.enabled) || models[0];
    if (!model) throw new Error("No available model for image editing");

    const clientRequestId = createClientRequestId();
    const createdAt = new Date().toISOString();
    const ratio = sourceResult?.ratio && sourceResult.ratio !== "-" ? sourceResult.ratio : model.ratios[0];
    const size = sourceResult?.size && sourceResult.size !== "-" ? sourceResult.size : model.sizes[0];
    const quality = sourceResult?.quality && sourceResult.quality !== "-" ? sourceResult.quality : model.qualities[0];
    const prompt = buildEditPrompt(sourceResult, editTurns, instruction);
    const creditCost = calculateCreditCost(model, quality, 1);
    if ((profile?.credits ?? null) != null && profile.credits < creditCost) throw new Error(`剩余积分不足：当前 ${profile.credits}，本次需要 ${creditCost}。`);
    const pendingTask = {
      id: clientRequestId,
      model_id: model.id,
      prompt,
      parameters: { ratio, size, quality, reference_count: 1, edit_source_task_id: sourceResult?.taskId || null, edit_instruction: instruction, client_request_id: clientRequestId },
      image_count: 1,
      status: "processing",
      credit_cost: creditCost,
      created_at: createdAt,
      completed_at: null,
      assets: [],
      local: true,
    };
    queued(pendingTask);
    setEditTurns((turns) => [...turns, { id: clientRequestId, instruction, status: "processing", createdAt }]);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("登录状态已失效，请重新登录");
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ modelId: model.id, prompt, ratio, size, quality, count: 1, referenceImages: [referenceAsset.url], negativePrompt: "", clientRequestId, editSourceTaskId: sourceResult?.taskId, editInstruction: instruction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Request failed (" + response.status + ")");
      const assets = Array.isArray(payload.assets) ? payload.assets.filter((asset) => asset?.url) : [];
      if (!assets.length) throw new Error("修图任务完成，但没有可显示的图片");
      const completedAt = new Date().toISOString();
      const completedTask = { ...pendingTask, id: payload.taskId, status: "completed", credit_cost: payload.creditCost, completed_at: completedAt, assets, local: false };
      const nextResult = { assets, imageUrl: assets[0].url, prompt, model: model.name, modelId: model.id, ratio, size, quality, taskId: payload.taskId, creditCost: payload.creditCost, creditsRemaining: payload.creditsRemaining, createdAt: new Date(completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) };
      if (Number.isFinite(Number(payload.creditsRemaining))) onCreditsChanged?.(Number(payload.creditsRemaining));
      setResult(nextResult);
      setGenerationTasks((items) => [completedTask, ...items.filter((item) => item.id !== clientRequestId && item.id !== completedTask.id)]);
      setEditTurns((turns) => turns.map((turn) => turn.id === clientRequestId ? { ...turn, status: "completed", taskId: payload.taskId } : turn));
      loadTasks();
    } catch (error) {
      failed(clientRequestId, error.message);
      setEditTurns((turns) => turns.map((turn) => turn.id === clientRequestId ? { ...turn, status: "failed", error: error.message } : turn));
      throw error;
    }
  }

  return (
    <div className="creator-layout">
      <CreatorSidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} queueCount={queueCount} />
      {view === "create" && <><Canvas result={result} onClear={() => { setResult(null); setEditTurns([]); }} onEdit={submitImageEdit} editTurns={editTurns} /><PromptPanel models={models} availableCredits={profile?.credits ?? null} onQueued={queued} onGenerated={generated} onFailed={failed} /></>}
      {view === "library" && <LibraryView title="作品库" emptyText="生成的图像会自动保存到这里。" icon={ImageIcon} tasks={generationTasks} models={models} loading={tasksLoading} onSelect={selectTask} onRefresh={loadTasks} onDelete={deleteTasks} />}
      {view === "queue" && <LibraryView title="生成队列" emptyText="没有排队中的生成任务。" icon={Queue} tasks={generationTasks} models={models} loading={tasksLoading} queueOnly onSelect={selectTask} onRefresh={loadTasks} onDelete={deleteTasks} />}
    </div>
  );
}


function StatCard({ label, value, delta, icon: Icon }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div></div>;
}

function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOverview() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchWithAuth("/api/admin/overview"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOverview(); }, []);

  const stats = data?.stats || {};
  const statCards = [
    { label: "今日生成", value: formatInteger(stats.generatedToday), delta: trendLabel(stats.generatedTrend), icon: Sparkle },
    { label: "活跃用户", value: formatInteger(stats.activeUsers), delta: "共 " + formatInteger(stats.totalUsers) + " 个账户", icon: Users },
    { label: "API 成功率", value: (Number(stats.successRate) || 0).toFixed(1) + "%", delta: "基于已完成任务", icon: ChartBar },
    { label: "今日成本", value: formatMoney(stats.spendToday), delta: "OpenRouter usage", icon: Coins },
  ];
  const chart = data?.chart || [];
  const maxCount = Math.max(1, ...chart.map((item) => item.count));
  const serviceCopy = {
    openrouter: { name: "OpenRouter API", detail: (service) => service.detail === "configured" ? "密钥已配置" : "缺少密钥" },
    queue: { name: "任务队列", detail: (service) => service.detail + " 个任务处理中" },
    database: { name: "Supabase", detail: (service) => service.detail + " 个账户" },
  };
  return (
    <div className="admin-page">
      <div className="page-title"><div><p>{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p><h1>{"运营总览"}</h1><span>{"来自 Supabase 与生成任务表的实时数据。"}</span></div><button className="button ghost" onClick={() => exportCsv("overview.csv", ["Metric", "Value"], statCards.map((item) => [item.label, item.value]))}><DownloadSimple size={17} />{"导出报告"}</button></div>
      {error && <div className="config-note"><WarningCircle size={18} /><div><strong>{"无法加载总览"}</strong><p>{error}</p></div></div>}
      {loading ? <div className="table-loading"><span className="spinner" />{"正在读取数据"}</div> : <>
      <div className="stats-grid">{statCards.map((card) => <StatCard key={card.label} {...card} />)}</div>
      <div className="admin-grid">
        <section className="admin-card usage-chart"><div className="card-heading"><div><h3>{"生成趋势"}</h3><p>{"过去 7 天的请求量"}</p></div><button onClick={loadOverview}>{"刷新"}<ClockCounterClockwise size={14} /></button></div><div className="chart-area"><div className="chart-y"><span>{formatInteger(maxCount)}</span><span>{formatInteger(Math.round(maxCount / 2))}</span><span>0</span></div><div className="bars">{chart.map((item) => <div key={item.date}><span style={{ height: Math.max(4, Math.round((item.count / maxCount) * 100)) + "%" }} /><small>{new Date(item.date + "T00:00:00").toLocaleDateString("zh-CN", { weekday: "short" })}</small></div>)}</div></div></section>
        <section className="admin-card"><div className="card-heading"><div><h3>{"模型用量"}</h3><p>{"今日请求分布"}</p></div><DotsThree size={20} /></div><div className="model-usage">{(data?.modelUsage || []).length ? data.modelUsage.map((item, index) => <div key={item.modelId}><span><i className={"usage-color " + (["purple", "blue", "gray"][index % 3])} />{item.name}</span><strong>{item.percent}%</strong></div>) : <div><span>{"今日还没有请求"}</span><strong>0%</strong></div>}</div></section>
      </div>
      <section className="admin-card"><div className="card-heading"><div><h3>{"系统状态"}</h3><p>{"关键服务与供应商健康度"}</p></div><span className="healthy"><i />{(data?.services || []).every((service) => service.ok) ? "全部正常" : "需要检查"}</span></div><div className="service-list">{(data?.services || []).map((service) => { const copy = serviceCopy[service.id]; return <div key={service.id}><span className="service-icon">{service.id === "queue" ? <Queue size={18} /> : service.id === "database" ? <ShieldCheck size={18} /> : <Code size={18} />}</span><div><strong>{copy?.name || service.id}</strong><span>{copy?.detail?.(service) || service.detail}</span></div><b>{service.ok ? "正常" : "异常"}</b></div>; })}</div></section>
      </>}
    </div>
  );
}

function ModelCenter({ models, setModels, onRefresh }) {
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelError, setModelError] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const providers = ["all", ...Array.from(new Set(models.map((model) => model.provider)))];
  const visible = models.filter((model) => {
    const matchesQuery = `${model.name}${model.provider}${model.id}`.toLowerCase().includes(query.toLowerCase());
    const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "enabled" ? model.enabled : !model.enabled);
    return matchesQuery && matchesProvider && matchesStatus;
  });
  const cycleProvider = () => setProviderFilter((value) => providers[(providers.indexOf(value) + 1) % providers.length]);
  const cycleStatus = () => setStatusFilter((value) => value === "all" ? "enabled" : value === "enabled" ? "disabled" : "all");

  async function refreshModels() {
    setRefreshing(true);
    setModelError("");
    try {
      await onRefresh?.();
      appNotify("模型列表已刷新");
    } catch (requestError) {
      setModelError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function toggle(model) {
    const enabled = !model.enabled;
    const previous = models;
    setModelError("");
    setTogglingId(model.id);
    setModels((items) => items.map((item) => item.id === model.id ? { ...item, enabled } : item));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
        body: JSON.stringify({ id: model.id, enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "更新模型失败");
      if (payload.model) {
        setModels((items) => items.map((item) => item.id === payload.model.id ? { ...payload.model, cost: payload.model.credit_cost } : item));
      }
    } catch (requestError) {
      setModels(previous);
      setModelError(requestError.message);
    } finally {
      setTogglingId("");
    }
  }

  return (
    <div className="admin-page">
      <div className="page-title"><div><p>平台配置</p><h1>模型中心</h1><span>配置可用模型、能力参数与积分成本。</span></div><button className="button ghost" onClick={refreshModels} disabled={refreshing}>{refreshing ? <span className="spinner dark" /> : <ClockCounterClockwise size={17} />}刷新模型</button></div>
      <div className="table-toolbar"><label><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" /></label><button onClick={cycleProvider}>{providerFilter === "all" ? "全部供应商" : providerFilter}<CaretDown size={14} /></button><button onClick={cycleStatus}>{statusFilter === "all" ? "全部状态" : statusFilter === "enabled" ? "已启用" : "已停用"}<CaretDown size={14} /></button></div>
      {modelError && <div className="config-note"><WarningCircle size={18} /><div><strong>无法更新模型</strong><p>{modelError}</p></div></div>}
      <section className="table-card"><table><thead><tr><th>模型</th><th>能力</th><th>支持分辨率</th><th>积分/张</th><th>状态</th></tr></thead><tbody>{visible.map((model) => <tr key={model.id}><td><div className="model-cell"><span className={`provider-logo ${model.provider.toLowerCase().replaceAll(" ", "-")}`}>{model.provider[0]}</span><div><strong>{model.name}</strong><span>{model.id}</span></div></div></td><td><span className="table-tag">文生图</span><span className="table-tag">{model.badge}</span></td><td>{model.sizes.join(" / ")}</td><td><strong>{model.cost}</strong></td><td><button className={`toggle ${model.enabled ? "on" : ""}`} disabled={togglingId === model.id} onClick={() => toggle(model)}><span /></button></td></tr>)}</tbody></table></section>
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

const DATA_PAGE_COPY = {
  billing: { title: "额度与计费", sub: "根据真实账户套餐与剩余积分汇总。" },
  logs: { title: "请求日志", sub: "来自生成任务表的最近请求。" },
};

function DataPage({ type }) {
  const copy = DATA_PAGE_COPY[type] || DATA_PAGE_COPY.logs;
  const [data, setData] = useState({ headers: [], rows: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchWithAuth("/api/admin/data/" + type));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [type]);
  const normalized = query.trim().toLowerCase();
  const rows = (data.rows || []).filter((row) => !normalized || row.cells.some((cell) => String(cell).toLowerCase().includes(normalized)));
  return <div className="admin-page"><div className="page-title"><div><p>{"平台管理"}</p><h1>{copy.title}</h1><span>{copy.sub}</span></div><button className="button ghost" onClick={loadData}><ClockCounterClockwise size={17} />{"刷新"}</button></div><div className="table-toolbar"><label><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label><button onClick={() => exportCsv(type + ".csv", data.headers || [], rows.map((row) => row.cells))}>{"导出"}<DownloadSimple size={14} /></button></div>{error && <div className="config-note"><WarningCircle size={18} /><div><strong>{"无法加载数据"}</strong><p>{error}</p></div></div>}<section className="table-card"><table><thead><tr>{(data.headers || []).map((item) => <th key={item}>{item}</th>)}<th /></tr></thead><tbody>{loading && <tr><td colSpan={(data.headers?.length || 1) + 1}><div className="table-loading"><span className="spinner" />{"正在读取数据"}</div></td></tr>}{!loading && rows.length === 0 && <tr><td colSpan={(data.headers?.length || 1) + 1}><div className="table-loading">{"没有匹配的数据"}</div></td></tr>}{!loading && rows.map((row) => <tr key={row.id}>{row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}{cellIndex === row.cells.length - 1 && <span className={"row-status " + (row.tone === "bad" ? "bad" : row.tone === "warn" ? "warn" : "")} />}</td>)}<td><IconButton label="Copy row" onClick={() => { navigator.clipboard?.writeText(row.cells.join("\t")); appNotify("Row copied."); }}><DotsThree size={20} /></IconButton></td></tr>)}</tbody></table></section></div>;
}

function AdminApp({ models, setModels, onRefreshModels }) {
  const [page, setPage] = useState("overview");
  const envName = import.meta.env.MODE || "app";
  return <div className="admin-layout"><aside className="admin-sidebar"><div className="admin-nav-title">{"管理后台"}</div><nav>{ADMIN_NAV.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={19} /><span>{label}</span></button>)}</nav><div className="admin-sidebar-bottom"><div className="environment"><i /><div><strong>{envName}</strong><span>{"会话已连接"}</span></div></div><button onClick={() => setPage("api")}><GearSix size={19} />{"系统设置"}</button></div></aside><main className="admin-content">{page === "overview" && <Overview />}{page === "users" && <UserManagement />}{page === "models" && <ModelCenter models={models} setModels={setModels} onRefresh={onRefreshModels} />}{page === "api" && <ApiSettings />}{["billing", "logs"].includes(page) && <DataPage type={page} />}</main></div>;
}

export function App() {
  const [mode, setMode] = useState("creator");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [models, setModels] = useState(() => readStorage("prism_models", DEFAULT_MODELS));
  const [toast, setToast] = useState(null);

  async function loadModels() {
    if (!session?.user?.id || !supabase) return;
    const query = supabase.from("ai_models").select("id,name,provider,badge,enabled,ratios,sizes,qualities,credit_cost").order("credit_cost");
    if (profile?.role !== "admin") query.eq("enabled", true);
    const { data, error } = await query;
    if (error) throw error;
    if (data?.length) setModels(data.map((item) => ({ ...item, cost: item.credit_cost })));
  }

  useEffect(() => {
    loadModels().catch((error) => appNotify(error.message, "error"));
  }, [session?.user?.id, profile?.role]);

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
          credits: 0,
          status: "active",
        });
        setProfileLoading(false);
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => { localStorage.setItem("prism_models", JSON.stringify(models)); }, [models]);
  useEffect(() => {
    function showToast(event) {
      setToast({ ...(event.detail || {}), id: Date.now() });
    }
    window.addEventListener("prism:notify", showToast);
    return () => window.removeEventListener("prism:notify", showToast);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (authLoading) return <div className="app-loading"><span className="brand-mark"><Sparkle size={16} weight="fill" /></span><i className="spinner" />正在恢复安全会话</div>;
  if (!isSupabaseConfigured || !session || recoveryMode) return <AuthScreen recoveryMode={recoveryMode} onRecoveryComplete={() => setRecoveryMode(false)} />;
  if (profileLoading || !profile) return <div className="app-loading"><span className="brand-mark"><Sparkle size={16} weight="fill" /></span><i className="spinner" />正在加载账户资料</div>;
  if (profile.status === "suspended") return <div className="account-blocked"><WarningCircle size={28} /><h1>账户已暂停</h1><p>请联系管理员恢复账户后再继续使用 Prism。</p><button className="button ghost" onClick={() => supabase.auth.signOut()}>退出登录</button></div>;

  const role = profile.role;
  const isAdmin = mode === "admin";
  return (
    <div className="app-shell">
      <Header isAdmin={isAdmin} role={role} profile={profile} user={session.user} onProfileUpdated={setProfile} onSignOut={() => supabase.auth.signOut()} onAdmin={() => { if (role === "admin") setMode("admin"); }} onCreator={() => setMode("creator")} />
      {isAdmin ? <AdminApp models={models} setModels={setModels} onRefreshModels={loadModels} /> : <CreatorApp models={models} profile={profile} onCreditsChanged={(credits) => setProfile((current) => current ? { ...current, credits } : current)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
