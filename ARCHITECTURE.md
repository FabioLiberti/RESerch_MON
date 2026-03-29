# FL-RESEARCH-MONITOR — Architecture Document

**Version:** 0.1.0
**Last Updated:** 2026-03-29

## Overview

FL-RESEARCH-MONITOR is an automated scientific paper discovery and monitoring system focused on Federated Learning research. It queries authoritative academic APIs, validates paper existence, downloads PDFs, catalogs metadata, and presents findings through an interactive analytics dashboard.

## System Architecture

```
┌──────────────────────────────────────────────┐
│           Next.js + React Frontend           │
│   TypeScript │ Tailwind CSS │ shadcn/ui      │
│   Recharts │ D3.js │ SWR │ TanStack Table   │
│              Port 3000                        │
└─��─────────────────┬──────────────────────────┘
                    │ REST API /api/v1/*
                    │ (proxied via next.config.ts)
┌───────────────────▼──────────────────────────┐
│          Python FastAPI Backend               │
│   SQLAlchemy (async) │ APScheduler           │
│   httpx │ openpyxl │ PyMuPDF │ rapidfuzz    │
│              Port 8000                        │
├──────────────────────────────────────────────┤
│  API Clients (app/clients/):                 │
│  ┌─────────┐ ┌──────────┐ ┌─────────���─┐    │
│  │ PubMed  │ │ Semantic │ │   arXiv   │    │
│  │ (NCBI)  │ │ Scholar  │ │ (Atom)    │    │
│  └─────────┘ └──────────┘ └───────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐    │
│  │ bioRxiv/ │ │  IEEE    │ │  Zotero   │    │
│  │ medRxiv  │ │ Xplore   │ │  (sync)   │    │
│  └──────────┘ └──────────┘ └───────────┘    │
├──────────────────────────────────────────────┤
│  Services (app/services/):                    │
│  Discovery │ Deduplication │ PDF Manager     │
│  Analysis │ Topic Classifier │ Export        │
├──────────────────────────────────────────────┤
│  Database: SQLite (dev) / PostgreSQL (prod)  │
│  Storage: data/pdfs/ │ data/registry/        │
└──────────────────────────────────────────────┘
```

## Research Topics (Configurable)

Default topics seeded on first run:

| # | Topic | Description |
|---|-------|-------------|
| 1 | **Federated Learning** | General FL research: algorithms, systems, privacy, optimization |
| 2 | **FL in Healthcare** | FL applied to healthcare, clinical studies, medical imaging, EHR |
| 3 | **European Health Data Space** | EHDS regulation, health data governance, cross-border data |

Topics are configurable via API (`/api/v1/topics`) and frontend Settings page. Each topic defines per-source search queries.

## Data Sources

| Source | API | Rate Limit | Auth | PDF Access |
|--------|-----|-----------|------|------------|
| PubMed | NCBI E-utilities | 10/s (with key), 3/s (without) | Optional API key | Via PMC Open Access |
| Semantic Scholar | Graph API v1 | 1/s (with key) | Optional API key | openAccessPdf field |
| arXiv | Atom feed | 1/3s | None | Direct PDF links |
| bioRxiv/medRxiv | REST API | 1/s | None | Direct PDF links |
| IEEE Xplore | REST API | ~200/day | Required API key | Stamp links (no direct) |

## Backend Architecture

### Directory Structure

```
backend/
├── app/
│   ├── main.py          # FastAPI app factory, lifespan, CORS
│   ├── config.py         # pydantic-settings from .env
│   ├── database.py       # SQLAlchemy async engine/session
│   ├── models/           # SQLAlchemy ORM (Paper, Author, Topic, etc.)
│   ├── schemas/          # Pydantic request/response schemas
│   ├── api/              # FastAPI routers (papers, analytics, sources, topics)
│   ├── clients/          # External API clients (all inherit BaseAPIClient)
│   ├── services/         # Business logic (discovery, dedup, PDF, export)
│   ├── tasks/            # Scheduled jobs (APScheduler)
│   └── utils/            # Rate limiter, validators, text processing
├── scripts/              # CLI tools (fetch_papers.py, validate_papers.py)
├── tests/
├── pyproject.toml
└── requirements.txt
```

### Key Design Patterns

- **BaseAPIClient**: All API clients inherit from `base.py`, which provides rate limiting (token-bucket), exponential backoff retry (3 attempts), and structured logging.
- **RawPaperResult**: Normalized data class that all clients return, regardless of source-specific formats.
- **Deduplication**: Cross-source via DOI exact match + title Levenshtein similarity (threshold: 90%).
- **Validation**: Every paper must have a verifiable identifier (DOI, PMID, arXiv ID). Papers are validated via DOI resolution or source-specific checks.

### Database Schema

Core tables: `papers`, `authors`, `paper_authors`, `paper_sources`, `topics`, `paper_topics`, `synthetic_analyses`, `fetch_logs`, `daily_reports`.

JSON fields (stored as Text, exposed via properties): `external_ids`, `keywords`, `source_queries`, `key_findings`, `fl_techniques`.

## Frontend Architecture

### Stack

- **Next.js 14+** App Router with Server Components
- **Tailwind CSS** for styling (dark theme by default)
- **Recharts** for charts (AreaChart, PieChart)
- **D3.js** for citation network visualization
- **SWR** for data fetching with caching and revalidation
- **TanStack Table** for advanced table interactions

### Pages

| Route | Page | Components |
|-------|------|------------|
| `/` | Dashboard | StatsCards, TimelineChart, SourcePieChart, TopicTreemap, RecentPapers |
| `/papers` | Paper list | Search, filters (topic, source), sortable table, export buttons |
| `/papers/[id]` | Paper detail | Authors, abstract, metadata, sources, PDF link |
| `/discovery` | Discovery monitor | Source health cards, fetch logs |
| `/topics` | Topic overview | Topic cards with keywords and source queries |
| `/network` | Citation network | D3 force graph (v0.3.0) |
| `/reports` | Reports | Report list and viewer (v0.4.0) |
| `/settings` | Configuration | API keys info, scheduling config |

## API Contract

Base: `/api/v1`

### Core Endpoints

```
GET  /papers                  # List papers (paginated, filterable, sortable)
GET  /papers/{id}             # Paper detail with authors/topics
GET  /papers/{id}/analysis    # Synthetic analysis
GET  /analytics/overview      # Dashboard KPIs
GET  /analytics/timeline      # Papers over time
GET  /analytics/heatmap       # Activity heatmap
GET  /sources                 # Source status
GET  /sources/{name}/logs     # Fetch history
GET  /topics                  # List topics
POST /topics                  # Create topic
PUT  /topics/{id}             # Update topic
DELETE /topics/{id}           # Delete topic
GET  /health                  # Health check
```

## Automation

- **GitHub Actions**: CI on push/PR, daily scheduled fetch at 06:00 UTC
- **APScheduler**: In-process scheduling when backend runs persistently
- **CLI**: `python scripts/fetch_papers.py --topic "Federated Learning" --source pubmed`

## Data Storage

```
data/
├── pdfs/           # Downloaded papers organized by year/source (gitignored)
├── registry/       # Generated JSON + XLSX exports
├── reports/        # Generated daily/weekly reports
└── db/
    └── research_monitor.db   # SQLite database (gitignored)
```

## Deployment

- **Development**: Backend on port 8000, Frontend on port 3000 with API proxy
- **Production**: Frontend on Vercel, Backend on Railway/Render, DB on Supabase

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-29 | Initial scaffold: backend + frontend + 5 API clients + dashboard |
