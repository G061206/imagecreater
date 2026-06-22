import { useEffect, useState } from "react";
import { CheckCircle, LockKey, User, WarningCircle, X } from "@phosphor-icons/react";
import { supabase } from "./lib/supabase.js";

export function AccountSettings({ open, onClose, profile, user, onProfileUpdated }) {
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(profile?.full_name || "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => { setName(profile?.full_name || ""); }, [profile?.full_name]);
  if (!open) return null;

  function resetFeedback() {
    setStatus("idle");
    setMessage("");
  }

  async function saveProfile(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), avatar_url: profile?.avatar_url || null })
      .eq("id", user.id)
      .select("id,email,full_name,avatar_url,role,plan,credits,status")
      .single();
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("success");
    setMessage("个人资料已保存。");
    if (data) onProfileUpdated?.(data);
  }

  async function updatePassword(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setPassword("");
    setStatus("success");
    setMessage("密码已更新。");
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="account-settings-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-settings-head"><div><h2>账户设置</h2><p>管理个人资料与登录安全</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></div>
        <div className="account-settings-layout">
          <nav><button className={tab === "profile" ? "active" : ""} onClick={() => { setTab("profile"); resetFeedback(); }}><User size={17} />个人资料</button><button className={tab === "security" ? "active" : ""} onClick={() => { setTab("security"); resetFeedback(); }}><LockKey size={17} />登录安全</button></nav>
          <div className="account-settings-body">
            {tab === "profile" ? <form onSubmit={saveProfile}><h3>个人资料</h3><p>这些信息会显示在工作空间和管理后台。</p><label><span>显示名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label><span>邮箱地址</span><input value={user?.email || ""} disabled /><small>修改邮箱需要完成双重邮件验证。</small></label><div className="account-plan"><div><span>当前套餐</span><strong>{profile?.plan?.toUpperCase()}</strong></div><div><span>剩余积分</span><strong>{profile?.credits}</strong></div></div>{message && <Feedback status={status} message={message} />}<button className="button primary" disabled={status === "loading"}>保存资料</button></form> : <form onSubmit={updatePassword}><h3>更新密码</h3><p>密码至少需要 8 位字符，更新后当前会话继续有效。</p><label><span>新密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" autoComplete="new-password" required /></label>{message && <Feedback status={status} message={message} />}<button className="button primary" disabled={status === "loading"}>更新密码</button></form>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Feedback({ status, message }) {
  return <div className={`auth-message ${status}`}>{status === "success" ? <CheckCircle size={17} /> : <WarningCircle size={17} />}<span>{message}</span></div>;
}

