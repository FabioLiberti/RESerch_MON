"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { usePaper } from "@/hooks/usePapers";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";
import { getPaperTypeBadge } from "@/lib/paperTypes";
import SubmissionTimeline from "@/components/SubmissionTimeline";
import ReviewJournal from "@/components/ReviewJournal";
import ManuscriptBibliography from "@/components/ManuscriptBibliography";

export default function MyManuscriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const paperId = Number(id);
  const { isAdmin } = useAuth();
  const { data: paper, isLoading } = usePaper(paperId);

  // Document tab: Main vs Supplementary
  const [docTab, setDocTab] = useState<"main" | "supplementary">("main");

  // PDF viewer state (main)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Supplementary viewer state
  const [suppBlobUrl, setSuppBlobUrl] = useState<string | null>(null);
  const [suppLoading, setSuppLoading] = useState(false);

  // Load main PDF
  useEffect(() => {
    if (!paper?.has_pdf || pdfBlobUrl || pdfLoading) return;
    setPdfLoading(true);
    fetch(`/api/v1/papers/${paperId}/pdf-file`, { headers: authHeaders() })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(blob => setPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {})
      .finally(() => setPdfLoading(false));
  }, [paper?.has_pdf, paperId, pdfBlobUrl, pdfLoading]);

  // Load supplementary PDF
  useEffect(() => {
    if (!(paper as any)?.has_supplementary || suppBlobUrl || suppLoading) return;
    setSuppLoading(true);
    fetch(`/api/v1/papers/${paperId}/supplementary-file`, { headers: authHeaders() })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(blob => setSuppBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {})
      .finally(() => setSuppLoading(false));
  }, [(paper as any)?.has_supplementary, paperId, suppBlobUrl, suppLoading]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      if (suppBlobUrl) URL.revokeObjectURL(suppBlobUrl);
    };
  }, [pdfBlobUrl, suppBlobUrl]);

  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/v1/analysis/${paperId}/upload-pdf`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    if (r.ok) {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      const { mutate } = await import("swr");
      mutate(`/api/v1/papers/${paperId}`);
    }
  };

  const downloadFile = async (format: "tex" | "md") => {
    const r = await fetch(`/api/v1/papers/${paperId}/${format}-file`, {
      headers: authHeaders(),
    });
    if (r.ok) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(paper?.title || "manuscript").slice(0, 80)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const uploadSupplementary = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/v1/papers/${paperId}/upload-supplementary`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    if (r.ok) {
      if (suppBlobUrl) URL.revokeObjectURL(suppBlobUrl);
      setSuppBlobUrl(null);
      const { mutate } = await import("swr");
      mutate(`/api/v1/papers/${paperId}`);
    }
  };

  // Dropdown state for TEX/MD buttons
  const [openDropdown, setOpenDropdown] = useState<"tex" | "md" | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-96 bg-[var(--muted)] rounded" />
        <div className="h-[80vh] bg-[var(--muted)] rounded-xl" />
      </div>
    );
  }

  if (!paper) {
    return <div className="text-center py-20 text-[var(--muted-foreground)]">Paper not found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <Link href="/my-manuscripts" className="text-xs text-[var(--primary)] hover:underline">
            &larr; Back to My Manuscripts
          </Link>
          <h1 className="text-lg font-bold leading-snug mt-1 line-clamp-2">{paper.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-700 text-white font-bold">MY MANUSCRIPT</span>
            {paper.paper_type && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${getPaperTypeBadge(paper.paper_type).color}`}>
                {getPaperTypeBadge(paper.paper_type).badge}
              </span>
            )}
            {(paper as any).has_supplementary && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold" title="Has supplementary file">S</span>
            )}
            {paper.journal && <span className="text-xs text-[var(--muted-foreground)] italic">{paper.journal}</span>}
            {(paper as any).conference_url && (
              <a href={(paper as any).conference_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Conference
              </a>
            )}
            {(paper as any).github_url && (
              <a href={(paper as any).github_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </a>
            )}
            {(paper as any).overleaf_url && (
              <a href={(paper as any).overleaf_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.39 10.97L13.13.55c-.2-.23-.5-.35-.8-.35h-.03c-.28.01-.55.13-.75.34L.42 12.6c-.42.44-.42 1.14 0 1.58l5.85 6.12c.2.21.48.33.77.33h.03c.28-.01.55-.14.74-.35l4.62-5.07c.12-.13.31-.14.44-.02l4.36 4.17c.2.2.48.3.76.3.29 0 .57-.11.78-.33l3.62-3.78c.42-.44.42-1.14 0-1.58z"/>
                </svg>
                Overleaf
              </a>
            )}
            {(paper as any).conference_notes && (
              <span className="text-xs text-[var(--muted-foreground)] italic">{(paper as any).conference_notes}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a href={`/papers/${paperId}`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors">
            Paper Detail ↗
          </a>
        </div>
      </div>

      {/* Side-by-side layout */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)]">
        {/* LEFT: Manuscript Document */}
        <div className="lg:w-1/2 rounded-xl border border-[var(--border)] overflow-hidden bg-white flex flex-col min-h-[300px] lg:min-h-0">
          {/* Toolbar */}
          <div data-tour="ms-toolbar" className="p-2 border-b border-gray-300 bg-gray-100 flex items-center gap-2 flex-wrap shrink-0">
            <span className="text-xs font-bold text-gray-800 mr-auto">Manuscript</span>

            {/* Upload PDF — admin only */}
            {isAdmin && (
              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-700 text-white text-[10px] font-bold cursor-pointer hover:bg-red-600 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                {paper.has_pdf ? "PDF ↑" : "Upload PDF"}
                <input type="file" accept=".pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
              </label>
            )}

            {/* TEX dropdown — admin only */}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "tex" ? null : "tex")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                    (paper as any).has_tex
                      ? "bg-emerald-700 text-white hover:bg-emerald-600"
                      : "bg-gray-500 text-white hover:bg-gray-400"
                  }`}
                >
                  TEX ⬆⬇
                  {(paper as any).has_tex && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
                {openDropdown === "tex" && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden min-w-[130px]">
                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 cursor-pointer">
                      <span>⬆ Import .tex</span>
                      <input type="file" accept=".tex" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { uploadFile(f); setOpenDropdown(null); } e.target.value = ""; }} />
                    </label>
                    <button
                      onClick={() => { downloadFile("tex"); setOpenDropdown(null); }}
                      disabled={!(paper as any).has_tex}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-left"
                    >
                      ⬇ Export .tex
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MD dropdown — admin only */}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "md" ? null : "md")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                    (paper as any).has_md
                      ? "bg-emerald-700 text-white hover:bg-emerald-600"
                      : "bg-gray-500 text-white hover:bg-gray-400"
                  }`}
                >
                  MD ⬆⬇
                  {(paper as any).has_md && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
                {openDropdown === "md" && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden min-w-[130px]">
                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 cursor-pointer">
                      <span>⬆ Import .md</span>
                      <input type="file" accept=".md" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { uploadFile(f); setOpenDropdown(null); } e.target.value = ""; }} />
                    </label>
                    <button
                      onClick={() => { downloadFile("md"); setOpenDropdown(null); }}
                      disabled={!(paper as any).has_md}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-left"
                    >
                      ⬇ Export .md
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Supplementary upload — admin only */}
            {isAdmin && (
              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-bold cursor-pointer hover:bg-red-500 transition-colors">
                S ↑
                <input type="file" accept=".pdf,.doc,.docx,.zip" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadSupplementary(f); e.target.value = ""; }} />
              </label>
            )}

            {/* Overleaf link */}
            {(paper as any).overleaf_url && (
              <a
                href={(paper as any).overleaf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.39 10.97L13.13.55c-.2-.23-.5-.35-.8-.35h-.03c-.28.01-.55.13-.75.34L.42 12.6c-.42.44-.42 1.14 0 1.58l5.85 6.12c.2.21.48.33.77.33h.03c.28-.01.55-.14.74-.35l4.62-5.07c.12-.13.31-.14.44-.02l4.36 4.17c.2.2.48.3.76.3.29 0 .57-.11.78-.33l3.62-3.78c.42-.44.42-1.14 0-1.58z"/>
                </svg>
                Overleaf
              </a>
            )}
          </div>

          {/* Tab selector: Main / Supplementary */}
          {(paper.has_pdf || (paper as any).has_supplementary) && (
            <div className="flex border-b border-gray-300">
              <button
                onClick={() => setDocTab("main")}
                className={`flex-1 text-[10px] font-bold py-1.5 text-center transition-colors ${
                  docTab === "main" ? "bg-white text-gray-800 border-b-2 border-blue-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Main Document
              </button>
              <button
                onClick={() => setDocTab("supplementary")}
                className={`flex-1 text-[10px] font-bold py-1.5 text-center transition-colors ${
                  docTab === "supplementary" ? "bg-white text-gray-800 border-b-2 border-red-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Supplementary {(paper as any).has_supplementary && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1" />}
              </button>
            </div>
          )}

          {/* Document viewer */}
          <div data-tour="ms-pdf" className="flex-1 overflow-hidden">
            {docTab === "main" ? (
              /* Main document viewer */
              !paper.has_pdf ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm p-4 text-center gap-3">
                  <p>No manuscript PDF uploaded yet.</p>
                  <p className="text-[10px] text-gray-400">Upload a PDF to preview it here, or use TEX/MD buttons to manage source files.</p>
                  {(paper as any).overleaf_url && (
                    <a href={(paper as any).overleaf_url} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.39 10.97L13.13.55c-.2-.23-.5-.35-.8-.35h-.03c-.28.01-.55.13-.75.34L.42 12.6c-.42.44-.42 1.14 0 1.58l5.85 6.12c.2.21.48.33.77.33h.03c.28-.01.55-.14.74-.35l4.62-5.07c.12-.13.31-.14.44-.02l4.36 4.17c.2.2.48.3.76.3.29 0 .57-.11.78-.33l3.62-3.78c.42-.44.42-1.14 0-1.58z"/>
                      </svg>
                      Open in Overleaf
                    </a>
                  )}
                </div>
              ) : pdfLoading || !pdfBlobUrl ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading manuscript PDF...</div>
              ) : (
                <>
                  <iframe title="Manuscript PDF" src={`${pdfBlobUrl}#view=FitH`} className="w-full h-full border-0 hidden sm:block" />
                  <div className="sm:hidden h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <p className="text-sm text-gray-600">PDF preview not available on mobile.</p>
                    <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-600">Open PDF</a>
                  </div>
                </>
              )
            ) : (
              /* Supplementary viewer */
              !(paper as any).has_supplementary ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm p-4 text-center gap-3">
                  <p>No supplementary file uploaded yet.</p>
                  {isAdmin && (
                    <label className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 cursor-pointer">
                      Upload Supplementary
                      <input type="file" accept=".pdf,.doc,.docx,.zip" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadSupplementary(f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              ) : suppLoading || !suppBlobUrl ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading supplementary file...</div>
              ) : (
                <>
                  <iframe title="Supplementary" src={`${suppBlobUrl}#view=FitH`} className="w-full h-full border-0 hidden sm:block" />
                  <div className="sm:hidden h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <p className="text-sm text-gray-600">PDF preview not available on mobile.</p>
                    <a href={suppBlobUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500">Open Supplementary</a>
                  </div>
                </>
              )
            )}
          </div>
        </div>

        {/* RIGHT: Submission Timeline + Review Journal + Bibliography */}
        <div className="lg:w-1/2 overflow-y-auto space-y-4">
          <div data-tour="ms-timeline"><SubmissionTimeline paperId={paperId} /></div>
          <div data-tour="ms-journal"><ReviewJournal paperId={paperId} /></div>
          <div data-tour="ms-bibliography"><ManuscriptBibliography paperId={paperId} /></div>
        </div>
      </div>
    </div>
  );
}
