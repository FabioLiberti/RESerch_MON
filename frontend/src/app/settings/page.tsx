"use client";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Configure API keys, topics, and scheduling
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* API Keys Section */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-4">API Keys</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Configure API keys in the backend <code className="bg-[var(--muted)] px-1 rounded">.env</code> file.
            Keys are not exposed through the frontend for security.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-[var(--border)]">
              <span>NCBI / PubMed</span>
              <span className="text-[var(--muted-foreground)]">Optional (increases rate limit)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border)]">
              <span>Semantic Scholar</span>
              <span className="text-[var(--muted-foreground)]">Optional (increases rate limit)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border)]">
              <span>IEEE Xplore</span>
              <span className="text-[var(--warning)]">Required for IEEE search</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border)]">
              <span>Zotero</span>
              <span className="text-[var(--muted-foreground)]">Optional (for Zotero sync)</span>
            </div>
          </div>
        </div>

        {/* Schedule Section */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-4">Scheduling</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Paper discovery runs daily via GitHub Actions at 06:00 UTC.
            Manual discovery can be triggered from the Discovery page.
          </p>
        </div>

        {/* About Section */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-4">About</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Version</dt>
              <dd>0.1.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Sources</dt>
              <dd>PubMed, Semantic Scholar, arXiv, bioRxiv/medRxiv, IEEE</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
