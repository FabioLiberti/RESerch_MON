/**
 * Build Authorization headers for authenticated API calls.
 *
 * Returns an empty object (never `{ Authorization: undefined }`) so that
 * TypeScript can narrow the result to `Record<string, string>` — required by
 * the `HeadersInit` type accepted by `fetch()` under strict type checks.
 *
 * SSR-safe: during Next.js server-side rendering `window`/`localStorage` are
 * not available; the helper returns an empty object in that case.
 */
export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("fl-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
