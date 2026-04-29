"use client";

import { useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";

interface Attachment {
  filename: string;
  size: number;
  modified_at: string;
  extension: string;
}

interface AttachmentsResponse {
  peer_review_id: number;
  attachments: Attachment[];
  total: number;
}

const EXT_ICON: Record<string, string> = {
  pdf:  "📄",
  md:   "📝",
  tex:  "📑",
  txt:  "📃",
  png:  "🖼️",
  jpg:  "🖼️",
  jpeg: "🖼️",
  gif:  "🖼️",
  webp: "🖼️",
  docx: "📘",
  rtf:  "📘",
  bib:  "📚",
};

const EXT_COLOR: Record<string, string> = {
  pdf:  "text-red-400",
  md:   "text-blue-400",
  tex:  "text-purple-400",
  txt:  "text-gray-400",
  png:  "text-emerald-400",
  jpg:  "text-emerald-400",
  jpeg: "text-emerald-400",
  docx: "text-cyan-400",
  bib:  "text-amber-400",
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PeerReviewAttachments({ peerReviewId }: { peerReviewId: number }) {
  const { isAdmin } = useAuth();
  const apiUrl = `/api/v1/peer-review/${peerReviewId}/attachments`;
  const { data, isLoading } = useSWR<AttachmentsResponse>(apiUrl, authFetcher);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    const list = Array.from(files);
    let okCount = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setUploadProgress(`Uploading ${i + 1}/${list.length}: ${f.name}…`);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch(apiUrl, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        okCount++;
      } catch (e: any) {
        setError(`Upload failed for ${f.name}: ${e.message || e}`);
      }
    }
    setUploadProgress(null);
    setUploading(false);
    mutate(apiUrl);
    if (okCount === list.length) {
      setUploadProgress(`Uploaded ${okCount} file${okCount !== 1 ? "s" : ""}.`);
      setTimeout(() => setUploadProgress(null), 2500);
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) uploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) uploadFiles(files);
  };

  const downloadAttachment = async (filename: string) => {
    try {
      const r = await fetch(`${apiUrl}/${encodeURIComponent(filename)}`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Download failed: ${e.message || e}`);
    }
  };

  // Inline view in a new tab. We fetch the file with auth headers, build a
  // blob URL, and open it — the browser renders PDFs / images / text natively.
  const viewAttachment = async (filename: string) => {
    try {
      const r = await fetch(`${apiUrl}/${encodeURIComponent(filename)}?inline=1`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after a generous viewing window so memory doesn't leak
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (e: any) {
      setError(`View failed: ${e.message || e}`);
    }
  };

  const VIEWABLE_EXT = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md"]);

  const [savingBundle, setSavingBundle] = useState(false);
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);

  const saveBundleSnapshot = async () => {
    if (!confirm("Save a snapshot of the current review (PDF/TeX/MD/TXT) into Attachments? This adds 4 timestamped files; existing snapshots are kept.")) return;
    setSavingBundle(true);
    setBundleMsg(null);
    try {
      const r = await fetch(`/api/v1/peer-review/${peerReviewId}/save-bundle-to-attachments`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setBundleMsg(`Snapshot saved: ${d.count} file${d.count !== 1 ? "s" : ""} (${d.timestamp})`);
      mutate(apiUrl);
      setTimeout(() => setBundleMsg(null), 4000);
    } catch (e: any) {
      setError(`Save bundle failed: ${e.message || e}`);
    } finally {
      setSavingBundle(false);
    }
  };

  const deleteAttachment = async (filename: string) => {
    if (!confirm(`Delete attachment "${filename}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`${apiUrl}/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mutate(apiUrl);
    } catch (e: any) {
      setError(`Delete failed: ${e.message || e}`);
    }
  };

  const items = data?.attachments || [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Attachments</h3>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
            Review deliverables and archival material (review report, letters, screenshots).
            Manuscript PDF is kept separately.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={saveBundleSnapshot}
              disabled={savingBundle || uploading}
              title="Manually take a timestamped snapshot of the auto-generated review bundle (PDF/TeX/MD/TXT) and store it in Attachments. Optional — click only when you want to align the archive with the current form state."
              className="text-xs px-3 py-1.5 rounded-lg bg-teal-700 text-white font-bold hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {savingBundle ? "Snapshotting…" : "Snapshot bundle"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || savingBundle}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-700 text-white font-bold hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "+ Upload files"}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPickFiles}
        />
      </div>

      {bundleMsg && (
        <div className="text-[11px] px-2 py-1.5 rounded bg-teal-900/30 border border-teal-700/40 text-teal-300">
          {bundleMsg}
        </div>
      )}

      {isAdmin && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-lg p-3 text-center text-[10px] transition-colors cursor-pointer ${
            dragOver
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-indigo-500/50"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? (uploadProgress || "Uploading…")
            : "Drag files here or click to select — supports .pdf .md .tex .txt .docx .png .jpg .bib"}
        </div>
      )}

      {error && (
        <div className="text-[11px] px-2 py-1.5 rounded bg-red-900/30 border border-red-700/40 text-red-300">
          {error}
        </div>
      )}

      {uploadProgress && !uploading && (
        <div className="text-[11px] px-2 py-1.5 rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-300">
          {uploadProgress}
        </div>
      )}

      {isLoading && (
        <div className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
          No attachments yet.
          {isAdmin && " Drop your review documents (PDF, MD, TeX) above to start an archive."}
        </p>
      )}

      {!isLoading && items.length > 0 && (
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
          {items.map((att) => {
            const icon = EXT_ICON[att.extension] || "📎";
            const color = EXT_COLOR[att.extension] || "text-[var(--muted-foreground)]";
            const date = att.modified_at ? new Date(att.modified_at).toLocaleString() : "";
            return (
              <div
                key={att.filename}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--secondary)]/40 transition-colors"
              >
                <span className="text-xl shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" title={att.filename}>
                    {att.filename}
                  </p>
                  <p className="text-[9px] text-[var(--muted-foreground)] flex items-center gap-2">
                    <span className={`uppercase font-semibold ${color}`}>{att.extension || "file"}</span>
                    <span>· {formatSize(att.size)}</span>
                    {date && <span>· {date}</span>}
                  </p>
                </div>
                {VIEWABLE_EXT.has(att.extension) && (
                  <button
                    onClick={() => viewAttachment(att.filename)}
                    className="text-[10px] px-2 py-1 rounded bg-emerald-700/80 text-white hover:bg-emerald-600 font-semibold transition-colors shrink-0"
                    title="View inline in a new tab"
                  >
                    View
                  </button>
                )}
                <button
                  onClick={() => downloadAttachment(att.filename)}
                  className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)] font-semibold transition-colors shrink-0"
                  title="Download"
                >
                  Download
                </button>
                {isAdmin && (
                  <button
                    onClick={() => deleteAttachment(att.filename)}
                    className="text-[10px] px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-900/70 font-semibold transition-colors shrink-0"
                    title="Delete attachment"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
