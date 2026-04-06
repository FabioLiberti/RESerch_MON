import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import type { OverviewStats } from "@/lib/types";

export function useOverview() {
  return useSWR<OverviewStats>("/api/v1/analytics/overview", authFetcher, {
    refreshInterval: 60000,
  });
}

export function useTimeline(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useSWR(`/api/v1/analytics/timeline${qs ? `?${qs}` : ""}`, authFetcher);
}

export function useHeatmap(year: number) {
  return useSWR(`/api/v1/analytics/heatmap?year=${year}`, authFetcher);
}

export function useSources() {
  return useSWR("/api/v1/sources", authFetcher);
}

export function useTopics() {
  return useSWR("/api/v1/topics", authFetcher);
}
