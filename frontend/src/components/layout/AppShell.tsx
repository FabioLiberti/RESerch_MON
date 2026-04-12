"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthGuard from "./AuthGuard";
import Sidebar from "./Sidebar";

const NO_SHELL_PATHS = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  // Loading spinner
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
        </div>
      </div>
    );
  }

  const showShell = !NO_SHELL_PATHS.includes(pathname);

  return (
    <AuthGuard>
      {showShell ? (
        <div className="flex min-h-screen">
          {/* Desktop sidebar (hidden below 768px via CSS) */}
          <div className="sidebar-desktop">
            <Sidebar />
          </div>

          {/* Mobile hamburger top bar (visible only below 768px) */}
          <div className="mobile-topbar">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              FL Research Monitor
            </h1>
            <div className="w-10" /> {/* spacer for centering */}
          </div>

          {/* Mobile drawer overlay */}
          {mobileMenuOpen && (
            <div
              className="mobile-overlay"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Mobile drawer sidebar */}
          <div className={`mobile-drawer ${mobileMenuOpen ? "mobile-drawer-open" : ""}`}>
            <div className="flex items-center justify-end p-3 border-b border-[var(--border)]">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>

          <main className="main-content flex-1 ml-64 p-6 md:p-8">
            <div className="animate-fade-in">{children}</div>
          </main>
        </div>
      ) : (
        children
      )}
    </AuthGuard>
  );
}
