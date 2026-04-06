"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthGuard from "./AuthGuard";
import Sidebar from "./Sidebar";

const NO_SHELL_PATHS = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading } = useAuth();

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
          <div className="sidebar-desktop">
            <Sidebar />
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
