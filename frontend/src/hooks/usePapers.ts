import useSWR from "swr";
import { api } from "@/lib/api";
import type { PaperListResponse, PaperDetail } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePapers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useSWR<PaperListResponse>(`/api/v1/papers${qs ? `?${qs}` : ""}`, fetcher);
}

export function usePaper(id: number | null) {
  return useSWR<PaperDetail>(id ? `/api/v1/papers/${id}` : null, fetcher);
}
