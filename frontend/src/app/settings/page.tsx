"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api, authFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/authHeaders";
import type { Topic } from "@/lib/types";

interface TopicFormData {
  name: string;
  description: string;
  keywords: string;
  source_queries: Record<string, string>;
}

const EMPTY_FORM: TopicFormData = {
  name: "",
  description: "",
  keywords: "",
  source_queries: { pubmed: "", arxiv: "", semantic_scholar: "", ieee: "", biorxiv: "" },
};

export default function SettingsPage() {
  const { data: topics } = useSWR<Topic[]>("/api/v1/topics", authFetcher);
  const { user, isAdmin } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TopicFormData>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = (topic: Topic) => {
    setEditingId(topic.id);
    setForm({
      name: topic.name,
      description: topic.description || "",
      keywords: topic.keywords.join(", "),
      source_queries: { ...EMPTY_FORM.source_queries, ...topic.source_queries },
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      source_queries: Object.fromEntries(
        Object.entries(form.source_queries).filter(([_, v]) => v.trim())
      ),
    };

    try {
      if (editingId) {
        await api.updateTopic(editingId, payload);
      } else {
        await api.createTopic(payload);
      }
      await mutate("/api/v1/topics");
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e) {
      console.error("Save failed:", e);
    }
    setSaving(false);
  };

  const deleteTopic = async (id: number) => {
    if (!confirm("Delete this topic?")) return;
    await api.deleteTopic(id);
    await mutate("/api/v1/topics");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Manage topics, API keys, and system configuration
          </p>
        </div>
      </div>

      {/* API Costs & Billing */}
      {isAdmin && <ApiCostsSection />}

      {/* PDF Author Signature */}
      {isAdmin && <PdfSignatureSection />}

      {/* Scheduled Jobs — admin only */}
      {isAdmin && <ScheduledJobsSection />}

      {/* Topics Management — admin only */}
      {isAdmin && (<div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Research Topics</h3>
          <button
            onClick={startNew}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
          >
            + Add Topic
          </button>
        </div>

        <div className="space-y-3">
          {(topics || []).map((topic: Topic) => (
            <div
              key={topic.id}
              className="flex items-start justify-between p-3 rounded-lg bg-[var(--secondary)]"
            >
              <div className="flex-1">
                <h4 className="font-medium text-sm">{topic.name}</h4>
                {topic.description && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{topic.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {topic.keywords.slice(0, 5).map((kw) => (
                    <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                      {kw}
                    </span>
                  ))}
                  {topic.keywords.length > 5 && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">+{topic.keywords.length - 5}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 ml-3">
                <button onClick={() => startEdit(topic)} className="text-xs px-2 py-1 rounded hover:bg-[var(--muted)] transition-colors">
                  Edit
                </button>
                <button onClick={() => deleteTopic(topic.id)} className="text-xs px-2 py-1 rounded hover:bg-red-500/20 text-red-400 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>)}

      {/* Topic Form Modal */}
      {isAdmin && showForm && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--primary)]/30 p-6">
          <h3 className="font-medium mb-4">{editingId ? "Edit Topic" : "New Topic"}</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                placeholder="e.g., Federated Learning"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] h-20 resize-none"
                placeholder="Brief description of this research topic"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Keywords (comma-separated)</label>
              <input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                placeholder="federated learning, FedAvg, differential privacy"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-2">Source Queries</label>
              <div className="space-y-2">
                {["pubmed", "arxiv", "semantic_scholar", "ieee", "biorxiv"].map((src) => (
                  <div key={src} className="flex items-center gap-2">
                    <span className="text-xs w-28 text-[var(--muted-foreground)]">{src}:</span>
                    <input
                      value={form.source_queries[src] || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          source_queries: { ...form.source_queries, [src]: e.target.value },
                        })
                      }
                      className="flex-1 px-2 py-1.5 rounded bg-[var(--muted)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)] font-mono"
                      placeholder={`Search query for ${src}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-[var(--secondary)] text-sm hover:bg-[var(--border)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Management (Admin Only) */}
      {isAdmin && <UserManagement />}

      {/* Change Password */}
      <ChangePasswordSection />

      {/* API Keys Info — admin only */}
      {isAdmin && <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="font-medium mb-4">API Keys</h3>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Configure in <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs">.env</code> file.
        </p>
        <div className="space-y-2 text-sm">
          {[
            { name: "NCBI / PubMed", env: "NCBI_API_KEY", note: "Optional — higher rate limits" },
            { name: "Semantic Scholar", env: "SEMANTIC_SCHOLAR_API_KEY", note: "Optional — higher rate limits" },
            { name: "IEEE Xplore", env: "IEEE_API_KEY", note: "Required for IEEE search" },
            { name: "Zotero", env: "ZOTERO_API_KEY", note: "Optional — collection sync" },
          ].map((key) => (
            <div key={key.env} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50">
              <div>
                <span className="font-medium">{key.name}</span>
                <code className="ml-2 text-xs text-[var(--muted-foreground)]">{key.env}</code>
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">{key.note}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* Login Log — admin only */}
      {isAdmin && <LoginLogSection />}

      {/* System Info */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="font-medium mb-4">System</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Version</dt>
            <dd>2.26</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Sources</dt>
            <dd>PubMed, Semantic Scholar, arXiv, bioRxiv/medRxiv, IEEE</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Schedule</dt>
            <dd>Daily at 06:00 UTC (GitHub Actions)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Conda Env</dt>
            <dd className="font-mono text-xs">fl-research-monitor</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}


// --- User Management (admin only) ---

interface UserData {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

function UserManagement() {
  const { data: users, mutate: mutateUsers } = useSWR<UserData[]>("/api/v1/auth/users", authFetcher);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "viewer" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetting, setResetting] = useState(false);

  const createUser = async () => {
    setSaving(true);
    setError("");
    try {
      await api.createUser(newUser);
      await mutateUsers();
      setShowNewUser(false);
      setNewUser({ username: "", email: "", password: "", role: "viewer" });
    } catch (e: any) {
      setError(e.message || "Failed to create user");
    }
    setSaving(false);
  };

  const toggleActive = async (u: UserData) => {
    await api.updateUser(u.id, { is_active: !u.is_active });
    await mutateUsers();
  };

  const changeRole = async (u: UserData, role: string) => {
    await api.updateUser(u.id, { role });
    await mutateUsers();
  };

  const submitResetPassword = async () => {
    if (!resetUserId || !isPasswordValid(resetPwd)) return;
    setResetting(true);
    try {
      const r = await fetch(`/api/v1/auth/users/${resetUserId}/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ new_password: resetPwd }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      setActionMsg(prev => ({ ...prev, [resetUserId]: "Password reset" }));
      setTimeout(() => setActionMsg(prev => { const n = { ...prev }; delete n[resetUserId!]; return n; }), 3000);
      setResetUserId(null);
      setResetPwd("");
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
    setResetting(false);
  };

  const deleteUser = async (u: UserData) => {
    if (!confirm(`Delete user "${u.username}" permanently? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/v1/auth/users/${u.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      await mutateUsers();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">User Management</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{(users || []).length} users registered</p>
        </div>
        <button
          onClick={() => setShowNewUser(!showNewUser)}
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-600"
        >
          + Add User
        </button>
      </div>

      {/* New User Form */}
      {showNewUser && (
        <div className="mb-4 p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Username</label>
              <input
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                placeholder="e.g. b.martini"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Email</label>
              <input
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                placeholder="e.g. b.martini@unifi.it"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Password (min 12, max 20 chars — letters, numbers, . ! @ # $ % etc.)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value.slice(0, 20) })}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                  placeholder="12-20 characters"
                  maxLength={20}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              <PasswordStrengthBar password={newUser.password} username={newUser.username} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="viewer">Viewer (tutor)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createUser}
              disabled={saving || !newUser.username || !newUser.email || !isPasswordValid(newUser.password, newUser.username)}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
            <button
              onClick={() => { setShowNewUser(false); setError(""); }}
              className="px-4 py-2 rounded-lg bg-[var(--muted)] text-sm hover:bg-[var(--border)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="space-y-2">
        {(users || []).map((u) => (
          <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)] gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{u.username}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  u.role === "admin" ? "bg-purple-700 text-white" : "bg-blue-700 text-white"
                }`}>
                  {u.role === "admin" ? "ADMIN" : "VIEWER"}
                </span>
                {!u.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-700 text-white font-bold">
                    INACTIVE
                  </span>
                )}
                {actionMsg[u.id] && (
                  <span className="text-[10px] text-emerald-400">{actionMsg[u.id]}</span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] truncate">{u.email}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <select
                value={u.role}
                onChange={(e) => changeRole(u, e.target.value)}
                className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] border border-[var(--border)]"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => { setResetUserId(resetUserId === u.id ? null : u.id); setResetPwd(""); setShowResetPwd(false); }}
                className={`text-[10px] px-2 py-1 rounded font-bold ${resetUserId === u.id ? "bg-amber-500 text-black" : "bg-amber-700 text-white hover:bg-amber-600"}`}
                title="Reset password"
              >
                Reset PW
              </button>
              <button
                onClick={() => toggleActive(u)}
                className={`text-[10px] px-2 py-1 rounded font-bold ${
                  u.is_active ? "bg-red-700 text-white hover:bg-red-600" : "bg-emerald-700 text-white hover:bg-emerald-600"
                }`}
              >
                {u.is_active ? "Disable" : "Enable"}
              </button>
              {u.role !== "admin" && (
                <button
                  onClick={() => deleteUser(u)}
                  className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10"
                  title="Delete user permanently"
                >
                  Del
                </button>
              )}
            </div>

            {/* Reset Password inline form */}
            {resetUserId === u.id && (
              <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                <p className="text-[10px] font-bold text-amber-400">New password for {u.username}</p>
                <div className="relative max-w-sm">
                  <input
                    type={showResetPwd ? "text" : "password"}
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value.slice(0, 20))}
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                    placeholder="12-20 characters"
                    maxLength={20}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowResetPwd(!showResetPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title={showResetPwd ? "Hide" : "Show"}>
                    {showResetPwd ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
                <PasswordStrengthBar password={resetPwd} username={u.username} />
                <div className="flex gap-2">
                  <button
                    onClick={submitResetPassword}
                    disabled={resetting || !isPasswordValid(resetPwd, u.username)}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50"
                  >
                    {resetting ? "Resetting..." : "Reset Password"}
                  </button>
                  <button
                    onClick={() => { setResetUserId(null); setResetPwd(""); }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--muted)] text-xs hover:bg-[var(--border)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// --- Scheduled Jobs ---

interface JobInfo {
  id: number;
  job_key: string;
  label: string;
  description: string;
  job_type: string;
  hour: number;
  minute: number;
  enabled: boolean;
  notify: boolean;
  topic_filter: string | null;
  next_run: string | null;
  last_run: { started_at: string | null; duration: number | null; status: string | null; summary: string | null } | null;
}

interface JobRunEntry {
  id: number;
  job_name: string;
  started_at: string | null;
  duration_seconds: number | null;
  status: string;
  result_summary: string | null;
  error_message: string | null;
}

function ScheduledJobsSection() {
  const { data: jobs, mutate: mutateJobs } = useSWR<JobInfo[]>("/api/v1/scheduled-jobs", authFetcher);
  const { data: runs, mutate: mutateRuns } = useSWR<JobRunEntry[]>("/api/v1/scheduled-jobs/runs?limit=20", authFetcher);

  // Auto-poll when any job is running
  const anyRunning = jobs?.some((j: any) => j.is_running);
  useEffect(() => {
    if (!anyRunning) return;
    const interval = setInterval(() => { mutateJobs(); mutateRuns(); }, 5000);
    return () => clearInterval(interval);
  }, [anyRunning, mutateJobs, mutateRuns]);
  const { data: topics } = useSWR<{ id: number; name: string }[]>("/api/v1/topics", authFetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [triggering, setTriggering] = useState<number | null>(null);

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("discovery");
  const [newHour, setNewHour] = useState(6);
  const [newMinute, setNewMinute] = useState(0);
  const [newMaxPerSource, setNewMaxPerSource] = useState(50);
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editHour, setEditHour] = useState(0);
  const [editMinute, setEditMinute] = useState(0);
  const [editTopics, setEditTopics] = useState<string[]>([]);

  const createJob = async () => {
    setCreating(true);
    await fetch("/api/v1/scheduled-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        label: newLabel.trim(), description: newDesc.trim(), job_type: newType,
        hour: newHour, minute: newMinute, topic_filter: newTopics.length > 0 ? newTopics.join(",") : null, max_per_source: newMaxPerSource,
      }),
    });
    setShowCreate(false);
    setNewLabel(""); setNewDesc(""); setNewType("discovery"); setNewHour(6); setNewMinute(0); setNewTopics([]);
    setCreating(false);
    mutateJobs();
  };

  const updateJob = async (id: number, patch: Record<string, unknown>) => {
    await fetch(`/api/v1/scheduled-jobs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    setEditingId(null);
    mutateJobs();
  };

  const deleteJob = async (id: number, label: string) => {
    if (!confirm(`Delete job "${label}" permanently?`)) return;
    await fetch(`/api/v1/scheduled-jobs/${id}`, { method: "DELETE", headers: authHeaders() });
    mutateJobs();
  };

  const triggerJob = async (id: number) => {
    setTriggering(id);
    await fetch(`/api/v1/scheduled-jobs/${id}/run`, { method: "POST", headers: authHeaders() });
    // Start polling — the is_running flag will keep the UI in "running" state
    setTimeout(() => { mutateJobs(); setTriggering(null); }, 2000);
  };

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  const exportRunsTxt = () => {
    if (!runs || runs.length === 0) return;
    const lines = runs.map(r =>
      `ID: #${r.id}\nJob: ${r.job_name}\nTime: ${r.started_at || "—"}\nDuration: ${r.duration_seconds?.toFixed(1) || "—"}s\nStatus: ${r.status}\nResult: ${r.result_summary || "—"}\n${r.error_message ? `Error: ${r.error_message}\n` : ""}`
    );
    const blob = new Blob([lines.join("\n---\n\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `job_runs_${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Scheduled Jobs</h3>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-600">
          + Create Job
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Label</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Discovery FL Healthcare"
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Job Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none">
                <option value="discovery">Discovery</option>
                <option value="citation_refresh">Citation Refresh</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Description</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What this job does"
              className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Schedule (UTC)</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={23} value={newHour} onChange={e => setNewHour(Number(e.target.value))}
                  className="w-16 px-2 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-center" />
                <span>:</span>
                <input type="number" min={0} max={59} value={newMinute} onChange={e => setNewMinute(Number(e.target.value))}
                  className="w-16 px-2 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-center" />
              </div>
            </div>
            {newType === "discovery" && (
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Max per source</label>
                <select value={newMaxPerSource} onChange={e => setNewMaxPerSource(Number(e.target.value))}
                  className="w-full px-2 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm">
                  <option value={50}>50 (daily)</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500 (backfill)</option>
                  <option value={1000}>1000 (deep backfill)</option>
                </select>
              </div>
            )}
            {newType === "discovery" && topics && topics.length > 0 && (
              <div className="sm:col-span-2">
                <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">
                  Topics {newTopics.length === 0 ? "(all)" : `(${newTopics.length} selected)`}
                </label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {topics.map(t => {
                    const sel = newTopics.includes(t.name);
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setNewTopics(sel ? newTopics.filter(n => n !== t.name) : [...newTopics, t.name])}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-colors ${sel ? "bg-purple-700 text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"}`}>
                        {sel ? "✓ " : ""}{t.name}
                      </button>
                    );
                  })}
                  {newTopics.length > 0 && (
                    <button type="button" onClick={() => setNewTopics([])}
                      className="text-[10px] px-2 py-1 rounded-full text-red-400 hover:bg-red-500/10">Clear all</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={createJob} disabled={creating || !newLabel.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50">
              {creating ? "Creating..." : "Create"}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-[var(--card)] text-sm hover:bg-[var(--muted)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Job cards */}
      <div className="space-y-3">
        {(jobs || []).map(job => (
          <div key={job.id} className="p-3 rounded-lg bg-[var(--secondary)] space-y-2">
            {editingId === job.id ? (
              /* Edit mode */
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label"
                    className="px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description"
                    className="px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" min={0} max={23} value={editHour} onChange={e => setEditHour(Number(e.target.value))}
                    className="w-14 text-xs px-1 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-center" />
                  <span className="text-xs">:</span>
                  <input type="number" min={0} max={59} value={editMinute} onChange={e => setEditMinute(Number(e.target.value))}
                    className="w-14 text-xs px-1 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-center" />
                  <span className="text-[9px] text-[var(--muted-foreground)]">UTC</span>
                  {job.job_type === "discovery" && topics && topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 flex-1">
                      {topics.map(t => {
                        const sel = editTopics.includes(t.name);
                        return (
                          <button key={t.id} type="button"
                            onClick={() => setEditTopics(sel ? editTopics.filter(n => n !== t.name) : [...editTopics, t.name])}
                            className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${sel ? "bg-purple-700 text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                            {sel ? "✓ " : ""}{t.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateJob(job.id, { label: editLabel, description: editDesc, hour: editHour, minute: editMinute, topic_filter: editTopics.length > 0 ? editTopics.join(",") : "" })}
                    className="text-[10px] px-3 py-1.5 rounded bg-emerald-700 text-white font-bold">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-[10px] px-3 py-1.5 rounded hover:bg-[var(--muted)]">Cancel</button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${job.enabled ? "bg-emerald-500" : "bg-gray-500"}`} />
                    <span className="text-sm font-bold">{job.label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-700 text-white font-bold">{job.job_type === "discovery" ? "DISCOVERY" : "CITATION"}</span>
                    {job.topic_filter && job.topic_filter.split(",").map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-700 text-white">{t}</span>
                    ))}
                    {!job.topic_filter && job.job_type === "discovery" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-600 text-white">ALL TOPICS</span>}
                    {job.job_type === "discovery" && (job as any).max_per_source && (job as any).max_per_source !== 50 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-700 text-white">{(job as any).max_per_source}/src</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] font-mono">
                      {String(job.hour).padStart(2, "0")}:{String(job.minute).padStart(2, "0")} UTC
                    </span>
                    <button onClick={() => updateJob(job.id, { notify: !job.notify })}
                      className={`text-[10px] px-2 py-1 rounded font-bold ${job.notify ? "bg-blue-700 text-white" : "bg-gray-600 text-white"}`}>
                      {job.notify ? "✉ ON" : "✉ OFF"}
                    </button>
                    <button onClick={() => updateJob(job.id, { enabled: !job.enabled })}
                      className={`text-[10px] px-2 py-1 rounded font-bold ${job.enabled ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
                      {job.enabled ? "Enabled" : "Disabled"}
                    </button>
                    <button onClick={() => triggerJob(job.id)} disabled={triggering === job.id || (job as any).is_running}
                      className={`text-[10px] px-2 py-1 rounded font-bold disabled:opacity-50 ${(job as any).is_running ? "bg-amber-500 text-black animate-pulse" : "bg-amber-700 text-white hover:bg-amber-600"}`}>
                      {(job as any).is_running ? "Running..." : triggering === job.id ? "Starting..." : "Run Now"}
                    </button>
                    <button onClick={() => { setEditingId(job.id); setEditLabel(job.label); setEditDesc(job.description); setEditHour(job.hour); setEditMinute(job.minute); setEditTopics(job.topic_filter ? job.topic_filter.split(",") : []); }}
                      className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--border)]">Edit</button>
                    <button onClick={() => deleteJob(job.id, job.label)}
                      className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10">Del</button>
                  </div>
                </div>
                {job.description && <p className="text-[10px] text-[var(--muted-foreground)]">{job.description}</p>}
                {(job as any).is_running && (
                  <div className="flex items-center gap-2 text-[10px] text-amber-400 font-bold animate-pulse">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Job in progress...
                  </div>
                )}
                {job.last_run && (
                  <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
                    <span>Last: {fmtTime(job.last_run.started_at)}</span>
                    {job.last_run.duration != null && <span>{job.last_run.duration.toFixed(1)}s</span>}
                    <span className={`font-bold ${job.last_run.status === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                      {job.last_run.status?.toUpperCase()}
                    </span>
                    {job.last_run.summary && <span>{job.last_run.summary}</span>}
                  </div>
                )}
                {job.next_run && <div className="text-[10px] text-[var(--muted-foreground)]">Next: {fmtTime(job.next_run)}</div>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Run history */}
      {runs && runs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--muted-foreground)]">Execution History (last 20)</span>
            <button onClick={exportRunsTxt} className="text-[10px] px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600">TXT</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="text-left py-1 pr-2">ID</th>
                  <th className="text-left py-1 pr-2">Job</th>
                  <th className="text-left py-1 pr-2">Time</th>
                  <th className="text-left py-1 pr-2">Duration</th>
                  <th className="text-left py-1 pr-2">Status</th>
                  <th className="text-left py-1 pr-2">Result</th>
                  <th className="text-left py-1"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {runs.map(r => {
                  const reportDate = r.started_at ? r.started_at.slice(0, 10) : null;
                  return (
                  <tr key={r.id} className="hover:bg-[var(--secondary)]">
                    <td className="py-1 pr-2 font-mono text-[var(--muted-foreground)]">#{r.id}</td>
                    <td className="py-1 pr-2 font-medium">{r.job_name}</td>
                    <td className="py-1 pr-2 text-[var(--muted-foreground)]">{fmtTime(r.started_at)}</td>
                    <td className="py-1 pr-2">{r.duration_seconds?.toFixed(1)}s</td>
                    <td className={`py-1 pr-2 font-bold ${r.status === "ok" ? "text-emerald-400" : "text-red-400"}`}>{r.status.toUpperCase()}</td>
                    <td className="py-1 pr-2 text-[var(--muted-foreground)]">{r.result_summary || r.error_message || "—"}</td>
                    <td className="py-1">
                      {r.job_name.includes("discovery") && r.status === "ok" && reportDate && (
                        <a href={`/reports?date=${reportDate}`} target="_blank" rel="noopener noreferrer"
                          className="text-[9px] px-2 py-0.5 rounded bg-indigo-700 text-white font-bold hover:bg-indigo-600">
                          View Report
                        </a>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// --- Login Log ---

interface LoginLogEntry {
  id: number;
  user_id: number;
  username: string;
  ip: string | null;
  user_agent: string | null;
  timestamp: string | null;
}

function LoginLogSection() {
  const [limit, setLimit] = useState(50);
  const { data: logs } = useSWR<LoginLogEntry[]>(`/api/v1/auth/login-log?limit=${limit}`, authFetcher);

  const fmtDate = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) : "—";

  const fmtDateUTC = (ts: string | null) =>
    ts ? new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";

  const exportTxt = () => {
    if (!logs || logs.length === 0) return;
    const lines = logs.map(l =>
      `ID: #${l.id}\nUser: ${l.username}\nTime: ${fmtDateUTC(l.timestamp)}\nIP: ${l.ip || "—"}\nUser-Agent: ${l.user_agent || "—"}\nServer: production\n`
    );
    const blob = new Blob([lines.join("\n---\n\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `login_log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    if (!logs || logs.length === 0) return;
    const header = "ID,User,Time (UTC),IP,User-Agent,Server\n";
    const rows = logs.map(l =>
      `${l.id},"${l.username}","${fmtDateUTC(l.timestamp)}","${l.ip || ""}","${(l.user_agent || "").replace(/"/g, '""')}","production"`
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `login_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-medium">Login Log</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{logs?.length || 0} entries shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] border border-[var(--border)]"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
            <option value={9999}>All</option>
          </select>
          <button onClick={exportTxt} className="text-[10px] px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600" title="Export as TXT">TXT</button>
          <button onClick={exportCsv} className="text-[10px] px-2 py-1 rounded bg-emerald-800 text-white hover:bg-emerald-700" title="Export as CSV">CSV</button>
        </div>
      </div>
      {!logs || logs.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-4">No login records yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <th className="text-left py-2 pr-2 w-12">ID</th>
                <th className="text-left py-2 pr-2 w-24">User</th>
                <th className="text-left py-2 pr-2 w-44">Date/Time (UTC)</th>
                <th className="text-left py-2 pr-2 w-32">IP</th>
                <th className="text-left py-2">User-Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-[var(--secondary)] transition-colors">
                  <td className="py-2 pr-2 font-mono text-[10px] text-[var(--muted-foreground)]">#{log.id}</td>
                  <td className="py-2 pr-2 font-medium">{log.username}</td>
                  <td className="py-2 pr-2 text-[var(--muted-foreground)] font-mono text-[10px]">{fmtDateUTC(log.timestamp)}</td>
                  <td className="py-2 pr-2 font-mono text-[10px]">{log.ip || "—"}</td>
                  <td className="py-2 text-[10px] text-[var(--muted-foreground)] truncate" title={log.user_agent || ""}>{log.user_agent || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// --- Password Strength ---

function getPasswordChecks(password: string, username?: string) {
  return [
    { label: "At least 12 characters", ok: password.length >= 12 },
    { label: "Uppercase letter (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "Lowercase letter (a-z)", ok: /[a-z]/.test(password) },
    { label: "Number (0-9)", ok: /[0-9]/.test(password) },
    { label: "Special character (!@#$%...)", ok: /[^A-Za-z0-9]/.test(password) },
    ...(username ? [{ label: "Does not contain username", ok: !password.toLowerCase().includes(username.toLowerCase()) }] : []),
  ];
}

function PasswordStrengthBar({ password, username }: { password: string; username?: string }) {
  if (!password) return null;
  const checks = getPasswordChecks(password, username);
  const passed = checks.filter(c => c.ok).length;
  const total = checks.length;
  const pct = Math.round((passed / total) * 100);
  const isStrong = passed === total && password.length >= 14;
  const isMedium = passed === total;
  const color = isStrong ? "bg-emerald-500" : isMedium ? "bg-amber-500" : "bg-red-500";
  const label = isStrong ? "Strong" : isMedium ? "Good" : `${passed}/${total} criteria`;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[9px] font-bold ${isStrong ? "text-emerald-400" : isMedium ? "text-amber-400" : "text-red-400"}`}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <span key={c.label} className={`text-[9px] ${c.ok ? "text-emerald-400" : "text-[var(--muted-foreground)]"}`}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function isPasswordValid(password: string, username?: string) {
  return getPasswordChecks(password, username).every(c => c.ok);
}


// --- Change Password ---

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.changePassword({ current_password: current, new_password: newPwd });
      setMessage({ type: "success", text: "Password updated successfully" });
      setCurrent("");
      setNewPwd("");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to change password" });
    }
    setSaving(false);
  };

  const eyeOpen = <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
  const eyeClosed = <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <h3 className="font-medium mb-4">Change Password</h3>
      {message && (
        <div className={`mb-3 px-3 py-2 rounded text-sm ${
          message.type === "success"
            ? "bg-green-500/10 border border-green-500/20 text-green-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {message.text}
        </div>
      )}
      <div className="space-y-3 max-w-sm">
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full px-3 py-2 pr-10 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
            placeholder="Current password"
          />
          <button type="button" onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title={showCurrent ? "Hide" : "Show"}>
            {showCurrent ? eyeClosed : eyeOpen}
          </button>
        </div>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full px-3 py-2 pr-10 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
            placeholder="12-20 chars, special chars allowed"
            maxLength={20}
          />
          <button type="button" onClick={() => setShowNew(!showNew)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title={showNew ? "Hide" : "Show"}>
            {showNew ? eyeClosed : eyeOpen}
          </button>
        </div>
        <PasswordStrengthBar password={newPwd} />
        <button
          onClick={handleChange}
          disabled={saving || !current || !isPasswordValid(newPwd)}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}


// --- API Costs Section ---

interface CostsData {
  total_analyses: number;
  total_estimated_cost: number;
  by_mode: Record<string, { count: number; cost: number; chars: number }>;
  recent: { paper_id: number; mode: string; chars: number; cost: number; completed_at: string | null }[];
}

function ApiCostsSection() {
  const { data } = useSWR<CostsData>("/api/v1/analysis/costs", authFetcher);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Anthropic API Usage</h3>
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
        >
          Anthropic Console &rarr;
        </a>
      </div>

      {!data ? (
        <div className="h-20 bg-[var(--muted)] rounded-lg animate-pulse" />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg bg-[var(--secondary)] p-3 text-center">
              <div className="text-2xl font-bold">{data.total_analyses}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">Total Analyses</div>
            </div>
            <div className="rounded-lg bg-[var(--secondary)] p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">${data.total_estimated_cost.toFixed(2)}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">Est. Total Cost</div>
            </div>
            {Object.entries(data.by_mode).map(([mode, info]) => (
              <div key={mode} className="rounded-lg bg-[var(--secondary)] p-3 text-center">
                <div className="text-xl font-bold">{info.count}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  {mode.toUpperCase()} (${info.cost.toFixed(2)})
                </div>
              </div>
            ))}
          </div>

          {/* Recent analyses */}
          {data.recent.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Recent Analyses</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-[var(--secondary)]">
                    <span className="text-[var(--muted-foreground)]">Paper {r.paper_id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      r.mode === "deep" ? "bg-purple-700 text-white" : r.mode === "summary" ? "bg-amber-600 text-white" : "bg-blue-700 text-white"
                    }`}>{r.mode.toUpperCase()}</span>
                    <span className="text-[var(--muted-foreground)]">{r.chars?.toLocaleString() || 0} chars</span>
                    <span className="font-mono text-amber-400">${r.cost.toFixed(4)}</span>
                    <span className="text-[var(--muted-foreground)]">
                      {r.completed_at ? new Date(r.completed_at).toLocaleDateString("it-IT") : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[var(--muted-foreground)]">
            Costs are estimated from token usage. Actual billing may differ slightly.
            Check <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">Anthropic Console</a> for exact charges.
          </p>
        </>
      )}
    </div>
  );
}


// --- PDF Author Signature Section ---

function PdfSignatureSection() {
  const { data, mutate: mutateSettings } = useSWR<Record<string, string>>(
    "/api/v1/app-settings",
    authFetcher
  );
  const [signature, setSignature] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [extra, setExtra] = useState("");
  const [footerTemplate, setFooterTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (data && !loaded) {
    setSignature(data["pdf.author_signature"] || "");
    setAffiliation(data["pdf.author_affiliation"] || "");
    setExtra(data["pdf.author_extra"] || "");
    setFooterTemplate(data["pdf.footer_template"] || "");
    setLoaded(true);
  }

  const save = async (key: string, value: string) => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const r = await fetch("/api/v1/app-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ key, value }),
      });
      if (!r.ok) throw new Error("Save failed");
      setSavedMsg("Saved");
      mutateSettings();
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e: any) {
      setSavedMsg(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  // Live preview — replicates the backend smart-default + safe-format logic
  const previewFooter = (() => {
    const sig = signature.trim();
    const aff = affiliation.trim();
    const ext = extra.trim();
    const tpl = footerTemplate.trim();
    const ts = "2026-04-11 10:00 UTC";

    let template = tpl;
    if (!template) {
      const parts: string[] = [];
      if (sig) parts.push("{signature}");
      if (aff) parts.push("{affiliation}");
      if (ext) parts.push("{extra}");
      template = parts.length > 0 ? parts.join(" — ") : "Generated by FL Research Monitor — {timestamp}";
    }
    // Note: {align_right} can't be reproduced perfectly here because true
    // right-alignment in PDF needs LaTeX \hfill. We render it as a tab-like
    // spacer so the user can see the two sides will be separated.
    return template
      .replace(/\{signature\}/g, sig)
      .replace(/\{affiliation\}/g, aff)
      .replace(/\{extra\}/g, ext)
      .replace(/\{timestamp\}/g, ts)
      .replace(/\{align_right\}/g, "    \u2003    ");
  })();

  const inputCls = "flex-1 px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm text-[var(--foreground)]";
  const btnCls = "px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50";

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      {/* Honeypot — Chrome/Safari aggressively autofill the FIRST text/password
          input they see in a form. We absorb that autofill into hidden fields
          so the real fields below stay untouched. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <input type="text" name="username" tabIndex={-1} autoComplete="username" defaultValue="" />
        <input type="password" name="password" tabIndex={-1} autoComplete="new-password" defaultValue="" />
      </div>
      <h3 className="font-medium mb-1">PDF Footer (Author Signature + Custom Template)</h3>
      <p className="text-xs text-[var(--muted-foreground)] mb-4">
        Fully configurable footer for all generated PDFs (analysis, validation, peer review, paper quality).
        Type your values into the three fields and the template, then save each. The footer rendered on every PDF
        is a single line with placeholders substituted in place. Available placeholders:
        {" "}<code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--secondary)]">{"{signature}"}</code>{" "}
        <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--secondary)]">{"{affiliation}"}</code>{" "}
        <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--secondary)]">{"{extra}"}</code>{" "}
        <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--secondary)]">{"{timestamp}"}</code>{" "}
        <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--secondary)]">{"{align_right}"}</code>.
        {" "}<strong>{"{align_right}"}</strong> is a special separator: everything written <em>after</em> it is pushed to the right margin in the PDF (e.g. put the timestamp on the right while keeping the name on the left).
        If the template field is empty, the framework picks a smart default that joins only the non-empty fields with{" "}
        <code className="font-mono text-[10px]">—</code>.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Author signature — placeholder <code className="font-mono">{"{signature}"}</code>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="pdf-author-signature"
              autoComplete="off"
              spellCheck={false}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="e.g. Fabio Liberti"
              className={inputCls}
            />
            <button onClick={() => save("pdf.author_signature", signature)} disabled={saving} className={btnCls}>Save</button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Affiliation — placeholder <code className="font-mono">{"{affiliation}"}</code>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="pdf-author-affiliation"
              autoComplete="off"
              spellCheck={false}
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              placeholder="e.g. Universitas Mercatorum"
              className={inputCls}
            />
            <button onClick={() => save("pdf.author_affiliation", affiliation)} disabled={saving} className={btnCls}>Save</button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Extra (free third field) — placeholder <code className="font-mono">{"{extra}"}</code>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="pdf-author-extra"
              autoComplete="off"
              spellCheck={false}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="e.g. ORCID 0000-0001-2345-6789, role, contact, …"
              className={inputCls}
            />
            <button onClick={() => save("pdf.author_extra", extra)} disabled={saving} className={btnCls}>Save</button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
            Footer template (leave empty for smart default)
          </label>
          <div className="flex gap-2">
            <textarea
              name="pdf-footer-template"
              autoComplete="off"
              spellCheck={false}
              value={footerTemplate}
              onChange={(e) => setFooterTemplate(e.target.value)}
              rows={2}
              placeholder="e.g. {signature} — {affiliation}    or    {signature} — {affiliation}{align_right}{timestamp}"
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm text-[var(--foreground)] font-mono resize-y"
            />
            <div className="flex flex-col gap-1">
              <button onClick={() => save("pdf.footer_template", footerTemplate)} disabled={saving} className={btnCls}>Save</button>
              <button
                onClick={() => { setFooterTemplate(""); save("pdf.footer_template", ""); }}
                disabled={saving}
                className="px-4 py-1 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs font-medium hover:bg-[var(--muted)]"
                title="Reset to smart default"
              >
                Clear
              </button>
            </div>
          </div>
          {footerTemplate && !/\{(signature|affiliation|extra|timestamp|align_right)\}/.test(footerTemplate) && (
            <p className="mt-1 text-[10px] text-amber-400">
              Warning: this template contains no placeholder. The footer will be the literal text above and the three fields will be ignored.
              Click <strong>Clear</strong> to revert to the smart default.
            </p>
          )}
        </div>

        {/* Live preview */}
        <div className="mt-2 p-3 rounded-lg border-2 border-indigo-600 bg-indigo-900/10">
          <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold mb-1">Live preview</div>
          <div className="text-sm font-mono text-[var(--foreground)] break-all">{previewFooter || <em className="opacity-60">empty</em>}</div>
        </div>

        {savedMsg && (
          <div className={`text-xs ${savedMsg === "Saved" ? "text-emerald-400" : "text-red-400"}`}>
            {savedMsg}
          </div>
        )}

        <p className="text-[10px] text-[var(--muted-foreground)]">
          Each field has its own Save button. Changes apply to PDFs generated <strong>after</strong> save.
          The validation report cache auto-invalidates on next view; analysis report PDFs are regenerated on the next analysis run.
        </p>
      </div>
    </div>
  );
}
