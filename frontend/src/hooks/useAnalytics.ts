import useSWR from "swr";
import type { OverviewStats } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useOverview() {
  return useSWR<OverviewStats>("/api/v1/analytics/overview", fetcher, {
    refreshInterval: 60000,
  });
}

export function useTimeline(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useSWR(`/api/v1/analytics/timeline${qs ? `?${qs}` : ""}`, fetcher);
}

export function useHeatmap(year: number) {
  return useSWR(`/api/v1/analytics/heatmap?year=${year}`, fetcher);
}

export function useSources() {
  return useSWR("/api/v1/sources", fetcher);
}

export function useTopics() {
  return useSWR("/api/v1/topics", fetcher);
}
