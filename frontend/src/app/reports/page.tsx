"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { formatDate, cn } from "@/lib/utils";
import type { AnalysisQueueItem } from "@/lib/types";

interface Report {
  id: number;
  report_date: string;
  total_papers: number;
  new_papers: number;
  generated_at: string;
}

type ReportTab = "daily" | "analysis";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");
  const { data: reports, isLoading } = useSWR<Report[]>("/api/v1/reports", authFetcher);
  const { data: analysisReports } = useSWR<AnalysisQueueItem[]>("/api/v1/analysis/reports", authFetcher);
  const { data: analysisStatus } = useSWR("/api/v1/analysis/status", authFetcher, { refreshInterval: 5000 });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const viewDailyReport = useCallback(async (date: string) => {
    setSelectedDate(date);
    setSelectedPaperId(null);
    try {
      const res = await fetch(`/api/v1/reports/${date}/html`, { headers: authHeaders() });
      setReportHtml(await res.text());
    } catch {
      setReportHtml("<p>Error loading report</p>");
    }
  }, []);

  const viewAnalysisReport = useCallback(async (paperId: number) => {
    setSelectedPaperId(paperId);
    setSelectedDate(null);
    try {
      const res = await fetch(`/api/v1/analysis/${paperId}/html`, { headers: authHeaders() });
      setReportHtml(await res.text());
    } catch {
      setReportHtml("<p>Error loading analysis report</p>");
    }
  }, []);

  const generateReport = useCallback(async () => {
    setGenerating(true);
    try {
      await fetch("/api/v1/reports/generate", { method: "POST", headers: authHeaders() });
      setTimeout(async () => {
        await mutate("/api/v1/reports");
        setGenerating(false);
      }, 5000);
    } catch {
      setGenerating(false);
    }
  }, []);

  const isWorkerRunning = analysisStatus?.running;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Daily summaries and individual paper analyses
          </p>
        </div>
        {activeTab === "daily" && (
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
        )}
      </div>

      {/* Worker status banner */}
      {isWorkerRunning && (
        <div className="px-4 py-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center gap-3">
          <svg className="w-4 h-4 animate-spin text-[var(--primary)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="text-sm">
            <span className="font-medium text-[var(--primary)]">
              Analisi in corso: {analysisStatus.completed}/{analysisStatus.total} completati
            </span>
            {analysisStatus.current_paper && (
              <span className="text-xs text-[var(--muted-foreground)] ml-2">
                — {analysisStatus.current_paper}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)] max-w-xs">
        <button
          onClick={() => setActiveTab("daily")}
          className={cn(
            "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "daily"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
        >
          Daily
        </button>
        <button
          onClick={() => setActiveTab("analysis")}
          className={cn(
            "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all relative",
            activeTab === "analysis"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
        >
          Analysis
          {analysisReports && analysisReports.length > 0 && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)]">
              {analysisReports.length}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-3">
            {activeTab === "daily" ? "Daily Reports" : "Paper Analyses"}
          </h3>

          {activeTab === "daily" ? (
            /* Daily reports list */
            isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-[var(--muted)] rounded-lg animate-pulse" />
              ))
            ) : !reports || reports.length === 0 ? (
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">No reports generated yet</p>
              </div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => viewDailyReport(report.report_date)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-colors",
                    selectedDate === report.report_date
                      ? "bg-[var(--primary)]/10 border-[var(--primary)]/30"
                      : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]/80"
                  )}
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
            )
          ) : (
            /* Analysis reports list */
            !analysisReports || analysisReports.length === 0 ? (
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">No analysis reports yet</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Select papers in the Papers page and click &ldquo;Genera Analisi&rdquo;
                </p>
              </div>
            ) : (
              analysisReports.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => viewAnalysisReport(item.paper_id)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-colors",
                    selectedPaperId === item.paper_id
                      ? "bg-[var(--primary)]/10 border-[var(--primary)]/30"
                      : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]/80"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-[var(--muted-foreground)] font-mono">#{analysisReports.length - idx}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      item.mode === "deep" ? "bg-purple-700 text-white" : "bg-blue-700 text-white"
                    }`}>
                      {(item.mode || "quick").toUpperCase()}
                    </span>
                    {item.engine && (
                      <span className="text-[10px] text-[var(--muted-foreground)]">{item.engine}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-2">{item.paper_title}</span>
                    <div className="flex gap-1 shrink-0">
                      {item.pdf_path && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            fetch(`/api/v1/analysis/${item.paper_id}/pdf`, {
                              headers: authHeaders(),
                            }).then(r => r.blob()).then(blob => {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `analysis_${item.mode}_${item.paper_id}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            });
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-700 text-white hover:bg-red-600 cursor-pointer"
                        >
                          PDF
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1">
                    {formatDate(item.completed_at)}
                  </div>
                </button>
              ))
            )
          )}
        </div>

        {/* Report Viewer */}
        <div className="lg:col-span-2">
          {(selectedDate || selectedPaperId) && reportHtml ? (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-[var(--secondary)] border-b border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {selectedDate ? `Daily Report: ${selectedDate}` : `Paper Analysis #${selectedPaperId}`}
                </span>
                <div className="flex gap-3">
                  {selectedPaperId && (
                    <a
                      href={`/api/v1/analysis/${selectedPaperId}/pdf`}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Download PDF
                    </a>
                  )}
                  <a
                    href={selectedDate
                      ? `/api/v1/reports/${selectedDate}/html`
                      : `/api/v1/analysis/${selectedPaperId}/html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>
              <iframe
                srcDoc={reportHtml}
                className="w-full border-0"
                style={{ height: "700px" }}
                title="Report viewer"
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
