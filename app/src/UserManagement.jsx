import { useEffect, useMemo, useState } from "react";
import { CaretDown, MagnifyingGlass, Users, WarningCircle } from "@phosphor-icons/react";
import { supabase } from "./lib/supabase.js";

export function UserManagement() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    const { data, error: requestError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,plan,credits,status,created_at")
      .order("created_at", { ascending: false });
    if (requestError) setError(requestError.message);
    setUsers(data || []);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((item) => {
      const matchesQuery = !normalized || `${item.full_name || ""}${item.email}`.toLowerCase().includes(normalized);
      const matchesRole = roleFilter === "all" || item.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, users]);

  async function updateUser(id, changes) {
    const previous = users;
    setUsers((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
      body: JSON.stringify(changes),
    });
    const payload = await response.json();
    const requestError = response.ok ? null : new Error(payload?.error || "更新用户失败");
    if (requestError) {
      setUsers(previous);
      setError(requestError.message);
    }
  }

  return (
    <div className="admin-page">
      <div className="page-title"><div><p>平台管理</p><h1>用户管理</h1><span>来自 Supabase Auth 与 PostgreSQL 的真实账户资料。</span></div><button className="button ghost" onClick={loadUsers}>刷新列表</button></div>
      <div className="table-toolbar"><label><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱或名称" /></label><button onClick={() => setRoleFilter((value) => value === "all" ? "admin" : value === "admin" ? "user" : "all")}>{roleFilter === "all" ? "\u5168\u90e8\u89d2\u8272" : roleFilter === "admin" ? "\u7ba1\u7406\u5458" : "\u666e\u901a\u7528\u6237"}<CaretDown size={14} /></button></div>
      {error && <div className="config-note"><WarningCircle size={18} /><div><strong>无法加载用户</strong><p>{error}</p></div></div>}
      <section className="table-card"><table><thead><tr><th>用户</th><th>角色</th><th>套餐</th><th>剩余额度</th><th>状态</th></tr></thead><tbody>
        {loading && <tr><td colSpan="5"><div className="table-loading"><span className="spinner" />正在读取账户</div></td></tr>}
        {!loading && visibleUsers.length === 0 && <tr><td colSpan="5"><div className="table-loading"><Users size={18} />没有匹配的账户</div></td></tr>}
        {!loading && visibleUsers.map((item) => <tr key={item.id}>
          <td><div className="model-cell"><span className="provider-logo">{(item.full_name || item.email || "U")[0].toUpperCase()}</span><div><strong>{item.full_name || "未命名用户"}</strong><span>{item.email}</span></div></div></td>
          <td><select className="inline-select" value={item.role} onChange={(event) => updateUser(item.id, { role: event.target.value })}><option value="user">普通用户</option><option value="admin">管理员</option></select></td>
          <td><select className="inline-select" value={item.plan} onChange={(event) => updateUser(item.id, { plan: event.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="studio">Studio</option></select></td>
          <td><input className="credits-input" type="number" min="0" value={item.credits} onChange={(event) => setUsers((items) => items.map((user) => user.id === item.id ? { ...user, credits: Number(event.target.value) } : user))} onBlur={(event) => updateUser(item.id, { credits: Number(event.target.value) })} /></td>
          <td><button className={`status-button ${item.status}`} onClick={() => updateUser(item.id, { status: item.status === "active" ? "suspended" : "active" })}><i />{item.status === "active" ? "正常" : "已暂停"}</button></td>
        </tr>)}
      </tbody></table></section>
      <div className="config-note"><WarningCircle size={18} /><div><strong>认证账户与资料分离</strong><p>这里管理应用角色、套餐和额度。删除账户、封禁登录等高权限操作应通过服务端使用 Supabase Admin API 完成。</p></div></div>
    </div>
  );
}

