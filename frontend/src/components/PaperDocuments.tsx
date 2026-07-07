"use client";

import { useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";

interface PaperDocument {
  id: number;
  paper_id: number;
  filename: string;
  content_type: string | null;
  size: number | null;
  doc_type: string;
  description: string | null;
  uploaded_at: string | null;
}

const DOC_TYPES = [
  "presentation",
  "primer",
  "companion",
  "slides",
  "supplementary",
  "dataset",
  "code",
  "other",
];

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PaperDocuments({ paperId }: { paperId: number }) {
  const key = `/api/v1/papers/${paperId}/documents`;
  const { data: docs } = useSWR<PaperDocument[]>(key, authFetcher);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("presentation");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [zenodo, setZenodo] = useState<string | null>(null);

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const qs = new URLSearchParams({ doc_type: docType });
      if (description) qs.set("description", description);
      const res = await fetch(`/api/v1/papers/${paperId}/documents?${qs.toString()}`, {
        method: "POST",
        headers: authHeaders(), // no Content-Type: browser sets multipart boundary
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      if (fileRef.current) fileRef.current.value = "";
      setDescription("");
      mutate(key);
    } catch (e) {
      alert("Upload fallito: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Eliminare questo documento?")) return;
    await fetch(`/api/v1/papers/documents/${id}`, { method: "DELETE", headers: authHeaders() });
    mutate(key);
  }

  async function download(d: PaperDocument) {
    const res = await fetch(`/api/v1/papers/documents/${d.id}/file`, { headers: authHeaders() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function depositZenodo() {
    if (!confirm("Creare una bozza Zenodo con manoscritto + allegati? (DOI riservato, non pubblicato)")) return;
    setBusy(true);
    setZenodo(null);
    try {
      const res = await fetch(`/api/v1/papers/${paperId}/zenodo-deposit`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ publish: false }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || "errore");
      setZenodo(`Bozza creata — DOI riservato ${j.doi || "?"}. Rivedi e pubblica su Zenodo: ${j.html_url || ""}`);
      mutate(`/api/v1/papers/${paperId}`);
    } catch (e) {
      alert("Zenodo: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 bg-[var(--card)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold">Documenti allegati</h3>
        <button
          onClick={depositZenodo}
          disabled={busy}
          className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          title="Deposita manoscritto + allegati su Zenodo (bozza)"
        >
          Deposita su Zenodo
        </button>
      </div>

      {zenodo && (
        <div className="mb-2 text-xs text-blue-300 bg-blue-950/40 rounded p-2 break-words">{zenodo}</div>
      )}

      {/* Upload form */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input ref={fileRef} type="file" className="text-xs max-w-[180px]" />
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="text-xs rounded-lg bg-[var(--secondary)] border border-[var(--border)] px-2 py-1"
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="descrizione (opz.)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-xs rounded-lg bg-[var(--secondary)] border border-[var(--border)] px-2 py-1 flex-1 min-w-[120px]"
        />
        <button
          onClick={upload}
          disabled={busy}
          className="px-2.5 py-1 text-xs rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50"
        >
          Carica
        </button>
      </div>

      {/* List */}
      {docs && docs.length > 0 ? (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-xs border-b border-[var(--border)]/50 py-1">
              <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[10px] uppercase tracking-wide">{d.doc_type}</span>
              <button onClick={() => download(d)} className="text-[var(--primary)] hover:underline truncate max-w-[220px]" title={d.filename}>
                {d.filename}
              </button>
              {d.description && <span className="text-[var(--muted-foreground)] italic truncate max-w-[160px]">{d.description}</span>}
              <span className="text-[var(--muted-foreground)] ml-auto">{fmtSize(d.size)}</span>
              <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300" title="Elimina">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Nessun documento allegato. Carica presentazione, primer, companion, ...</p>
      )}
    </div>
  );
}
