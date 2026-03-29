"use client";

export default function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Citation Network</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Visualize citation relationships between discovered papers
        </p>
      </div>

      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 h-[600px] flex items-center justify-center">
        <div className="text-center text-[var(--muted-foreground)]">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <p className="text-sm">Citation network visualization will be available in v0.3.0</p>
          <p className="text-xs mt-1">Requires Semantic Scholar citation data</p>
        </div>
      </div>
    </div>
  );
}
