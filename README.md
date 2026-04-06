# FL-RESEARCH-MONITOR

Automated scientific paper discovery and analysis system for **Federated Learning** research.

---

![System Architecture Diagram](img/Diagram.png)
*System architecture and data pipeline: from configurable research topics and 5 academic sources through cross-source deduplication, rule-based and LLM-powered analysis (Gemma4:e4b via Ollama), to an interactive Next.js dashboard with multi-layer network visualization, Zotero sync, and JWT-secured REST API.*

---

![Feature Infographic](img/Infographic.png)
*Complete feature overview: automated workflow covering discovery, analysis, and exploration across Federated Learning, FL in Healthcare, and European Health Data Space (EHDS) research topics. Includes Smart Search with multiple modes, keyword categorization, HTML/PDF report generation in Italian, and a responsive dark/light dashboard.*

---

Discovers papers from multiple academic databases, validates them, downloads PDFs, classifies by topic, generates AI-powered analysis reports in Italian, and provides an interactive web dashboard for exploration.

## Research Topics

The system monitors three configurable research areas (editable via Settings or Smart Search):

- **Federated Learning** — algorithms, systems, privacy, optimization
- **FL in Healthcare** — clinical studies, medical imaging, EHR, hospitals
- **European Health Data Space (EHDS)** — regulation, data governance, cross-border health data

Custom topics can be created from Smart Search results for targeted monitoring.

## Key Features

### Discovery & Data Collection
- **5 Academic Sources**: PubMed (NCBI), arXiv, bioRxiv/medRxiv, Semantic Scholar, IEEE Xplore
- **Smart Search**: ad-hoc search by keywords, title, author, or DOI across all sources
- **Auto-generated queries**: optimized per source from user keywords
- **Cross-source deduplication**: DOI exact match + title fuzzy matching (Levenshtein > 90%)
- **Paper validation**: DOI resolution, arXiv check, PMID verification
- **PDF download**: organized by year/source in `data/pdfs/`
- **Keyword extraction**: MeSH terms (PubMed), Index Terms (IEEE), Fields of Study (S2), categories (arXiv)

### Analysis & Reports
- **LLM-powered analysis**: individual paper reports via Gemma4:e4b (local Ollama)
- **Analysis in Italian**: 9 structured sections (Summary, Research Context, Methodology, Key Findings, FL Techniques, Relevance Assessment, Limitations, Healthcare/EHDS Applicability, Keyword Research)
- **Keyword categorization**: FL Core, Privacy, Healthcare, Systems, Methods — color-coded badges
- **HTML + PDF** report output
- **Background queue**: batch analysis processing (1 paper at a time)
- **Daily reports**: automated HTML summaries with stats and paper cards
- **Rule-based analysis**: FL technique detection (30+), methodology classification, relevance scoring

### Dashboard & Visualization
- **Interactive Dashboard**: stats cards, activity heatmap, timeline chart, source pie chart, topic treemap, keyword cloud, recent papers
- **Multi-layer Network**: Co-Keywords | Co-Authors | Citations tabs with D3.js force-directed graph
- **Network features**: zoom, drag, hover highlighting, click-to-navigate, filter by title/author/keyword/DOI
- **Papers page**: search by title/abstract, author, DOI; filter by topic, source, keyword; sortable, paginated
- **Paper detail**: full metadata, authors with ORCID, abstract, keywords (clickable), source-specific links (DOI, PubMed, arXiv, Semantic Scholar)
- **Dark/Light mode** with smooth transitions
- **Responsive design**

### Authentication & Security
- **JWT authentication**: multi-user with access tokens (24h) + refresh tokens (7 days)
- **Role-based access**: admin (full access) and viewer (read-only)
- **Admin panel**: user management (create, edit role, enable/disable)
- **Auto-seed**: default admin user created on first startup from `.env`
- **Protected routes**: all API endpoints require authentication

### Integrations
- **Zotero**: auto-sync papers to collection (Web API v3)
- **FedCompendium XL**: embedded educational module with learning paths
- **GitHub Actions**: CI pipeline + daily scheduled discovery
- **Export**: JSON + XLSX multi-sheet workbook

## Architecture

```
Frontend (Next.js 16 + React 19 + TypeScript + Tailwind CSS 4)
    ↓ REST API /api/v1/* (proxied via next.config.ts)
Backend (FastAPI + SQLAlchemy async + httpx + APScheduler)
    ↓ 5 API clients + services + Ollama LLM
Database (SQLite) + PDF Storage + HTML/PDF Reports
    ↓
Ollama (Gemma4:e4b) — local LLM for paper analysis
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2, React 19, TypeScript 6, Tailwind CSS 4, Recharts, D3.js 7, SWR |
| Backend | FastAPI, SQLAlchemy async, httpx, APScheduler, Jinja2, bcrypt, python-jose |
| Database | SQLite (aiosqlite) |
| LLM | Ollama + Gemma4:e4b (9.6 GB, local) |
| PDF Gen | weasyprint |
| CI/CD | GitHub Actions |

### Database Schema (11 tables)

```
papers → paper_authors → authors
papers → paper_sources
papers → paper_topics → topics
papers → synthetic_analyses
papers → analysis_queue
fetch_logs
daily_reports
smart_search_jobs
users
```

## Quick Start

### Prerequisites

- Python 3.11+ (conda environment: `fl-research-monitor`)
- Node.js 22+
- Ollama (optional, for LLM paper analysis)

### 1. Backend Setup

```bash
cd backend
conda activate fl-research-monitor
pip install -r requirements.txt
cp ../.env.example .env   # Edit with your settings
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### 3. Login

Open `http://localhost:3000` — you'll be redirected to the login page.
Use the credentials configured in your `.env` file (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Change password after first login via Settings > Change Password.

### 4. First Discovery

Go to **Discovery** page and click **"Run Discovery (All)"** to fetch papers from all sources.

## Environment Variables

```bash
# Authentication
JWT_SECRET_KEY=your-random-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
ADMIN_EMAIL=admin@localhost
API_SERVICE_KEY=                    # For GitHub Actions unattended access

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/db/research_monitor.db

# API Keys (optional but recommended)
NCBI_API_KEY=                       # PubMed — higher rate limits
SEMANTIC_SCHOLAR_API_KEY=           # Semantic Scholar — required for search
IEEE_API_KEY=                       # IEEE Xplore — required for IEEE search
ZOTERO_API_KEY=                     # Zotero — collection sync
ZOTERO_USER_ID=                     # Zotero — user ID

# App
APP_ENV=development                 # 'production' enables scheduler
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Storage
PDF_STORAGE_PATH=./data/pdfs
REGISTRY_PATH=./data/registry
REPORTS_PATH=./data/reports
```

## Dashboard Pages

| Page | Features |
|------|----------|
| **Dashboard** | Stats cards, activity heatmap, timeline chart, source pie chart, topic treemap, keyword cloud, recent papers, export buttons |
| **Discovery** | Smart Search (keywords/title/author/DOI), search mode selector, source checkboxes, Recent Searches queue, source health cards, fetch trigger, fetch history, recent papers per source |
| **Topics** | Topic cards with paper counts and progress bars, filtered paper list, keywords preview, source queries |
| **Papers** | Three tabs (All/API/Compendium), search by title/abstract/author/DOI, filter by topic/source/keyword, checkbox selection for batch analysis, sortable table, pagination |
| **Paper Detail** | Authors with ORCID links, abstract, clickable keywords, source badges, action buttons (Open Paper, View PDF, PubMed, arXiv, S2 links) |
| **Network** | Multi-layer graph (Co-Keywords/Co-Authors/Citations tabs), filter by title/author/keyword/DOI, adjustable paper count and min shared threshold, zoom/drag/hover highlighting, click-to-navigate, stats bar |
| **Compendium** | Embedded FedCompendium XL (React app) with educational content and learning paths |
| **Reports** | Daily/Analysis tabs, inline HTML viewer, PDF download, report generation, analysis queue status |
| **Settings** | Topic CRUD, user management (admin), change password, API keys reference, system info |

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | JWT login |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Current user profile |
| PUT | `/api/v1/auth/me/password` | Change own password |
| GET | `/api/v1/auth/users` | List users (admin) |
| POST | `/api/v1/auth/users` | Create user (admin) |
| PUT | `/api/v1/auth/users/{id}` | Update user role/status (admin) |

### Papers & Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/papers` | List papers (paginated, filterable by topic/source/keyword/author/doi) |
| GET | `/api/v1/papers/{id}` | Paper detail with authors, topics, sources |
| GET | `/api/v1/papers/keywords/all` | All keywords with frequency counts |
| GET | `/api/v1/analytics/overview` | Dashboard KPIs |
| GET | `/api/v1/analytics/timeline` | Discovery timeline data |
| GET | `/api/v1/analytics/heatmap` | GitHub-style activity heatmap |

### Discovery & Smart Search
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/discovery/trigger` | Start topic-based discovery (admin) |
| GET | `/api/v1/discovery/status` | Discovery running status |
| POST | `/api/v1/smart-search/search` | Smart Search by keywords/title/author/DOI |
| GET | `/api/v1/smart-search/status/{id}` | Search job status and results |
| GET | `/api/v1/smart-search/recent` | Recent search history |
| POST | `/api/v1/smart-search/save` | Save selected results to DB |
| POST | `/api/v1/smart-search/save-as-topic` | Create topic from search keywords |
| POST | `/api/v1/smart-search/resume/{id}` | Retry failed search |

### Network, Reports & Analysis
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/network/co-keywords` | Co-keyword network graph data |
| GET | `/api/v1/network/co-authors` | Co-author network graph data |
| GET | `/api/v1/network/citations` | Citation network (future, requires S2) |
| POST | `/api/v1/analysis/trigger` | Queue papers for LLM analysis (admin) |
| GET | `/api/v1/analysis/{id}/html` | Analysis report HTML |
| GET | `/api/v1/analysis/{id}/pdf` | Analysis report PDF download |
| GET | `/api/v1/reports` | List daily reports |
| POST | `/api/v1/reports/generate` | Generate daily report |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/topics` | List topics |
| POST | `/api/v1/topics` | Create topic (admin) |
| GET | `/api/v1/sources` | Source health and stats |
| GET | `/api/v1/exports/json` | Download JSON registry |
| GET | `/api/v1/exports/xlsx` | Download XLSX workbook |

## LLM Paper Analysis

The system uses **Gemma4:e4b** (Google, 4.5B parameters) running locally via Ollama for generating detailed paper analysis reports in Italian.

### Setup

```bash
# Install/update Ollama from https://ollama.com/download
ollama pull gemma4:e4b    # 9.6 GB download
```

### Usage

1. Go to **Papers** page
2. Select papers with checkboxes
3. Click **"Genera Analisi"**
4. Reports appear in **Reports > Analysis** tab when complete (~5 min per paper)

### Report Sections

1. **Summary** — 3-4 sentence synthesis
2. **Research Context** — problem and literature gap
3. **Methodology** — approach and techniques
4. **Key Findings** — quantitative results
5. **FL Techniques** — identified FL methods and their role
6. **Relevance Assessment** — Alta/Media/Bassa with motivation
7. **Limitations & Future Work**
8. **Healthcare Applicability** — EHDS context
9. **Keyword Research** — analysis per keyword

## Source Status

| Source | Search | Keywords Extracted | API Key |
|--------|--------|-------------------|---------|
| PubMed | Title/Abstract, Author, DOI | MeSH + Author Keywords | Optional (rate limits) |
| arXiv | Title/Abstract | Categories → readable names | Not needed |
| bioRxiv/medRxiv | Keywords only | Category | Not needed |
| Semantic Scholar | Full text, DOI lookup | Fields of Study + s2Fields | Recommended (rate limits) |
| IEEE Xplore | All modes | Index Terms (Author, IEEE, INSPEC) | Required |

## CLI Scripts

```bash
cd backend
conda activate fl-research-monitor

# Discover papers (all topics, all sources)
python scripts/fetch_papers.py --max-per-source 50

# Specific topic and source
python scripts/fetch_papers.py --topic "Federated Learning" --source pubmed

# Validate papers (DOI/arXiv/PMID resolution)
python scripts/validate_papers.py

# Generate JSON + XLSX exports
python scripts/generate_registry.py
```

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| v0.1.0 | 2026-03-29 | Foundation: 5 API clients, FastAPI, Next.js dashboard |
| v0.2.0 | 2026-03-29 | PDF management, validation, XLSX export |
| v0.3.0 | 2026-03-29 | D3 network, discovery triggers, topic CRUD, themes |
| v0.4.0 | 2026-03-29 | Analysis, reports, Zotero, scheduler |
| v1.0.0 | 2026-03-29 | Production-ready release |
| v1.1.0 | 2026-03-29 | FedCompendium XL embedded |
| v1.2.0 | 2026-03-29 | Unified papers, learning path, compendium integration |
| v1.3.x | 2026-03-29 | Keyword cloud, real API keywords, learning path badges |
| v1.4.0 | 2026-04-06 | JWT auth, multi-user, RBAC, login page |
| v1.5.0 | 2026-04-06 | LLM paper analysis (Gemma4), keyword categorization, PDF reports |
| v1.6.0 | 2026-04-06 | Smart Search, search modes, multi-layer network, search queue |

## Project Structure

```
RESerch_MON/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI route handlers
│   │   ├── clients/        # API source clients (PubMed, arXiv, S2, etc.)
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic response schemas
│   │   ├── services/       # Business logic (discovery, analysis, reports)
│   │   ├── tasks/          # Scheduler jobs
│   │   └── utils/
│   ├── scripts/            # CLI tools
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router pages
│   │   ├── components/     # React components (layout, charts, dashboard)
│   │   ├── hooks/          # SWR data fetching hooks
│   │   └── lib/            # API client, auth, types, utils
│   ├── public/             # Static assets + FedCompendium build
│   ├── package.json
│   └── next.config.ts
├── _fedcompendiumXL_CC/    # FedCompendium XL source code
├── .github/workflows/      # CI + daily discovery
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
├── PROGRESS.md
└── .env.example
```

## License

This project is for academic research purposes.
