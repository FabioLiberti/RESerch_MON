"use client";

import { use } from "react";
import Link from "next/link";
import { usePaper } from "@/hooks/usePapers";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS } from "@/lib/utils";

export default function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: paper, isLoading } = usePaper(Number(id));

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-96 bg-[var(--muted)] rounded" />
        <div className="h-4 w-64 bg-[var(--muted)] rounded" />
        <div className="h-40 bg-[var(--muted)] rounded-xl" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="text-center py-20 text-[var(--muted-foreground)]">
        Paper not found
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back */}
      <Link href="/papers" className="text-sm text-[var(--primary)] hover:underline">
        &larr; Back to papers
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold leading-snug">{paper.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--primary)] hover:underline"
            >
              DOI: {paper.doi}
            </a>
          )}
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatDate(paper.publication_date)}
          </span>
          {paper.journal && (
            <span className="text-xs text-[var(--muted-foreground)] italic">
              {paper.journal}
            </span>
          )}
          {paper.validated && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              Validated
            </span>
          )}
        </div>
      </div>

      {/* Authors */}
      {paper.authors.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Authors</h3>
          <div className="flex flex-wrap gap-2">
            {paper.authors.map((a) => (
              <span
                key={a.id}
                className="text-sm px-2 py-1 rounded-lg bg-[var(--secondary)]"
                title={a.affiliation || undefined}
              >
                {a.name}
                {a.orcid && (
                  <a
                    href={`https://orcid.org/${a.orcid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-[var(--primary)]"
                  >
                    ORCID
                  </a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Abstract */}
      {paper.abstract && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-3">Abstract</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{paper.abstract}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sources */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Sources</h3>
          <div className="space-y-1">
            {paper.source_details.map((s) => (
              <div key={s.source_name} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SOURCE_COLORS[s.source_name] || "#6b7280" }}
                />
                <span className="text-sm">{SOURCE_LABELS[s.source_name] || s.source_name}</span>
                {s.source_id && (
                  <span className="text-xs text-[var(--muted-foreground)]">#{s.source_id}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Details</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Type</dt>
              <dd className="capitalize">{paper.paper_type.replace("_", " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Citations</dt>
              <dd>{paper.citation_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Open Access</dt>
              <dd>{paper.open_access ? "Yes" : "No"}</dd>
            </div>
            {paper.volume && (
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">Volume</dt>
                <dd>{paper.volume}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* PDF Link */}
      {paper.pdf_url && (
        <a
          href={paper.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View PDF
        </a>
      )}
    </div>
  );
}
