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
      } else {
        // Refresh failed — clear auth
        localStorage.removeItem("fl-token");
        localStorage.removeItem("fl-refresh-token");
        localStorage.removeItem("fl-user");
        window.location.href = "/login";
        throw new Error("Session expired");
      }
    }

    // No refresh token — redirect to login
    localStorage.removeItem("fl-token");
    localStorage.removeItem("fl-user");
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** SWR-compatible fetcher that includes auth headers */
export function authFetcher(url: string) {
  return fetch(url, { headers: getAuthHeaders() }).then((r) => {
    if (r.status === 401) {
      window.location.href = "/login";
      throw new Error("Not authenticated");
    }
    if (!r.ok) throw new Error(`API Error: ${r.status}`);
    return r.json();
  });
}

export const api = {
  // Papers
  getPapers: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchAPI<any>(`/papers${qs ? `?${qs}` : ""}`);
  },
  getPaper: (id: number) => fetchAPI<any>(`/papers/${id}`),
  getPaperAnalysis: (id: number) => fetchAPI<any>(`/papers/${id}/analysis`),

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
  triggerAnalysis: (paperIds: number[]) =>
    fetchAPI<any>("/analysis/trigger", {
      method: "POST",
      body: JSON.stringify({ paper_ids: paperIds }),
    }),
  getAnalysisStatus: () => fetchAPI<any>("/analysis/status"),
  getAnalysisQueue: () => fetchAPI<any>("/analysis/queue"),
  getAnalysisReports: () => fetchAPI<any>("/analysis/reports"),

  // Exports
  getExportUrl: (format: "json" | "xlsx") => `${API_BASE}/exports/${format}`,
};
