import { authHeaders } from "@/lib/authHeaders";

const API_BASE = "/api/v1";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = typeof window !== "undefined" ? localStorage.getItem("fl-token") : null;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getAuthHeaders(),
    ...options,
  });

  // If 401, try to refresh token once
  if (res.status === 401 && typeof window !== "undefined") {
    const refreshToken = localStorage.getItem("fl-refresh-token");
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem("fl-token", data.access_token);

        // Retry original request with new token
        const retryRes = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            ...getAuthHeaders(),
            Authorization: `Bearer ${data.access_token}`,
          },
        });

        if (!retryRes.ok) {
          throw new Error(`API Error: ${retryRes.status} ${retryRes.statusText}`);
        }
        return retryRes.json();
      }
    }

    // Refresh failed or no refresh token — clear auth, let AuthGuard handle redirect
    localStorage.removeItem("fl-token");
    localStorage.removeItem("fl-refresh-token");
    localStorage.removeItem("fl-user");
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** SWR-compatible fetcher that includes auth headers with auto-refresh.
 * cache:'no-store' prevents the browser/intermediaries from serving stale API
 * responses — critical for endpoints that return mutable job state.
 */
export async function authFetcher(url: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("fl-token") : null;
  if (!token) return Promise.reject(new Error("No token"));

  let res = await fetch(url, { headers: getAuthHeaders(), cache: "no-store" });

  // Auto-refresh on 401
  if (res.status === 401 && typeof window !== "undefined") {
    const refreshToken = localStorage.getItem("fl-refresh-token");
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem("fl-token", data.access_token);
        // Retry with new token
        res = await fetch(url, {
          headers: { ...getAuthHeaders(), Authorization: `Bearer ${data.access_token}` },
          cache: "no-store",
        });
      } else {
        localStorage.removeItem("fl-token");
        localStorage.removeItem("fl-refresh-token");
        localStorage.removeItem("fl-user");
        throw new Error("Not authenticated");
      }
    }
  }

  if (res.status === 401) throw new Error("Not authenticated");
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export const api = {
  // Papers
  getPapers: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchAPI<any>(`/papers${qs ? `?${qs}` : ""}`);
  },
  getPaper: (id: number) => fetchAPI<any>(`/papers/${id}`),
  getPaperAnalysis: (id: number) => fetchAPI<any>(`/papers/${id}/analysis`),
  enrichPaper: (id: number) => fetchAPI<any>(`/papers/${id}/enrich`, { method: "POST" }),
  toggleDisabled: (id: number) => fetchAPI<any>(`/papers/${id}/toggle-disabled`, { method: "POST" }),
  uploadPdf: (paperId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/v1/analysis/${paperId}/upload-pdf`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    }).then((r) => {
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
      return r.json();
    });
  },

  // Analytics
  getOverview: () => fetchAPI<any>("/analytics/overview"),
  getTimeline: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchAPI<any>(`/analytics/timeline${qs ? `?${qs}` : ""}`);
  },
  getHeatmap: (year: number) => fetchAPI<any>(`/analytics/heatmap?year=${year}`),

  // Sources
  getSources: () => fetchAPI<any>("/sources"),
  getSourceLogs: (name: string, limit = 20) =>
    fetchAPI<any>(`/sources/${name}/logs?limit=${limit}`),

  // Topics
  getTopics: () => fetchAPI<any>("/topics"),
  createTopic: (data: any) =>
    fetchAPI<any>("/topics", { method: "POST", body: JSON.stringify(data) }),
  updateTopic: (id: number, data: any) =>
    fetchAPI<any>(`/topics/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTopic: (id: number) =>
    fetchAPI<any>(`/topics/${id}`, { method: "DELETE" }),

  // Discovery
  triggerDiscovery: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchAPI<any>(`/discovery/trigger${qs ? `?${qs}` : ""}`, { method: "POST" });
  },
  getDiscoveryStatus: () => fetchAPI<any>("/discovery/status"),

  // Reports
  getReports: () => fetchAPI<any>("/reports"),
  generateReport: () => fetchAPI<any>("/reports/generate", { method: "POST" }),

  // Auth - User management
  getUsers: () => fetchAPI<any>("/auth/users"),
  createUser: (data: any) =>
    fetchAPI<any>("/auth/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: any) =>
    fetchAPI<any>(`/auth/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    fetchAPI<any>("/auth/me/password", { method: "PUT", body: JSON.stringify(data) }),

  // Paper Analysis
  triggerAnalysis: (paperIds: number[], mode: string = "quick") =>
    fetch("/api/v1/analysis/trigger", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ paper_ids: paperIds, mode }),
      signal: AbortSignal.timeout(300000), // 5 min timeout for Claude Opus
    }).then((r) => {
      if (!r.ok) throw new Error(`API Error: ${r.status}`);
      return r.json();
    }),
  getAnalysisStatus: () => fetchAPI<any>("/analysis/status"),
  getAnalysisQueue: () => fetchAPI<any>("/analysis/queue"),
  getAnalysisReports: () => fetchAPI<any>("/analysis/reports"),
  getAnalysisHistory: (paperId: number) => fetchAPI<any>(`/analysis/${paperId}/history`),

  // Smart Search
  smartSearch: (data: { keywords: string[]; sources: string[]; max_per_source: number; mode?: string; filters?: { year_from?: number; year_to?: number; min_citations?: number; open_access?: boolean } }) =>
    fetch("/api/v1/smart-search/search", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(120000), // 2 min timeout for inline execution
      cache: "no-store",
    }).then((r) => {
      if (!r.ok) throw new Error(`API Error: ${r.status}`);
      return r.json();
    }),
  smartSearchStatus: (jobId: number) =>
    fetchAPI<any>(`/smart-search/status/${jobId}`),
  smartSearchRecent: () =>
    fetchAPI<any>("/smart-search/recent"),
  smartSearchResume: (jobId: number) =>
    fetchAPI<any>(`/smart-search/resume/${jobId}`, { method: "POST" }),
  smartSearchDelete: (jobId: number) =>
    fetchAPI<any>(`/smart-search/${jobId}`, { method: "DELETE" }),
  smartSave: (jobId: number, paperIndices: number[]) =>
    fetchAPI<any>("/smart-search/save", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, paper_indices: paperIndices }),
    }),
  smartSaveAsTopic: (data: { name: string; keywords: string[]; description?: string }) =>
    fetchAPI<any>("/smart-search/save-as-topic", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Labels & Notes
  getLabels: () => fetchAPI<any>("/labels"),
  createLabel: (data: { name: string; color: string }) =>
    fetchAPI<any>("/labels", { method: "POST", body: JSON.stringify(data) }),
  deleteLabel: (id: number) =>
    fetchAPI<any>(`/labels/${id}`, { method: "DELETE" }),
  getPaperLabels: (paperId: number) => fetchAPI<any>(`/labels/paper/${paperId}`),
  assignLabel: (paperId: number, labelId: number) =>
    fetchAPI<any>(`/labels/paper/${paperId}/${labelId}`, { method: "POST" }),
  batchAssignLabel: (paperIds: number[], labelId: number) =>
    fetchAPI<any>("/labels/batch-assign", {
      method: "POST",
      body: JSON.stringify({ paper_ids: paperIds, label_id: labelId }),
    }),
  removeLabel: (paperId: number, labelId: number) =>
    fetchAPI<any>(`/labels/paper/${paperId}/${labelId}`, { method: "DELETE" }),
  getNote: (paperId: number) => fetchAPI<any>(`/labels/note/${paperId}`),
  saveNote: (paperId: number, text: string) =>
    fetchAPI<any>(`/labels/note/${paperId}`, { method: "PUT", body: JSON.stringify({ text }) }),

  // Bibliography Import
  bibliographyExtract: (text: string) =>
    fetch("/api/v1/bibliography/extract", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(180000),
    }).then((r) => {
      if (!r.ok) throw new Error(`API Error: ${r.status}`);
      return r.json();
    }),
  bibliographySave: (papers: any[], labelId?: number) =>
    fetchAPI<any>("/bibliography/save", {
      method: "POST",
      body: JSON.stringify({ papers, label_id: labelId || null }),
    }),

  // Zotero
  syncToZotero: (paperIds: number[]) =>
    fetchAPI<any>("/zotero/sync", { method: "POST", body: JSON.stringify({ paper_ids: paperIds }) }),
  syncAllToZotero: () =>
    fetchAPI<any>("/zotero/sync-all", { method: "POST" }),
  syncAnalysisToZotero: (paperId: number) =>
    fetchAPI<any>(`/zotero/sync-analysis/${paperId}`, { method: "POST" }),
  removeFromZotero: (paperId: number) =>
    fetchAPI<any>(`/zotero/remove/${paperId}`, { method: "DELETE" }),

  // Comparison
  getComparisonData: (paperIds: number[]) =>
    fetchAPI<any>(`/comparison/papers?paper_ids=${paperIds.join(",")}`),
  getAllStructured: () => fetchAPI<any>("/comparison/all"),
  getResearchGaps: () => fetchAPI<any>("/comparison/gaps"),

  // Citations
  refreshCitationsBatch: (paperIds?: number[]) =>
    fetchAPI<any>("/papers/refresh-citations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper_ids: paperIds || null }),
    }),
  refreshCitationsSingle: (paperId: number) =>
    fetchAPI<any>(`/papers/${paperId}/refresh-citations`, { method: "POST" }),
  ratePaper: (paperId: number, rating: number) =>
    fetchAPI<any>(`/papers/${paperId}/rate?rating=${rating}`, { method: "POST" }),
  importByDoi: (doi: string) =>
    fetchAPI<any>("/papers/import-by-doi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doi }),
    }),

  // Exports
  getExportUrl: (format: "json" | "xlsx") => `${API_BASE}/exports/${format}`,
};
