const API_BASE = "/api/v1";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
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

  // Exports
  getExportUrl: (format: "json" | "xlsx") => `${API_BASE}/exports/${format}`,
};
