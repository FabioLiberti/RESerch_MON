"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useRef, useEffect, useState } from "react";

function CompendiumIframe() {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic");
  const section = searchParams.get("section");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [counter, setCounter] = useState(0);

  // Build iframe URL
  const getSrc = () => {
    if (topic) return `/topic/${topic}`;
    if (section) return `/compendium/index.html?s=${section}&_=${counter}`;
    return "/compendium/index.html";
  };

  // Force iframe reload when params change
  useEffect(() => {
    setCounter((c) => c + 1);
  }, [topic, section]);

  return (
    <div className="space-y-4 -m-8">
      <iframe
        key={`${topic}-${section}-${counter}`}
        ref={iframeRef}
        src={getSrc()}
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
