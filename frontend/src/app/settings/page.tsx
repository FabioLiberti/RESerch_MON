"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import type { Topic } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const { data: topics } = useSWR<Topic[]>("/api/v1/topics", fetcher);
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
