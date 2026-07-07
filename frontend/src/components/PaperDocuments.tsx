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

const PREVIEWABLE = /\.(pdf|txt|md)$/i;

export default function PaperDocuments({
  paperId,
  onPreview,
}: {
  paperId: number;
  onPreview?: (docId: number) => void;
}) {
  const key = `/api/v1/papers/${paperId}/documents`;
  const { data: docs } = useSWR<PaperDocument[]>(key, authFetcher);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [docType, setDocType] = useState("presentation");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [zenodo, setZenodo] = useState<{ doi?: string; url?: string; n?: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("Scegli prima un file dal PC.");
      return;
    }
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
      setFileName("");
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
    setSelected(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
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
    const ids = Array.from(selected);
    const all = ids.length === 0;
    const msg = all
      ? "Depositare su Zenodo il manoscritto + TUTTI gli allegati? (bozza, DOI riservato)"
      : `Depositare su Zenodo il manoscritto + ${ids.length} allegato/i selezionato/i? (bozza, DOI riservato)`;
    if (!confirm(msg)) return;
    setBusy(true);
    setZenodo(null);
    try {
      const body: any = { publish: false };
      if (!all) body.document_ids = ids;
      const res = await fetch(`/api/v1/papers/${paperId}/zenodo-deposit`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || "errore");
      setZenodo({ doi: j.doi, url: j.html_url, n: j.n_files });
      mutate(`/api/v1/papers/${paperId}`);
    } catch (e) {
      alert("Zenodo: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nSel = selected.size;

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 bg-[var(--card)]">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-sm font-bold">Documenti allegati</h3>
        <button
          onClick={depositZenodo}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center gap-1.5"
          title="Deposita su Zenodo (bozza con DOI riservato)"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3.5l4.5 8h-9L12 5.5z"/></svg>
          Deposita su Zenodo {nSel > 0 ? `(${nSel} selez.)` : "(tutti)"}
        </button>
      </div>

      {zenodo && (
        <div className="mb-2 text-xs rounded-lg p-2.5 bg-blue-50 text-blue-900 border border-blue-300 break-words flex items-start justify-between gap-2">
          <span>
            ✓ Bozza Zenodo creata — DOI riservato <b>{zenodo.doi || "?"}</b> ({zenodo.n} file).{" "}
            {zenodo.url && (
              <a href={zenodo.url} target="_blank" rel="noopener noreferrer"
                className="underline font-semibold text-blue-700 hover:text-blue-900">
                Rivedi e pubblica su Zenodo →
              </a>
            )}
          </span>
          <button onClick={() => setZenodo(null)} className="text-blue-500 hover:text-blue-800 shrink-0" title="Chiudi">✕</button>
        </div>
      )}

      {/* Upload form */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--secondary)] border border-[var(--border)] hover:bg-[var(--border)] cursor-pointer flex items-center gap-1.5 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          Scegli file dal PC
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
          />
        </label>
        {fileName && (
          <span className="text-xs text-[var(--foreground)] max-w-[220px] truncate" title={fileName}>{fileName}</span>
        )}
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="text-xs rounded-lg bg-[var(--secondary)] border border-[var(--border)] px-2 py-1.5"
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
          className="text-xs rounded-lg bg-[var(--secondary)] border border-[var(--border)] px-2 py-1.5 flex-1 min-w-[140px]"
        />
        <button
          onClick={upload}
          disabled={busy || !fileName}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-40"
        >
          Carica
        </button>
      </div>

      {/* List */}
      {docs && docs.length > 0 ? (
        <ul className="space-y-1.5">
          {docs.map((d) => {
            const canView = PREVIEWABLE.test(d.filename);
            return (
              <li key={d.id} className="text-xs border border-[var(--border)]/60 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    title="Includi nel deposito Zenodo"
                    className="shrink-0"
                  />
                  <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[10px] uppercase tracking-wide shrink-0">{d.doc_type}</span>
                  <span className="font-medium truncate flex-1 min-w-0" title={d.filename}>{d.filename}</span>
                  <span className="text-[var(--muted-foreground)] shrink-0">{fmtSize(d.size)}</span>
                  {canView && onPreview && (
                    <button onClick={() => onPreview(d.id)} className="text-[var(--primary)] hover:underline shrink-0" title="Visualizza nel viewer">👁 Visualizza</button>
                  )}
                  <button onClick={() => download(d)} className="text-[var(--primary)] hover:underline shrink-0" title="Scarica">⬇</button>
                  <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300 shrink-0" title="Elimina">✕</button>
                </div>
                {d.description && (
                  <div className="text-[var(--muted-foreground)] italic mt-1 pl-6 break-words whitespace-pre-wrap">{d.description}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Nessun documento allegato. Carica presentazione, primer, companion, ...</p>
      )}

      {docs && docs.length > 0 && (
        <p className="text-[10px] text-[var(--muted-foreground)] mt-2">
          Spunta i documenti da includere nel deposito Zenodo (nessuna spunta = tutti). Solo PDF/TXT/MD sono visualizzabili nel viewer.
        </p>
      )}
    </div>
  );
}
