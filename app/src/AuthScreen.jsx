import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Key,
  LockKey,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const COPY = {
  signin: { title: "欢迎回来", subtitle: "登录 Prism，继续你的视觉创作。", submit: "登录" },
  signup: { title: "创建账户", subtitle: "使用邮箱注册，立即获得 100 免费积分。", submit: "注册" },
  forgot: { title: "重置密码", subtitle: "我们会向你的邮箱发送安全重置链接。", submit: "发送重置邮件" },
  recovery: { title: "设置新密码", subtitle: "输入一个新的安全密码以恢复账户。", submit: "更新密码" },
};

export function AuthScreen({ recoveryMode = false, onRecoveryComplete }) {
  const [mode, setMode] = useState(recoveryMode ? "recovery" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const currentMode = recoveryMode ? "recovery" : mode;
  const copy = COPY[currentMode];

  async function submit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    setStatus("loading");
    setMessage("");

    let result;
    if (currentMode === "signin") {
      result = await supabase.auth.signInWithPassword({ email, password });
    } else if (currentMode === "signup") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
    } else if (currentMode === "forgot") {
      result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
    } else {
      result = await supabase.auth.updateUser({ password });
    }

    if (result.error) {
      setStatus("error");
      setMessage(result.error.message);
      return;
    }

    setStatus("success");
    if (currentMode === "signup") setMessage("注册成功，请前往邮箱完成验证。");
    if (currentMode === "forgot") setMessage("重置邮件已发送，请检查收件箱。");
    if (currentMode === "recovery") {
      setMessage("密码已更新，正在进入工作台。");
      window.setTimeout(() => onRecoveryComplete?.(), 900);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStatus("idle");
    setMessage("");
    setPassword("");
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-brand"><span><Sparkle size={17} weight="fill" /></span>Prism</div>
        <div className="auth-copy">
          <p>AI IMAGE WORKSPACE</p>
          <h1>把想法变成<br />可以看见的画面。</h1>
          <span>统一管理模型、提示词、生成任务与团队资产。</span>
        </div>
        <div className="auth-proof"><div><strong>Auth</strong><span>Supabase</span></div><div><strong>API</strong><span>Server-side</span></div><div><strong>DB</strong><span>PostgreSQL</span></div></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          {!isSupabaseConfigured ? (
            <div className="auth-setup">
              <span><Key size={24} /></span>
              <h2>等待连接 Supabase</h2>
              <p>账户模块已经安装。配置项目 URL 与匿名密钥后即可启用真实注册登录。</p>
              <code>VITE_SUPABASE_URL<br />VITE_SUPABASE_ANON_KEY</code>
              <small>变量模板位于项目根目录的 <b>.env.example</b></small>
            </div>
          ) : (
            <>
              {currentMode === "forgot" && <button className="auth-back" onClick={() => switchMode("signin")}><ArrowLeft size={16} />返回登录</button>}
              <div className="auth-heading"><span className="auth-symbol"><LockKey size={20} /></span><h2>{copy.title}</h2><p>{copy.subtitle}</p></div>
              <form onSubmit={submit}>
                {currentMode === "signup" && <label><span>显示名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="你的名字" required /></label>}
                {currentMode !== "recovery" && <label><span>邮箱地址</span><div className="auth-input"><EnvelopeSimple size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required /></div></label>}
                {currentMode !== "forgot" && <label><span>{currentMode === "recovery" ? "新密码" : "密码"}</span><div className="auth-input"><LockKey size={18} /><input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位字符" minLength={8} autoComplete={currentMode === "signin" ? "current-password" : "new-password"} required /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></label>}
                {currentMode === "signin" && <button type="button" className="forgot-link" onClick={() => switchMode("forgot")}>忘记密码？</button>}
                {message && <div className={`auth-message ${status}`} >{status === "success" ? <CheckCircle size={17} /> : <WarningCircle size={17} />}<span>{message}</span></div>}
                <button className="auth-submit" disabled={status === "loading"}>{status === "loading" ? <><i className="spinner" />处理中</> : copy.submit}</button>
              </form>
              {!recoveryMode && currentMode !== "forgot" && <p className="auth-switch">{currentMode === "signin" ? "还没有账户？" : "已经注册？"}<button onClick={() => switchMode(currentMode === "signin" ? "signup" : "signin")}>{currentMode === "signin" ? "创建账户" : "登录"}</button></p>}
              <p className="auth-legal">继续即表示你同意服务条款与隐私政策。</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

