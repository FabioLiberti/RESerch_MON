"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { formatDate } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Report {
  id: number;
  report_date: string;
  total_papers: number;
  new_papers: number;
  generated_at: string;
}

export default function ReportsPage() {
  const { data: reports, isLoading } = useSWR<Report[]>("/api/v1/reports", fetcher);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const viewReport = useCallback(async (date: string) => {
    setSelectedDate(date);
    try {
      const res = await fetch(`/api/v1/reports/${date}/html`);
      const html = await res.text();
      setReportHtml(html);
    } catch {
      setReportHtml("<p>Error loading report</p>");
    }
  }, []);

  const generateReport = useCallback(async () => {
    setGenerating(true);
    try {
      await fetch("/api/v1/reports/generate", { method: "POST" });
      // Wait a few seconds for background generation
      setTimeout(async () => {
        await mutate("/api/v1/reports");
        setGenerating(false);
      }, 5000);
    } catch {
      setGenerating(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Daily discovery summaries with paper analyses
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={generating}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : (
            "Generate Report"
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-3">Available Reports</h3>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-[var(--muted)] rounded-lg animate-pulse" />
            ))
          ) : !reports || reports.length === 0 ? (
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No reports generated yet</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Click &ldquo;Generate Report&rdquo; to create your first report
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <button
                key={report.id}
                onClick={() => viewReport(report.report_date)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedDate === report.report_date
                    ? "bg-[var(--primary)]/10 border-[var(--primary)]/30"
                    : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{report.report_date}</span>
                  {report.new_papers > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      +{report.new_papers} new
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1">
                  {report.total_papers} total papers &middot; Generated {formatDate(report.generated_at)}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Report Viewer */}
        <div className="lg:col-span-2">
          {selectedDate && reportHtml ? (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-[var(--secondary)] border-b border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Report: {selectedDate}
                </span>
                <a
                  href={`/api/v1/reports/${selectedDate}/html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  Open in new tab
                </a>
              </div>
              <iframe
                srcDoc={reportHtml}
                className="w-full border-0"
                style={{ height: "700px" }}
                title={`Report ${selectedDate}`}
              />
            </div>
          ) : (
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] h-96 flex items-center justify-center">
              <div className="text-center text-[var(--muted-foreground)]">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Select a report to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
