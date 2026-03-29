"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CompendiumIframe() {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic");
  const section = searchParams.get("section");

  // Build iframe src that CRA will read as window.location.pathname
  // Next.js rewrites /topic/:id → /compendium/index.html
  // so CRA sees pathname="/topic/intro-fl" and routes correctly
  let iframeSrc = "/compendium/index.html";
  if (topic) {
    iframeSrc = `/topic/${topic}`;
  } else if (section === "learning-path") {
    iframeSrc = "/learning-path";
  }

  return (
    <div className="space-y-4 -m-8">
      <iframe
        src={iframeSrc}
        className="w-full border-0"
        style={{
          height: "calc(100vh)",
          minHeight: "600px",
        }}
        title="FedCompendium XL"
        allow="fullscreen"
      />
    </div>
  );
}

export default function CompendiumPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[var(--muted)] border-t-[var(--primary)] rounded-full animate-spin" />
      </div>
    }>
      <CompendiumIframe />
    </Suspense>
  );
}
