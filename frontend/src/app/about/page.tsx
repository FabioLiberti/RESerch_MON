"use client";

import useSWR from "swr";

export default function AboutPage() {
  const { data: health } = useSWR<{ status: string; version: string }>("/health", async (url: string) => {
    const r = await fetch(url);
    return r.json();
  });

  const version = health?.version || "—";

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">About</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">FL Research Monitor — project information</p>
      </div>

      {/* Project */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">Name</span>
            <span className="text-sm font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">FL Research Monitor</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">Version</span>
            <span className="text-sm font-mono">{version}</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">Description</span>
            <span className="text-sm">Automated scientific paper discovery, analysis, and structured review framework for Federated Learning research, with a focus on healthcare applications and the European Health Data Space (EHDS).</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">Author</span>
            <span className="text-sm">Fabio Liberti</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">License</span>
            <span className="text-sm">Academic research purposes</span>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Links</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">GitHub</span>
            <a href="https://github.com/FabioLiberti/RESerch_MON" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
              </svg>
              FabioLiberti/RESerch_MON
            </a>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--muted-foreground)] w-32 shrink-0">Production</span>
            <a href="https://resmon.fabioliberti.com" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M11 3a17 17 0 000 18M13 3a17 17 0 010 18" />
              </svg>
              resmon.fabioliberti.com
            </a>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Tech Stack</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Frontend", value: "Next.js 16, React 19, TypeScript 6, Tailwind CSS 4" },
            { label: "Backend", value: "FastAPI, SQLAlchemy async, httpx, APScheduler, SlowAPI" },
            { label: "Database", value: "SQLite (aiosqlite)" },
            { label: "LLM (cloud)", value: "Claude Opus 4.6 (extended thinking) + Claude Haiku 4.5" },
            { label: "LLM (local)", value: "Ollama + Gemma4:e4b (9.6 GB)" },
            { label: "PDF", value: "pdflatex (TeX Live) + WeasyPrint (fallback)" },
            { label: "Containerization", value: "Docker multi-stage + Caddy 2 (HTTPS + HTTP/3)" },
            { label: "VPS", value: "Aruba Cloud O8A16, Ubuntu 24.04 LTS" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">{label}</span>
              <span className="text-xs">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Sources */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Academic Data Sources</h2>
        <div className="flex flex-wrap gap-2">
          {["PubMed (NCBI)", "arXiv", "bioRxiv / medRxiv", "Semantic Scholar", "IEEE Xplore", "Elsevier (Scopus)", "CrossRef"].map(src => (
            <span key={src} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">{src}</span>
          ))}
        </div>
      </div>

      {/* Key Features */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Key Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            "Multi-source paper discovery with deduplication",
            "Smart Search (keywords, title, author, DOI)",
            "LLM paper analysis (Quick, Summary, Extended Abstract, Deep)",
            "Meta Review with rubric-based validation of LLM output",
            "Peer Review for journal manuscript evaluation (multi-template)",
            "Paper Quality Review with versioned 10-dimension assessment",
            "My Manuscripts with Submission Timeline and deadline tracking",
            "Review Journal for structured reviewer feedback tracking",
            "Zotero integration with label-based collection mapping",
            "Citation Network explorer (ego-centric graph from S2)",
            "Configurable PDF signature for generated reports",
            "Mobile responsive with hamburger menu",
          ].map(feat => (
            <div key={feat} className="flex items-start gap-2 text-xs">
              <span className="text-emerald-400 mt-0.5 shrink-0">&#10003;</span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
