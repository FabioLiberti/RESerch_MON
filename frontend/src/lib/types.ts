export interface Paper {
  id: number;
  doi: string | null;
  title: string;
  publication_date: string | null;
  journal: string | null;
  paper_type: string;
  open_access: boolean;
  has_pdf: boolean;
  citation_count: number;
  sources: string[];
  topics: string[];
  keywords: string[];
  created_at: string;
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

export interface PaperDetail extends Paper {
  abstract: string | null;
  volume: string | null;
  pages: string | null;
  pdf_url: string | null;
  external_ids: Record<string, string | null>;
  validated: boolean;
  zotero_key: string | null;
  authors: Author[];
  source_details: PaperSource[];
  updated_at: string;
}

export interface Author {
  id: number;
  name: string;
  affiliation: string | null;
  orcid: string | null;
}

export interface PaperSource {
  source_name: string;
  source_id: string | null;
  fetched_at: string | null;
}

export interface TopicAssignment {
  topic_id: number;
  topic_name: string;
  confidence: number;
}

export interface PaperListResponse {
  items: Paper[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface OverviewStats {
  total_papers: number;
  papers_today: number;
  papers_this_week: number;
  papers_this_month: number;
  total_with_pdf: number;
  sources: { name: string; count: number; last_fetch: string | null }[];
  topics: { name: string; count: number }[];
}

export interface TimelinePoint {
  date: string;
  count: number;
  source?: string;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface Topic {
  id: number;
  name: string;
  description: string | null;
  keywords: string[];
  source_queries: Record<string, string>;
  parent_id: number | null;
}

export interface FetchLogEntry {
  id: number;
  source_name: string;
  query_topic: string;
  started_at: string;
  completed_at: string | null;
  papers_found: number;
  papers_new: number;
  status: string;
  errors: string | null;
}

export interface SourceInfo {
  name: string;
  paper_count: number;
  last_fetch: string | null;
  last_status: string;
}

export interface AnalysisQueueItem {
  id: number;
  paper_id: number;
  paper_title: string | null;
  status: "pending" | "running" | "done" | "failed";
  error_message: string | null;
  html_path: string | null;
  pdf_path: string | null;
  created_at: string;
  completed_at: string | null;
}
