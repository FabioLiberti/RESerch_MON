# FL-RESEARCH-MONITOR

Automated scientific paper discovery system for Federated Learning research.

Queries **PubMed**, **Semantic Scholar**, **arXiv**, **bioRxiv/medRxiv**, and **IEEE Xplore** to discover, validate, analyze, and catalog papers on:

- **Federated Learning** (general)
- **FL in Healthcare** (clinical studies, medical imaging, EHR)
- **European Health Data Space** (EHDS)

Topics are configurable — add, edit, or remove via the Settings page.

## Features

- **5 API Sources** with rate limiting, retry, and cross-source deduplication
- **Paper Validation** via DOI resolution, arXiv check, PMID verification
- **PDF Download** with organized storage (`data/pdfs/{year}/{source}/`)
- **Synthetic Analysis**: FL technique detection (30+), methodology classification, key findings extraction, relevance scoring
- **JSON + XLSX Export** with multi-sheet workbook (AllPapers, ByTopic, BySource, Statistics)
- **Zotero Integration** — auto-sync papers to a collection
- **Daily HTML Reports** with dark-theme styling and embedded analyses
- **Interactive Dashboard**: stats, heatmap, timeline, source pie chart, topic treemap, recent papers
- **D3.js Citation Network** with drag-and-drop, tooltips
- **Dark/Light Mode** + responsive design
- **Scheduled Automation** via APScheduler + GitHub Actions

## Quick Start

### Prerequisites

- Python 3.11+ (via conda: `conda activate fl-research-monitor`)
- Node.js 22+

### Backend

```bash
cd backend
conda activate fl-research-monitor
pip install -r requirements.txt
cp ../.env.example .env   # Edit with your API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Fetch Papers

```bash
cd backend

# All topics, all sources
python scripts/fetch_papers.py

# Specific topic and source
python scripts/fetch_papers.py --topic "Federated Learning" --source pubmed --max-per-source 50

# Validate unvalidated papers
python scripts/validate_papers.py

# Generate JSON + XLSX exports
python scripts/generate_registry.py
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full technical details.

```
Frontend (Next.js 14 + React + TypeScript + Tailwind)
    ↓ REST API /api/v1/*
Backend (FastAPI + SQLAlchemy + httpx)
    ↓ 5 API clients + 9 services
Database (SQLite/PostgreSQL) + PDF Storage + Reports
```

## Dashboard Pages

| Page | Features |
|------|----------|
| **Dashboard** | Stats cards, activity heatmap, timeline chart, source pie, topic treemap |
| **Papers** | Search, filter by topic/source, sortable table, pagination, export |
| **Paper Detail** | Authors, abstract, metadata, sources, PDF link |
| **Discovery** | Source health cards, fetch trigger, per-source fetch, history logs |
| **Topics** | Topic cards with paper counts, filtered paper list, source queries |
| **Network** | D3.js force graph (co-topic), node size = citations |
| **Reports** | Report list, inline HTML viewer, generate button |
| **Settings** | Topic CRUD (create/edit/delete), API keys info |

## API Keys

| Service | Variable | Required |
|---------|----------|----------|
| NCBI / PubMed | `NCBI_API_KEY` | Optional (higher rate limits) |
| Semantic Scholar | `SEMANTIC_SCHOLAR_API_KEY` | Optional (higher rate limits) |
| IEEE Xplore | `IEEE_API_KEY` | Yes (for IEEE search) |
| Zotero | `ZOTERO_API_KEY` + `ZOTERO_USER_ID` | Optional (collection sync) |

## Automation

- **GitHub Actions**: Daily paper discovery at 06:00 UTC + CI on push
- **APScheduler**: In-process scheduling (production mode)
- **Full pipeline**: discover → validate → analyze → export → report
