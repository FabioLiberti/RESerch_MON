"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api, authFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

      {/* Topics Management */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
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
      </div>

      {/* Topic Form Modal */}
      {showForm && (
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

      {/* API Keys Info */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
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
      </div>

      {/* System Info */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="font-medium mb-4">System</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Version</dt>
            <dd>0.2.0</dd>
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

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">User Management</h3>
        <button
          onClick={() => setShowNewUser(!showNewUser)}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
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
          <div className="grid grid-cols-2 gap-3">
            <input
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              placeholder="Username"
            />
            <input
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              placeholder="Email"
            />
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              placeholder="Password (min 6 chars)"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createUser}
              disabled={saving || !newUser.username || !newUser.email || newUser.password.length < 6}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
            <button
              onClick={() => setShowNewUser(false)}
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
          <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)]">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{u.username}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  u.role === "admin" ? "bg-purple-500/15 text-purple-400" : "bg-blue-500/15 text-blue-400"
                }`}>
                  {u.role}
                </span>
                {!u.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                    inactive
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={u.role}
                onChange={(e) => changeRole(u, e.target.value)}
                className="text-xs px-2 py-1 rounded bg-[var(--muted)] border border-[var(--border)]"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => toggleActive(u)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  u.is_active ? "hover:bg-red-500/20 text-red-400" : "hover:bg-green-500/20 text-green-400"
                }`}
              >
                {u.is_active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// --- Change Password ---

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
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
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
          placeholder="Current password"
        />
        <input
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
          placeholder="New password (min 6 chars)"
        />
        <button
          onClick={handleChange}
          disabled={saving || !current || newPwd.length < 6}
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
      const token = localStorage.getItem("fl-token");
      const r = await fetch("/api/v1/app-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
