import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login — FL Research Monitor",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // Login page has no sidebar
  return <>{children}</>;
}
