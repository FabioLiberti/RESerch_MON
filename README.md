# FL-RESEARCH-MONITOR

Automated scientific paper discovery, analysis, and **structured review framework** for **Federated Learning** research, with a focus on healthcare applications and the **European Health Data Space (EHDS)**.

FL-Research-Monitor continuously queries seven major academic databases — **PubMed**, **arXiv**, **bioRxiv/medRxiv**, **Semantic Scholar**, **IEEE Xplore**, and **Elsevier (Scopus)** — to discover new publications matching configurable research topics. Discovered papers are automatically deduplicated across sources, validated via DOI/arXiv/PMID resolution, classified into research topics, and enriched with keywords from each source's metadata.

The framework provides three distinct review surfaces — **Meta Review** of LLM-generated extended abstracts, **Peer Review** of unpublished manuscripts for academic journals (with verbatim journal templates such as IEEE T-AI), and **Paper Quality Review** for versioned scientific quality assessment of published papers — each producing formal academic-grade PDF/LaTeX/Markdown/TXT reports with configurable author signature, suitable for sharing with scientific tutors.

Paper analysis runs on two complementary LLM tracks: **Gemma4:e4b** (local Ollama) for batch background analysis in Italian, and **Claude Opus 4.6** with **extended thinking** for high-stakes admin-only tasks (peer review drafting, paper quality assessment, extended abstract generation). All review surfaces support **side-by-side editing** with the source PDF, in-place editing of LLM output (with versioning), and synchronized export to four formats.

An interactive **Next.js dashboard** provides real-time exploration with stats cards, activity heatmaps, timeline charts, keyword clouds, a **multi-layer citation network**, and a unified **Zotero integration** that auto-syncs both metadata and shareable analysis artifacts (Extended Abstract + validation report) without ever exposing the obviously LLM-generated working notes.

---

![System Architecture Diagram](img/Diagram.png)
*System architecture and data pipeline.*

---

![Feature Infographic](img/Infographic.png)
*Complete feature overview.*

---

## Table of Contents

- [Research Topics](#research-topics)
- [Three Review Surfaces](#three-review-surfaces)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Dashboard Pages](#dashboard-pages)
- [API Endpoints](#api-endpoints)
- [LLM Paper Analysis](#llm-paper-analysis)
- [Source Status](#source-status)
- [CLI Scripts](#cli-scripts)
- [Version History](#version-history)
- [Project Structure](#project-structure)
- [License](#license)

---

## Research Topics

The system monitors three configurable research areas (editable via Settings or Smart Search):

- **Federated Learning** — algorithms, systems, privacy, optimization
- **FL in Healthcare** — clinical studies, medical imaging, EHR, hospitals
- **European Health Data Space (EHDS)** — regulation, data governance, cross-border health data

Custom topics can be created from Smart Search results for targeted monitoring.

## Three Review Surfaces

The framework distinguishes three different review intents, each with its own workflow, rubric, output, and visibility rules:

### 1. Meta Review — validating LLM Extended Abstracts

The Extended Abstract is the only LLM-generated artifact actually shared with academic tutors. Before sharing it, the user runs a structured **Meta Review** to verify the synthesis is faithful, complete, and properly formatted. Each of the 9 EXT.ABS sections (Abstract → Originality) is scored 1–5 with a per-section comment, plus an overall General notes score. The reviewer can **edit any section in-place** during review: edits are persisted as a new version of the analysis (`engine=reviewer-edit`), keeping the LLM original in history for audit. The Save button automatically syncs the corrected document and the validation report to Zotero.

- Sidebar: **Meta Review** — queue of pending EXT.ABS validations, grouped by paper, sorted by paper rating
- UI: side-by-side modal — analysis HTML on the left (with optional tab to the source PDF), rubric + status + computed/reviewer scores on the right
- Status: Validate / Needs Revision / Reject (auto-suggested from reviewer score, manually overridable)
- Output on Zotero: `analysis_extended_{id}.pdf` (the corrected version) + `validation_{id}.pdf` (the formal review report)

### 2. Peer Review — confidential review of unpublished manuscripts

Dedicated, completely isolated module for reviewing manuscripts that journals send you to evaluate. Confidential by design: never indexed in topics, never synced to Zotero, never mixed with the public bibliography. Stored in `data/peer-review/{id}/` with strict separation from `data/pdfs/`.

Supports a **journal-template registry**: each template defines its own dimensions (or none), recommendations, and structured extras (boolean / choice / text). The shipped templates include:

- **Generic** — six-dimension rubric with standard recommendation set
- **IEEE T-AI** — verbatim transcription of the official IEEE Transactions on Artificial Intelligence ScholarOne reviewer form: 10 categorical/boolean/text questions (verbosity, technical writing, English, accessibility, reproducibility, novelty, significance, best paper, suggested references, self-citation), 5 recommendations, no 1–5 stars

Adding a new journal template requires a single dataclass entry in `review_templates.py` — the report generators, frontend forms, and LLM assistant adapt automatically.

Features:
- Side-by-side full-page detail: manuscript PDF on the left, structured form on the right
- Private working notes (never included in any export)
- Four-format synchronized export on every save: **PDF / TEX / MD / TXT** — the TXT version is formatted for direct copy-paste into journal submission systems (ScholarOne, EditorialManager, etc.)
- **AI-assisted drafting** (admin only): one click runs Claude Opus 4.6 with extended thinking on the manuscript and produces a complete suggested review (rubric + extras + recommendation + comments to authors + confidential to editor); the suggestion is *never* persisted automatically and must be explicitly reviewed and edited before saving

### 3. Paper Quality Review — versioned scientific quality grading

Personal quality assessment of papers already in your bibliography, used to grade your sources before citing them or recommending them to a tutor. Versioned by design: when you reconsider a judgement, click "New version" to snapshot the current state into v+1 while keeping v1 in history.

- 10 dimensions: research question, literature review, methodology rigor, results validity, discussion depth, limitations, reproducibility, originality, significance, writing clarity
- 5 grades: Excellent / Good / Adequate / Weak / Unreliable (color-coded badge per paper in the papers list)
- 5 structured extras: data availability, code availability, ethics disclosure, conflict of interest, planned use in own work
- Side-by-side detail page (paper PDF + form), version history dropdown, **AI-assisted drafting** (admin only) on the same Opus 4.6 + extended thinking pattern as peer review
- Four-format export per version (`paper_quality_{id}_v{N}.{pdf,tex,md,txt}`)
- Quality filter and clickable Q badge in the papers list

## Key Features

### Discovery & Data Collection
- **7 Academic Sources**: PubMed (NCBI), arXiv, bioRxiv, medRxiv, Semantic Scholar, IEEE Xplore, Elsevier (Scopus)
- **Smart Search**: ad-hoc search by keywords, title, author, or DOI across all sources
- **Auto-generated queries**: optimized per source from user keywords
- **Cross-source deduplication**: DOI exact match + title fuzzy matching (Levenshtein > 90%)
- **Paper validation**: DOI resolution, arXiv check, PMID verification
- **Import by DOI**: single-click import from any source by DOI
- **PDF download**: organized by year/source in `data/pdfs/`
- **Keyword extraction**: MeSH (PubMed), Index Terms (IEEE), Fields of Study (S2), categories (arXiv), Scopus subject areas

### Analysis & Reports
- **Dual LLM track**:
  - **Gemma4:e4b** (Ollama, local) for background batch analysis in Italian
  - **Claude Opus 4.6** with extended thinking for high-stakes tasks (Extended Abstract generation, AI-suggest peer review, AI-suggest paper quality assessment)
- **Four analysis modes** per paper: `quick` / `summary` / `extended` / `deep` — with mode-rank logic that prevents accidentally degrading the structured analysis
- **Extended Abstract** — sober single-column 2-page LaTeX output suitable for academic sharing with tutors
- **Versioned analysis**: every reviewer in-place edit creates a new version of the analysis, with full history, diff vs previous version (semantic diff via Haiku LLM), and automatic Zotero re-sync
- **Sober unified LaTeX template**: lmodern, scshape sections, microtype, single column, no decorations, no colors — academic publication standard
- **Configurable PDF signature** (Settings → PDF Author Signature): footer becomes *"Reviewed by [your name] — [your affiliation] · Generated by FL Research Monitor"* on all generated PDFs (analysis, validation, peer review, paper quality)
- **Validation report** (`validation_{paper_id}.pdf`) — formal scientific document with per-section rubric table, computed and reviewer scores, dynamically regenerated and cached on every change
- **Citation network**: ego-centric graph from Semantic Scholar, with batch import of cited/citing papers, CSV export, min-citations filter
- **Daily reports**: automated HTML summaries with stats and paper cards
- **Cost tracking**: per-call token usage and USD cost logged for every Claude API request, with API costs section in Settings

### Dashboard & Visualization
- **Interactive Dashboard**: stats cards, **validation progress card** (validated / needs revision / rejected / pending / avg score / this week), activity heatmap, timeline chart, source pie chart, topic treemap, keyword cloud, recent papers
- **Multi-layer Network**: Co-Keywords | Co-Authors | Citations tabs with D3.js force-directed graph
- **Citation network explorer**: paper search, ego-centric graph, references vs citations, min-citations filter, batch import of external nodes, CSV export, cached `citation_links` table
- **Papers page**: full-text search, filters for topic / source / keyword / label / FL technique / dataset / method tag / **validation status** / **quality grade** / rating / PDF / Zotero / disabled
- **Per-row badges**: color-coded R (review) and Q (quality) circular badges for every paper, clickable
- **Paper detail**: full metadata, authors with ORCID, abstract, keywords (clickable), source-specific links, label management, rating, notes, **Sync to Zotero**, **Quality Review** action button
- **Validation Queue page** (Meta Review): groups all pending/needs-revision EXT.ABS reviews by paper with mode pills sorted extended → summary → quick → deep, paper labels visible per row
- **Sidebar tooltips**: every navigation item has a delayed-show tooltip with a one-sentence description
- **Dark/Light mode** with smooth transitions, **responsive design**

### Zotero Integration (tutor-facing surface)
- **Auto-sync** of selected papers to a Zotero collection (Web API v3) with label → sub-collection mapping
- **Atomic sync flow**: a single Save button (in the Meta Review modal or on the paper detail page) creates the Zotero item if missing, updates metadata + tags + Extra field, and uploads attachments — all in one action
- **Shareable filter**: only the **Extended Abstract** is uploaded as an attachment. Quick, Deep and Summary are working notes that stay strictly local — they are too obviously LLM-generated to share with tutors, and only the EXT.ABS goes through the rigorous Meta Review workflow before being released
- **Validation report stays LOCAL**: `validation_{id}.pdf` is generated and stored on disk only — it is **not** uploaded to Zotero. The validation report is part of the internal scientific review audit trail and is not part of the tutor-facing surface. The Zotero Extra field still receives the validation summary (status, validated modes) as text so tutors can see at a glance whether the analysis has been reviewed
- **Emoji-prefixed tags** visible in the Zotero Tags column: ✅ Validated · extended, 🟡 Partially Validated, ⚠️ Revision · extended, ❌ Rejected · extended, 🕒 Pending Review — plus short tag forms (`validated-extended`, `partially-validated`, …) so the user can configure Zotero colored tags 1–9 for those specific keywords
- **Extra field** populated with rating + validation summary
- **Deep links**: `zotero://select/library/items/{key}` and web view buttons on every paper detail
- **Cleanup script**: `cleanup_zotero_quick_deep.py` removes legacy quick/deep PDFs from past syncs and resets stale `zotero_synced` flags in DB
- **Collection-duplication fix**: `get_or_create_collection` uses targeted `/collections/top` and `/collections/{key}/collections` endpoints with pagination instead of the global `/collections` listing — prevents the recurring duplication bug when label sub-collections grow
- **Merge script** for cleaning up any pre-existing duplicate parent collections

### Authentication & Security
- **JWT authentication**: multi-user with access tokens (24h) + refresh tokens (7 days)
- **Role-based access**: admin (full access) and viewer (read-only)
- **Admin-only LLM features**: AI-assisted peer review and AI-assisted paper quality assessment using Claude Opus 4.6 with extended thinking are protected by `require_admin` and hidden from non-admin UIs
- **Admin panel**: user management (create, edit role, enable/disable)
- **Auto-seed**: default admin user created on first startup from `.env`
- **Protected routes**: all API endpoints require authentication
- **Confidential storage**: peer review manuscripts stored under `data/peer-review/{id}/`, never indexed, never synced

### Other Integrations
- **FedCompendium XL**: embedded educational module with curated learning paths
- **GitHub Actions**: CI pipeline + daily scheduled discovery
- **Export**: JSON + XLSX multi-sheet workbook

## Architecture

```
Frontend (Next.js 16 + React 19 + TypeScript + Tailwind CSS 4)
    ↓ REST API /api/v1/* (proxied via next.config.ts)
Backend (FastAPI + SQLAlchemy async + httpx + APScheduler + Anthropic SDK)
    ↓ 7 academic API clients + dual LLM (Ollama Gemma4 + Claude Opus 4.6)
Database (SQLite) + PDF Storage + HTML/LaTeX/MD/TXT/PDF Reports
    ↓
Ollama (Gemma4:e4b) — local LLM for batch analysis in Italian
Anthropic API (claude-opus-4-6) — extended-thinking for high-stakes reviews
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2, React 19, TypeScript 6, Tailwind CSS 4, Recharts, D3.js 7, SWR |
| Backend | FastAPI, SQLAlchemy async, httpx, APScheduler, Jinja2, bcrypt, python-jose, anthropic SDK, PyMuPDF (fitz), python-markdown |
| Database | SQLite (aiosqlite) |
| LLM (local) | Ollama + Gemma4:e4b (9.6 GB) |
| LLM (cloud) | Anthropic Claude Opus 4.6 with extended thinking + Claude Haiku 4.5 (structured extraction & diff summaries) |
| PDF | pdflatex (TeX Live, with `tabularx`, `lmodern`, `microtype`, `titlesec`) — fallback to weasyprint |
| Math rendering | MathJax 3 (HTML), native LaTeX (PDF) |
| CI/CD | GitHub Actions |

### Database Schema (key tables)

```
papers → paper_authors → authors
papers → paper_sources
papers → paper_topics → topics
papers → paper_labels → labels
papers → paper_notes
papers → synthetic_analyses
papers → analysis_queue          ← validation, rubric, scores, versioning
papers → structured_analyses     ← Haiku-extracted FL techniques, datasets, method tags
papers → citation_links          ← cached S2 citation network
papers → paper_quality_reviews   ← versioned quality assessment
peer_reviews                     ← isolated peer review module
app_settings                     ← runtime config (PDF signature, ...)
fetch_logs
daily_reports
smart_search_jobs
users
```

## Quick Start

### Prerequisites

- Python 3.11+ (conda environment: `fl-research-monitor`)
- Node.js 22+
- Ollama (optional, for local Gemma4 background analysis)
- TeX Live with `tabularx` package (for PDF generation via pdflatex)

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
Change password after first login via Settings → Change Password.

### 4. First Discovery & Configuration

- Go to **Discovery** and click **Run Discovery (All)** to fetch papers
- Go to **Settings → PDF Author Signature** and set your name and affiliation (will be used as footer of all generated PDFs)

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

# Academic source API keys (optional but recommended)
NCBI_API_KEY=                       # PubMed — higher rate limits
SEMANTIC_SCHOLAR_API_KEY=           # Semantic Scholar — required for search
IEEE_API_KEY=                       # IEEE Xplore — required for IEEE search
ELSEVIER_API_KEY=                   # Elsevier (Scopus) — required for Elsevier search

# LLM
ANTHROPIC_API_KEY=                  # Claude Opus 4.6 / Haiku 4.5 — required for
                                    # Extended Abstract, AI-suggest peer review,
                                    # AI-suggest paper quality, diff LLM summaries

# Zotero integration
ZOTERO_API_KEY=                     # Web API v3
ZOTERO_USER_ID=                     # Your numeric user ID

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
| **Dashboard** | Stats cards, validation progress card, activity heatmap, timeline chart, source pie chart, topic treemap, keyword cloud, recent papers, export buttons |
| **Discovery** | Smart Search (keywords/title/author/DOI), source checkboxes, Recent Searches queue, source health cards, fetch trigger, fetch history, recent papers per source, import-by-DOI |
| **Topics** | Topic cards with paper counts and progress bars, filtered paper list, keywords preview, source queries |
| **Papers** | Full-text search, 14+ filters (topic / source / keyword / label / FL technique / dataset / method tag / validation / quality / rating / PDF / Zotero / disabled), checkbox selection for batch analysis, sortable table, pagination, R + Q badges per row |
| **Paper Detail** | Authors with ORCID, abstract, clickable keywords, label management, rating, notes, Sync to Zotero, Open in Zotero (desktop+web), Quality Review action, Analysis History with version diff, Review modal, Generate analysis (4 modes) |
| **Meta Review** | Validation queue grouped by paper, EXT.ABS only, sorted by rating, mode pills sorted extended → summary → quick → deep, paper labels per row |
| **Peer Review** | List + creation form (template selector + metadata + PDF upload), detail page (side-by-side PDF + form), versioned via implicit save, AI Suggest (admin), TXT/MD/TEX/PDF download |
| **Quality Review** | List of all current quality assessments grouped by grade, detail page (side-by-side PDF + form), version history dropdown, AI Suggest (admin), New version button |
| **Network** | Multi-layer graph (Co-Keywords/Co-Authors/Citations), citation tab with paper search, ego-centric graph, references/citations toggle, min-citations filter, batch import, CSV export |
| **Compendium** | Embedded FedCompendium XL (React app) with educational content and learning paths |
| **Comparison** | Side-by-side comparison of multiple papers across structured fields |
| **Reports** | Daily/Analysis tabs, inline HTML viewer, PDF download, report generation, analysis queue status |
| **Settings** | Topic CRUD, user management (admin), change password, API costs, **PDF Author Signature**, system info |

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

### Papers, Analytics & App Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/papers` | List papers (paginated, 14+ filters including validation, quality, label, fl_technique, dataset, method_tag) |
| GET | `/api/v1/papers/{id}` | Paper detail |
| POST | `/api/v1/papers/import-by-doi` | Import by DOI from any source |
| POST | `/api/v1/papers/{id}/rate` | Rate paper 1–5 |
| GET | `/api/v1/papers/{id}/pdf-file` | Stream the local PDF (auth required) |
| GET | `/api/v1/analytics/overview` | Dashboard KPIs |
| GET | `/api/v1/analytics/timeline` | Discovery timeline data |
| GET | `/api/v1/analytics/heatmap` | GitHub-style activity heatmap |
| GET | `/api/v1/app-settings` | Read all app settings |
| PUT | `/api/v1/app-settings` | Update an app setting (admin) |

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

### Analysis (LLM) & Meta Review
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analysis/trigger` | Queue papers for LLM analysis |
| GET | `/api/v1/analysis/{paper_id}/history` | All analysis versions for a paper |
| GET | `/api/v1/analysis/{paper_id}/html` | Inline HTML view |
| GET | `/api/v1/analysis/{paper_id}/pdf` | PDF download |
| GET | `/api/v1/analysis/{paper_id}/md` | Markdown download |
| GET | `/api/v1/analysis/{paper_id}/tex` | LaTeX source download |
| GET | `/api/v1/analysis/{paper_id}/validation-report` | Generate (cached) the formal validation report PDF |
| GET | `/api/v1/analysis/{paper_id}/diff?queue_id=X` | Section-by-section diff vs previous version |
| POST | `/api/v1/analysis/diff/llm-summary` | Haiku-summarized semantic diff |
| POST | `/api/v1/analysis/queue/{queue_id}/validate` | Save validation review (status + score + rubric + notes) |
| GET | `/api/v1/analysis/queue/{queue_id}/rubric-template` | Get rubric template (existing or blank) |
| POST | `/api/v1/analysis/queue/{queue_id}/fork` | Create new analysis version from reviewer in-place edits |
| GET | `/api/v1/analysis/review-queue` | Queue of pending/needs-revision EXT.ABS reviews |
| GET | `/api/v1/analysis/validation-stats` | Aggregate stats for the dashboard card |

### Peer Review (isolated module)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/peer-review` | List all peer reviews |
| POST | `/api/v1/peer-review` | Create new peer review |
| GET | `/api/v1/peer-review/{id}` | Detail |
| PUT | `/api/v1/peer-review/{id}` | Update (regenerates all 4 artifacts on save) |
| DELETE | `/api/v1/peer-review/{id}` | Delete |
| POST | `/api/v1/peer-review/{id}/upload-pdf` | Upload manuscript PDF |
| GET | `/api/v1/peer-review/{id}/pdf` | Stream the manuscript PDF |
| GET | `/api/v1/peer-review/{id}/review-pdf` | Generated review report (PDF) |
| GET | `/api/v1/peer-review/{id}/review-tex` | Generated review report (LaTeX) |
| GET | `/api/v1/peer-review/{id}/review-md` | Generated review report (Markdown) |
| GET | `/api/v1/peer-review/{id}/review-txt` | Plain-text review (for ScholarOne paste) |
| POST | `/api/v1/peer-review/{id}/llm-suggest` | **Admin only** — Claude Opus 4.6 extended thinking |
| GET | `/api/v1/peer-review/templates` | List available journal templates |
| GET | `/api/v1/peer-review/rubric-template?template_id=…` | Blank rubric for a template |

### Paper Quality Review (versioned)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/paper-quality` | List all current quality reviews |
| GET | `/api/v1/paper-quality/{paper_id}` | Current version (404 if none) |
| GET | `/api/v1/paper-quality/{paper_id}/history` | All versions newest-first |
| GET | `/api/v1/paper-quality/{paper_id}/v/{version}` | Specific version |
| POST | `/api/v1/paper-quality/{paper_id}` | Idempotent: create v1 or return existing |
| PUT | `/api/v1/paper-quality/{paper_id}` | Update current in place |
| POST | `/api/v1/paper-quality/{paper_id}/new-version` | Fork current → v+1 |
| DELETE | `/api/v1/paper-quality/{paper_id}/v/{version}` | Delete version |
| GET | `/api/v1/paper-quality/{paper_id}/v/{version}/{fmt}` | Download pdf/tex/md/txt |
| POST | `/api/v1/paper-quality/{paper_id}/llm-suggest` | **Admin only** — Claude Opus 4.6 extended thinking |

### Network, Reports, Zotero & Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/network/co-keywords` | Co-keyword graph |
| GET | `/api/v1/network/co-authors` | Co-author graph |
| GET | `/api/v1/network/citations` | Cached citation network |
| POST | `/api/v1/network/refresh-citations/{paper_id}` | Refresh citations for a paper from S2 |
| POST | `/api/v1/zotero/sync` | Sync papers (idempotent: creates if missing, updates if existing) |
| POST | `/api/v1/zotero/sync-analysis/{paper_id}` | Upload analysis attachments + validation report |
| DELETE | `/api/v1/zotero/remove/{paper_id}` | Remove from Zotero |
| GET | `/api/v1/topics` | List topics |
| POST | `/api/v1/topics` | Create topic (admin) |
| GET | `/api/v1/labels` | List labels |
| GET | `/api/v1/sources` | Source health and stats |
| GET | `/api/v1/exports/json` | Download JSON registry |
| GET | `/api/v1/exports/xlsx` | Download XLSX workbook |
| GET | `/api/v1/reports` | List daily reports |

## LLM Paper Analysis

The system uses **two complementary LLM tracks**:

### Local — Gemma4:e4b via Ollama
For background batch analysis in Italian. No API costs, runs on the user's machine.

```bash
# Install/update Ollama from https://ollama.com/download
ollama pull gemma4:e4b    # 9.6 GB download
```

### Cloud — Claude Opus 4.6 with extended thinking
For high-stakes admin-only tasks where reasoning quality matters most:

- Extended Abstract generation (`mode=extended`)
- AI-Suggest peer review draft (`POST /peer-review/{id}/llm-suggest`)
- AI-Suggest paper quality assessment (`POST /paper-quality/{paper_id}/llm-suggest`)

All Opus calls use `thinking={"type": "enabled", "budget_tokens": 12000}` for genuine extended deliberation. Claude **Haiku 4.5** is used for cheaper structured-extraction tasks: per-paper FL technique / dataset / method tag extraction, and section-level diff summaries between analysis versions.

Token usage and USD cost are logged for every Claude call and aggregated in the **Settings → API Costs** view.

### Analysis modes

| Mode | Length | Use |
|------|--------|-----|
| `quick` | ~2 pages of bullets | Local working notes, never shared |
| `summary` | 1-page narrative | Optional shareable summary |
| `extended` | 2 pages, 9 academic sections, formal | **The shareable artifact** — LaTeX sober single-column, suitable for tutors |
| `deep` | 4-5 pages, exhaustive | Local working notes, never shared |

### Report Sections (Extended Abstract — the canonical shareable mode)

1. **Abstract** — 1 paragraph max 150 words
2. **Keywords**
3. **Research Context** — problem and gap
4. **Purpose** — research questions, contribution
5. **Methodology** — approach, data, techniques, metrics
6. **Results** — quantitative findings
7. **Limitations** — author-reported and identified
8. **Implications** — practical, managerial, policy
9. **Originality** — distinctive contribution

Each of these 9 sections is the unit of the **Meta Review rubric** — the reviewer scores each section 1–5 with a per-section comment, and may edit the section text in place to produce a corrected version (`engine=reviewer-edit`) that becomes the actual document shared with tutors.

## Source Status

| Source | Search | Keywords Extracted | API Key |
|--------|--------|-------------------|---------|
| PubMed | Title/Abstract, Author, DOI | MeSH + Author Keywords | Optional (rate limits) |
| arXiv | Title/Abstract | Categories → readable names | Not needed |
| bioRxiv/medRxiv | Keywords only | Category | Not needed |
| Semantic Scholar | Full text, DOI lookup | Fields of Study + s2Fields | Recommended (rate limits) |
| IEEE Xplore | All modes | Index Terms (Author, IEEE, INSPEC) | Required |
| Elsevier (Scopus) | Title, abstract, author, DOI | Subject areas + author keywords | Required |

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

# Zotero maintenance
python scripts/cleanup_zotero_quick_deep.py            # dry-run
python scripts/cleanup_zotero_quick_deep.py --apply    # remove legacy quick/deep PDFs from Zotero + reset DB flags

python scripts/merge_zotero_duplicate_collections.py            # dry-run
python scripts/merge_zotero_duplicate_collections.py --apply    # merge duplicate FL-Research-Monitor parent collections
```

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| v0.1 – v1.0 | 2026-03 | Foundation: 5 API clients, FastAPI, Next.js dashboard, daily reports, scheduler, Zotero, production release |
| v1.1 – v1.3 | 2026-03 | FedCompendium XL embedded, learning paths, keyword cloud, real API keywords |
| v1.4.0 | 2026-04-06 | JWT auth, multi-user, RBAC, login page |
| v1.5.0 | 2026-04-06 | LLM paper analysis (Gemma4), keyword categorization, PDF reports |
| v1.6.0 | 2026-04-06 | Smart Search, search modes, multi-layer network, search queue |
| v2.4.x | 2026-04 | Tables and math in HTML/LaTeX, fluent prompt, API cost tracking, PDF page count |
| v2.5.0 | 2026-04 | Perfect formula rendering, **Extended Abstract** mode, Zotero sync tracking |
| v2.6.x | 2026-04 | Citation Network explorer, paper rating, Zotero notes+tags, import by DOI, sober unified LaTeX template, Elsevier source, method tags filter |
| v2.7.x | 2026-04 | **Analysis Validation workflow** with rubric, side-by-side review, queue page, dual computed/reviewer scores, paper PDF tab |
| v2.8.0 | 2026-04 | **Peer Review module**, configurable PDF signature, Zotero tutor-friendly sync (filtered set), emoji tags, deep links |
| v2.9.0 | 2026-04 | **Peer review templates** (Generic + IEEE T-AI verbatim), private notes, four-format synchronized export, **AI-assisted peer review** (Claude Opus 4.6 extended thinking, admin only) |
| v2.10.0 | 2026-04 | **Paper Quality Review module** with native versioning (10 dimensions, 5 grades, AI-assist), Quality filter and Q badge in papers list, sidebar Quality Review entry, sidebar tooltips, Meta Review rename |

## Project Structure

```
RESerch_MON/
├── backend/
│   ├── app/
│   │   ├── api/                # FastAPI route handlers
│   │   │   ├── papers.py
│   │   │   ├── paper_analysis.py     ← validation + meta-review + diff
│   │   │   ├── peer_review.py        ← peer review module
│   │   │   ├── paper_quality.py      ← paper quality review (versioned)
│   │   │   ├── app_settings.py       ← runtime config (PDF signature, …)
│   │   │   ├── zotero.py
│   │   │   └── …
│   │   ├── clients/            # API source clients (pubmed, arxiv, s2, ieee, elsevier, biorxiv, zotero, …)
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── paper_quality_review.py
│   │   │   ├── peer_review.py
│   │   │   ├── app_setting.py
│   │   │   └── …
│   │   ├── schemas/            # Pydantic response schemas
│   │   ├── services/           # Business logic
│   │   │   ├── llm_analysis.py            ← Gemma4 + Claude analysis
│   │   │   ├── paper_report_generator.py  ← unified sober LaTeX template
│   │   │   ├── validation_report.py       ← formal review PDF (cached, mtime-based)
│   │   │   ├── peer_review_report.py      ← peer-review PDF/TEX/MD/TXT
│   │   │   ├── peer_review_llm.py         ← Opus 4.6 extended thinking
│   │   │   ├── paper_quality_report.py    ← quality PDF/TEX/MD/TXT
│   │   │   ├── paper_quality_llm.py       ← Opus 4.6 extended thinking
│   │   │   ├── review_templates.py        ← template registry (Generic, IEEE-TAI, Paper Quality)
│   │   │   ├── app_settings.py            ← async + sync helpers
│   │   │   └── …
│   │   ├── tasks/              # Scheduler jobs
│   │   └── utils/
│   ├── scripts/                # CLI tools
│   │   ├── cleanup_zotero_quick_deep.py
│   │   ├── merge_zotero_duplicate_collections.py
│   │   └── …
│   ├── data/
│   │   ├── pdfs/               # Public bibliography PDFs
│   │   ├── peer-review/        # Confidential manuscript PDFs (isolated)
│   │   └── reports/
│   │       ├── analysis/       # analysis_*_v*.{pdf,tex,md,html}
│   │       ├── peer-review/    # peer_review_*.{pdf,tex,md,txt}
│   │       └── paper-quality/  # paper_quality_*_v*.{pdf,tex,md,txt}
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── papers/[id]/    ← paper detail + Meta Review modal + Diff modal
│   │   │   ├── review/         ← Meta Review queue
│   │   │   ├── peer-review/[id]/
│   │   │   ├── paper-quality/[id]/
│   │   │   └── …
│   │   ├── components/         # React components (layout, charts, dashboard)
│   │   ├── hooks/              # SWR data fetching hooks
│   │   └── lib/                # API client, auth, types, utils
│   ├── public/                 # Static assets + FedCompendium build
│   ├── package.json
│   └── next.config.ts
├── _fedcompendiumXL_CC/        # FedCompendium XL source code
├── _SCAMBIO/                   # Reference docs (e.g. journal review form templates)
├── .github/workflows/          # CI + daily discovery
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
├── PROGRESS.md
└── .env.example
```

## License

This project is for academic research purposes.
