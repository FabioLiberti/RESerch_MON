# FL-RESEARCH-MONITOR — Architecture Document

**Version:** 1.0.0
**Last Updated:** 2026-03-29

## Overview

FL-RESEARCH-MONITOR is an automated scientific paper discovery and monitoring system for Federated Learning research. It queries 5 authoritative academic APIs, validates paper existence, downloads PDFs, generates synthetic analyses, and presents findings through an interactive analytics dashboard.

## System Architecture

```
┌──────────────────────────────────────────────┐
│           Next.js + React Frontend           │
│   TypeScript │ Tailwind CSS │ Recharts │ D3  │
│   SWR │ TanStack Table │ Dark/Light theme   │
│                 Port 3000                     │
└──────────────────┬───────────────────────────┘
                   │ REST API /api/v1/*
┌──────────────────▼───────────────────────────┐
│          Python FastAPI Backend               │
│   SQLAlchemy async │ APScheduler │ Jinja2    │
│   httpx │ openpyxl │ PyMuPDF │ rapidfuzz    │
│                 Port 8000                     │
├──────────────────────────────────────────────┤
│  API Clients (app/clients/):                 │
│  PubMed │ Semantic Scholar │ arXiv           │
│  bioRxiv/medRxiv │ IEEE Xplore │ Zotero     │
├──────────────────────────────────────────────┤
│  Services (app/services/):                    │
│  Discovery │ Deduplication │ PDF Manager     │
│  Validator │ Topic Classifier │ Analysis     │
│  Export │ Report Generator │ Zotero Sync     │
├──────────────────────────────────────────────┤
│  Database: SQLite (dev) / PostgreSQL (prod)  │
│  Storage: data/pdfs/ │ data/registry/        │
│  Reports: data/reports/                       │
└──────────────────────────────────────────────┘
```

## Research Topics (Configurable)

| # | Topic | Description |
|---|-------|-------------|
| 1 | **Federated Learning** | General FL: algorithms, systems, privacy, optimization |
| 2 | **FL in Healthcare** | FL in healthcare, clinical studies, medical imaging, EHR |
| 3 | **European Health Data Space** | EHDS regulation, health data governance |

Topics are configurable via API and Settings page. Each topic has per-source search queries.

## Data Sources

| Source | API | Rate Limit | Auth | PDF Access |
|--------|-----|-----------|------|------------|
| PubMed | NCBI E-utilities | 10/s (key), 3/s | Optional | Via PMC OA |
| Semantic Scholar | Graph API v1 | 1/s (key) | Optional | openAccessPdf |
| arXiv | Atom feed | 1/5s | None | Direct PDF |
| bioRxiv/medRxiv | REST API | 1/s | None | Direct PDF |
| IEEE Xplore | REST API | ~200/day | Required | Stamp links |

## Backend Architecture

```
backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan, scheduler
│   ├── config.py             # pydantic-settings from .env
│   ├── database.py           # SQLAlchemy async engine/session
│   ├── models/               # 9 tables: papers, authors, topics, etc.
│   ├── schemas/              # Pydantic request/response schemas
│   ├── api/                  # Routers: papers, analytics, sources,
│   │                         #   topics, exports, discovery, reports
│   ├── clients/              # API clients (all inherit BaseAPIClient)
│   │   ├── base.py           # Rate limiting, retry, backoff
│   │   ├── pubmed.py         # NCBI E-utilities
│   │   ├── semantic_scholar.py
│   │   ├── arxiv.py          # Atom feed parser
│   │   ├── biorxiv.py        # bioRxiv/medRxiv
│   │   ├── ieee.py           # IEEE Xplore
│   │   └── zotero.py         # Zotero Web API v3
│   ├── services/
│   │   ├── discovery.py      # Multi-source orchestrator
│   │   ├── deduplication.py  # DOI + title Levenshtein (>90%)
│   │   ├── pdf_manager.py    # Download, validate, organize
│   │   ├── validator.py      # DOI/arXiv/PMID resolution
│   │   ├── topic_classifier.py # Keyword-weighted scoring
│   │   ├── analysis.py       # FL technique detection, summaries
│   │   ├── export_service.py # JSON + multi-sheet XLSX
│   │   ├── report_generator.py # Jinja2 HTML reports
│   │   └── zotero_sync.py    # Collection sync
│   └── tasks/
│       └── scheduler.py      # APScheduler daily job
├── scripts/
│   ├── fetch_papers.py       # CLI discovery
│   ├── validate_papers.py    # CLI validation
│   └── generate_registry.py  # CLI export
└── tests/
```

### Key Patterns

- **BaseAPIClient**: Rate limiting (token-bucket), exponential backoff (3 retries)
- **RawPaperResult**: Normalized data class all clients return
- **Deduplication**: DOI exact match + title Levenshtein >90%
- **Validation**: DOI resolution (302 from doi.org), arXiv abs check, PMID esummary
- **Analysis**: Rule-based NLP: 30+ FL techniques, methodology classification, key findings extraction, relevance scoring

### Database Schema (9 tables)

`papers` → `paper_authors` → `authors`
`papers` → `paper_sources`
`papers` → `paper_topics` → `topics`
`papers` → `synthetic_analyses`
`fetch_logs`, `daily_reports`

## Frontend Architecture

```
frontend/src/
├── app/                    # Next.js App Router (8 pages)
│   ├── page.tsx            # Dashboard: stats, heatmap, timeline, pie, treemap
│   ├── papers/             # Paper list + detail
│   ├── discovery/          # Source cards, fetch trigger, logs
│   ├── topics/             # Topic cards, filtered papers, queries
│   ├── network/            # D3 force-directed graph
│   ├── reports/            # Report list + iframe viewer
│   └── settings/           # Topic CRUD, API keys info
├── components/
│   ├── layout/             # Sidebar, Header
│   ├── dashboard/          # StatsCards, TimelineChart, SourcePieChart, etc.
│   └── charts/             # HeatmapCalendar, CitationNetwork
├── hooks/                  # SWR hooks (usePapers, useAnalytics)
└── lib/                    # API client, types, utils
```

## API Contract

Base: `/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/papers` | GET | List papers (paginated, filterable) |
| `/papers/{id}` | GET | Paper detail with authors/topics |
| `/papers/{id}/analysis` | GET | Synthetic analysis |
| `/analytics/overview` | GET | Dashboard KPIs |
| `/analytics/timeline` | GET | Papers over time |
| `/analytics/heatmap` | GET | Activity heatmap |
| `/sources` | GET | Source status |
| `/sources/{name}/logs` | GET | Fetch history |
| `/topics` | GET/POST | List/create topics |
| `/topics/{id}` | PUT/DELETE | Update/delete topic |
| `/discovery/trigger` | POST | Start discovery (background) |
| `/discovery/status` | GET | Check if running |
| `/exports/json` | GET | Download JSON registry |
| `/exports/xlsx` | GET | Download XLSX registry |
| `/reports` | GET | List reports |
| `/reports/{date}/html` | GET | View HTML report |
| `/reports/generate` | POST | Trigger report generation |
| `/health` | GET | Health check |

## Automation

- **APScheduler**: Daily at 06:00 UTC (discover → validate → analyze → export → report)
- **GitHub Actions**: CI on push, daily scheduled-fetch with artifacts
- **CLI**: `fetch_papers.py`, `validate_papers.py`, `generate_registry.py`

## Data Storage

```
data/
├── pdfs/           # {year}/{source}/{title}.pdf (gitignored)
├── registry/       # fl_research_registry.json + .xlsx
├── reports/        # report_YYYY-MM-DD.html
└── db/             # research_monitor.db (gitignored)
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-29 | Initial scaffold: backend + frontend + 5 API clients |
| 0.2.0 | 2026-03-29 | PDF management, validation, exports, topic classification |
| 0.3.0 | 2026-03-29 | Enhanced dashboard, D3 network, discovery triggers, topic CRUD |
| 0.4.0 | 2026-03-29 | Analysis, reports, Zotero, scheduler |
| 1.0.0 | 2026-03-29 | Production-ready release |

## Environment

- **Conda**: `fl-research-monitor` (Python 3.11)
- **Node**: 22+
- **GitHub**: github.com/FabioLiberti/RESerch_MON
