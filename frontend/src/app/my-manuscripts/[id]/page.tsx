"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePaper } from "@/hooks/usePapers";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import SubmissionTimeline from "@/components/SubmissionTimeline";
import ReviewJournal from "@/components/ReviewJournal";

export default function MyManuscriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const paperId = Number(id);
  const { data: paper, isLoading } = usePaper(paperId);

  // PDF viewer state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF
  useEffect(() => {
    if (!paper?.has_pdf || pdfBlobUrl || pdfLoading) return;
    setPdfLoading(true);
    fetch(`/api/v1/papers/${paperId}/pdf-file`, { headers: authHeaders() })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(blob => setPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {})
      .finally(() => setPdfLoading(false));
  }, [paper?.has_pdf, paperId, pdfBlobUrl, pdfLoading]);

  // Cleanup blob URL
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

  const uploadPdf = async (file: File) => {
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
      // Force re-fetch of paper data + PDF
      const { mutate } = await import("swr");
      mutate(`/api/v1/papers/${paperId}`);
    }
  };

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
            {paper.journal && <span className="text-xs text-[var(--muted-foreground)] italic">{paper.journal}</span>}
            {(paper as any).conference_url && (
              <a href={(paper as any).conference_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[var(--primary)] hover:underline">Conference &nearr;</a>
            )}
            {(paper as any).conference_notes && (
              <span className="text-xs text-[var(--muted-foreground)]">{(paper as any).conference_notes}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/papers/${paperId}`}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors">
            Paper Detail
          </Link>
        </div>
      </div>

      {/* Side-by-side layout */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)]">
        {/* LEFT: Manuscript PDF */}
        <div className="lg:w-1/2 rounded-xl border border-[var(--border)] overflow-hidden bg-white flex flex-col min-h-[300px] lg:min-h-0">
          <div className="p-2 border-b border-gray-300 bg-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-gray-800">Manuscript PDF</span>
            <label className="text-[10px] px-2 py-1 rounded bg-blue-700 text-white font-bold cursor-pointer hover:bg-blue-600">
              {paper.has_pdf ? "Replace PDF" : "Upload PDF"}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); }}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex-1 overflow-hidden">
            {!paper.has_pdf ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center">
                No manuscript PDF uploaded yet.<br />
                Click &quot;Upload PDF&quot; to attach your manuscript.
              </div>
            ) : pdfLoading || !pdfBlobUrl ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                Loading manuscript PDF...
              </div>
            ) : (
              <iframe
                title="Manuscript PDF"
                src={`${pdfBlobUrl}#view=FitH`}
                className="w-full h-full border-0"
              />
            )}
          </div>
        </div>

        {/* RIGHT: Submission Timeline + Review Journal */}
        <div className="lg:w-1/2 overflow-y-auto space-y-4">
          <SubmissionTimeline paperId={paperId} />
          <ReviewJournal paperId={paperId} />
        </div>
      </div>
    </div>
  );
}
