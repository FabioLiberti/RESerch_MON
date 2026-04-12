"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems: { href: string; label: string; icon: string; tooltip: string }[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    tooltip: "Overview metrics, recent papers, validation progress, and global timeline.",
  },
  {
    href: "/discovery",
    label: "Discovery",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    tooltip: "Search papers across PubMed, arXiv, Semantic Scholar, IEEE, Elsevier, bioRxiv, medRxiv. Smart Search and import by DOI.",
  },
  {
    href: "/topics",
    label: "Topics",
    icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
    tooltip: "Configured research topics and per-source query templates.",
  },
  {
    href: "/papers",
    label: "Papers",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    tooltip: "Full bibliography with filters (validation, quality, labels, keywords, FL techniques, datasets, methods).",
  },
  {
    href: "/review",
    label: "Meta Review",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    tooltip: "Meta-validation queue: review the LLM-generated Extended Abstracts before sharing them with tutors.",
  },
  {
    href: "/peer-review",
    label: "Peer Review",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    tooltip: "Confidential review of unpublished manuscripts for journals (e.g. IEEE T-AI). Multi-template, isolated from the public bibliography.",
  },
  {
    href: "/paper-quality",
    label: "Quality Review",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    tooltip: "Versioned scientific quality assessment of published papers in your bibliography. 10 dimensions, overall grade, exportable PDF/TEX/MD/TXT.",
  },
  {
    href: "/network",
    label: "Network",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    tooltip: "Citation network explorer: ego-centric graph, references and citations from Semantic Scholar.",
  },
  {
    href: "/compendium",
    label: "Compendium",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    tooltip: "Curated FL compendium and learning paths.",
  },
  {
    href: "/comparison",
    label: "Comparison",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    tooltip: "Side-by-side comparison of multiple papers across structured fields.",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    tooltip: "Daily fetch reports and global exports (HTML, JSON, XLSX).",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    tooltip: "Topics management, API keys, PDF signature, app configuration.",
  },
];

// Sun icon path
const SUN_ICON = "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z";
// Moon icon path
const MOON_ICON = "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z";

// Learning path topics with their compendium categories
// available: true = topic page exists in compendium, false = not yet created
const LEARNING_TOPICS = [
  { label: "Introduction to FL", level: "beginner", id: "intro-fl", categories: ["Basics"], available: false },
  { label: "FedAvg Algorithm", level: "beginner", id: "fedavg", categories: ["Algorithms"], available: true },
  { label: "Non-IID Data", level: "intermediate", id: "non-iid", categories: ["Algorithms"], available: false },
  { label: "FL Healthcare", level: "intermediate", id: "fl-healthcare", categories: ["Applications"], available: false },
  { label: "FL Edge Devices", level: "intermediate", id: "fl-edge", categories: ["Systems"], available: false },
  { label: "Differential Privacy", level: "advanced", id: "diff-privacy", categories: ["Privacy"], available: false },
  { label: "Secure Aggregation", level: "advanced", id: "secure-agg", categories: ["Privacy"], available: false },
  { label: "Personalization", level: "advanced", id: "personalization", categories: ["Algorithms", "Privacy"], available: false },
];

const CATEGORY_COLORS: Record<string, string> = {
  Basics: "bg-blue-500/15 text-blue-400",
  Algorithms: "bg-purple-500/15 text-purple-400",
  Privacy: "bg-red-500/15 text-red-400",
  Applications: "bg-amber-500/15 text-amber-400",
  Systems: "bg-cyan-500/15 text-cyan-400",
};

// --- NavItem with delayed fixed-position tooltip ---
// We use position:fixed (rendered through a portal-like absolute body anchor)
// because the parent <nav> uses overflow-y-auto which clips an absolute child
// extending past the sidebar's right edge.
function NavItem({
  item,
  isActive,
  onNavigate,
}: {
  item: { href: string; label: string; icon: string; tooltip: string };
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = linkRef.current?.getBoundingClientRect();
      if (rect) {
        setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
        setShow(true);
      }
    }, 600);
  };
  const onLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <>
      <Link
        ref={linkRef}
        href={item.href}
        onClick={onNavigate}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className={cn(
          "flex items-center gap-3 px-6 py-3 text-sm transition-colors duration-200",
          isActive
            ? "text-[var(--primary)] bg-[var(--primary)]/10 border-r-2 border-[var(--primary)]"
            : "text-[var(--secondary-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]"
        )}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
        </svg>
        {item.label}
      </Link>
      {show && (
        <div
          className="pointer-events-none fixed z-[9999] w-64 px-3 py-2 rounded-lg
                     bg-[var(--card)] border border-[var(--border)]
                     text-[11px] text-[var(--foreground)] shadow-2xl
                     -translate-y-1/2"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="font-bold mb-0.5">{item.label}</div>
          <div className="text-[var(--muted-foreground)] leading-snug">{item.tooltip}</div>
        </div>
      )}
    </>
  );
}


type SidebarTab = "labels" | "keywords" | "topics" | "paths";

function SidebarTabs() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("labels");

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      {/* Tab selector */}
      <div className="flex mx-4 mb-2 gap-0.5 p-0.5 rounded-lg bg-[var(--secondary)]">
        {([
          { key: "labels" as const, label: "Labels" },
          { key: "keywords" as const, label: "Keys" },
          { key: "topics" as const, label: "Topics" },
          { key: "paths" as const, label: "Paths" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 px-1 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all",
              activeTab === tab.key
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "labels" && <LabelsSection />}
      {activeTab === "keywords" && <KeywordsSection />}
      {activeTab === "topics" && <TopicsSection />}
      {activeTab === "paths" && <LearningPathSection />}
    </div>
  );
}


function KeywordsSection() {
  const { data: keywords } = useSWR<{ keyword: string; count: number }[]>(
    "/api/v1/papers/keywords/all", authFetcher
  );

  if (!keywords || keywords.length === 0) {
    return (
      <p className="px-6 py-2 text-[10px] text-[var(--muted-foreground)]">
        No keywords yet.
      </p>
    );
  }

  // Show top 50 keywords by count, then sort alphabetically
  const top = keywords
    .filter((k) => k.count >= 2)
    .slice(0, 50)
    .sort((a, b) => a.keyword.localeCompare(b.keyword));

  return (
    <div className="max-h-96 overflow-y-auto">
      {top.map((k) => (
        <Link
          key={k.keyword}
          href={`/papers?keyword=${encodeURIComponent(k.keyword)}`}
          className="flex items-center gap-2 px-6 py-1.5 text-xs text-[var(--secondary-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
        >
          <span className="flex-1 truncate">{k.keyword}</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{k.count}</span>
        </Link>
      ))}
    </div>
  );
}

function LabelsSection() {
  const { data: labels } = useSWR<{ id: number; name: string; color: string; paper_count?: number }[]>(
    "/api/v1/labels", authFetcher
  );

  if (!labels || labels.length === 0) {
    return (
      <p className="px-6 py-2 text-[10px] text-[var(--muted-foreground)]">
        No labels yet. Create one from a paper detail page.
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      {[...labels].sort((a, b) => a.name.localeCompare(b.name)).map((label) => (
        <Link
          key={label.id}
          href={`/papers?label=${encodeURIComponent(label.name)}`}
          className="flex items-center gap-2 px-6 py-2 text-xs text-[var(--secondary-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
          <span className="flex-1 truncate">{label.name}</span>
          {label.paper_count != null && label.paper_count > 0 && (
            <span className="text-[10px] text-[var(--muted-foreground)]">{label.paper_count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

function TopicsSection() {
  const { data: topics } = useSWR<{ id: number; name: string; keywords: string[] }[]>(
    "/api/v1/topics", authFetcher
  );

  if (!topics || topics.length === 0) {
    return (
      <p className="px-6 py-2 text-[10px] text-[var(--muted-foreground)]">
        No topics configured.
      </p>
    );
  }

  return (
    <div>
      {topics.map((topic) => (
        <Link
          key={topic.id}
          href={`/papers?topic=${encodeURIComponent(topic.name)}`}
          className="flex items-center gap-2 px-6 py-2 text-xs text-[var(--secondary-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--primary)]" />
          <span className="flex-1 truncate">{topic.name}</span>
        </Link>
      ))}
    </div>
  );
}

function LearningPathSection() {
  return (
    <div>
      {LEARNING_TOPICS.map((topic) => {
        const content = topic.available ? (
          <Link
            key={topic.id}
            href={`/compendium?topic=${topic.id}`}
            className="flex items-center gap-2 px-6 py-2 text-xs text-[var(--secondary-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors group"
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              topic.level === "beginner" && "bg-emerald-400",
              topic.level === "intermediate" && "bg-amber-400",
              topic.level === "advanced" && "bg-red-400",
            )} />
            <span className="flex-1 truncate">{topic.label}</span>
            <span className="flex gap-0.5 shrink-0">
              {topic.categories.map((cat) => (
                <span
                  key={cat}
                  className={cn(
                    "text-[8px] px-1 py-0.5 rounded leading-none",
                    CATEGORY_COLORS[cat] || "bg-[var(--muted)] text-[var(--muted-foreground)]",
                  )}
                >
                  {cat}
                </span>
              ))}
            </span>
          </Link>
        ) : (
          <div
            key={topic.id}
            className="flex items-center gap-2 px-6 py-2 text-xs text-[var(--muted-foreground)] opacity-40 cursor-not-allowed"
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              topic.level === "beginner" && "bg-emerald-400",
              topic.level === "intermediate" && "bg-amber-400",
              topic.level === "advanced" && "bg-red-400",
            )} />
            <span className="flex-1 truncate">{topic.label}</span>
            <span className="text-[8px]">soon</span>
          </div>
        );
        return content;
      })}
    </div>
  );
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(true);

  // Persist theme preference
  useEffect(() => {
    const saved = localStorage.getItem("fl-theme");
    if (saved === "light") {
      setIsDark(false);
      document.documentElement.classList.add("light-theme");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.remove("light-theme");
      localStorage.setItem("fl-theme", "dark");
    } else {
      document.documentElement.classList.add("light-theme");
      localStorage.setItem("fl-theme", "light");
    }
  };

  return (
    <aside className="w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col h-screen fixed left-0 top-0 transition-colors duration-300">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          FL Research Monitor
        </h1>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">v1.0.0</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-visible">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <NavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
          );
        })}

        {/* Sidebar Tabs: Labels / Topics / Learning Paths */}
        <SidebarTabs />
      </nav>

      {/* Footer: User + Theme Toggle + Status */}
      <div className="p-4 border-t border-[var(--border)] space-y-3">
        {/* User Info */}
        {user && (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-xs font-medium text-[var(--primary)] shrink-0">
                {user.username[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{user.username}</p>
                <p className="text-[10px] text-[var(--muted-foreground)]">{user.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-xs text-[var(--muted-foreground)] hover:text-red-400 transition-colors p-1"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--muted)] transition-all duration-300 group"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-5 h-5">
              {/* Sun icon */}
              <svg
                className={cn(
                  "w-5 h-5 absolute inset-0 transition-all duration-500",
                  isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100 text-amber-500"
                )}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={SUN_ICON} />
              </svg>
              {/* Moon icon */}
              <svg
                className={cn(
                  "w-5 h-5 absolute inset-0 transition-all duration-500",
                  isDark ? "opacity-100 rotate-0 scale-100 text-indigo-400" : "opacity-0 -rotate-90 scale-0"
                )}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={MOON_ICON} />
              </svg>
            </div>
            <span className="text-xs text-[var(--secondary-foreground)] group-hover:text-[var(--foreground)] transition-colors">
              {isDark ? "Dark Mode" : "Light Mode"}
            </span>
          </div>

          {/* Toggle pill */}
          <div className={cn(
            "w-9 h-5 rounded-full relative transition-colors duration-300",
            isDark ? "bg-indigo-500/30" : "bg-amber-500/30"
          )}>
            <div className={cn(
              "w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all duration-300 shadow-sm",
              isDark ? "left-[3px] bg-indigo-400" : "left-[17px] bg-amber-500"
            )} />
          </div>
        </button>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-1">
          <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
          System Active
        </div>
      </div>
    </aside>
  );
}
