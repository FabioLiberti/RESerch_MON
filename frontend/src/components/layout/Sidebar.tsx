"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/papers", label: "Papers", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/discovery", label: "Discovery", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { href: "/topics", label: "Topics", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
  { href: "/network", label: "Network", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { href: "/compendium", label: "Compendium", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { href: "/reports", label: "Reports", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

// Sun icon path
const SUN_ICON = "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z";
// Moon icon path
const MOON_ICON = "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z";

// Learning path topics with their compendium categories
const LEARNING_TOPICS = [
  { label: "Introduction to FL", level: "beginner", id: "intro-fl", categories: ["Basics"] },
  { label: "FedAvg Algorithm", level: "beginner", id: "fedavg", categories: ["Algorithms"] },
  { label: "Non-IID Data", level: "intermediate", id: "non-iid", categories: ["Algorithms"] },
  { label: "FL Healthcare", level: "intermediate", id: "fl-healthcare", categories: ["Applications"] },
  { label: "FL Edge Devices", level: "intermediate", id: "fl-edge", categories: ["Systems"] },
  { label: "Differential Privacy", level: "advanced", id: "diff-privacy", categories: ["Privacy"] },
  { label: "Secure Aggregation", level: "advanced", id: "secure-agg", categories: ["Privacy"] },
  { label: "Personalization", level: "advanced", id: "personalization", categories: ["Algorithms", "Privacy"] },
];

const CATEGORY_COLORS: Record<string, string> = {
  Basics: "bg-blue-500/15 text-blue-400",
  Algorithms: "bg-purple-500/15 text-purple-400",
  Privacy: "bg-red-500/15 text-red-400",
  Applications: "bg-amber-500/15 text-amber-400",
  Systems: "bg-cyan-500/15 text-cyan-400",
};

function LearningPathSection() {
  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      <p className="px-6 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
        Learning Path
      </p>
      {LEARNING_TOPICS.map((topic) => (
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
      ))}
    </div>
  );
}

export default function Sidebar() {
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
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
          );
        })}

        {/* Learning Path */}
        <LearningPathSection />
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
