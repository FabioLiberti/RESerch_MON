"use client";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Daily and weekly discovery summaries
        </p>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 h-96 flex items-center justify-center">
        <div className="text-center text-[var(--muted-foreground)]">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Report generation will be available in v0.4.0</p>
          <p className="text-xs mt-1">Daily HTML/PDF reports with paper summaries</p>
        </div>
      </div>
    </div>
  );
}
