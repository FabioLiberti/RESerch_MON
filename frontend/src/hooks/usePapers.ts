import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import type { PaperListResponse, PaperDetail } from "@/lib/types";

export function usePapers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useSWR<PaperListResponse>(`/api/v1/papers${qs ? `?${qs}` : ""}`, authFetcher);
}

export function usePaper(id: number | null) {
  return useSWR<PaperDetail>(id ? `/api/v1/papers/${id}` : null, authFetcher);
}
