# FL-RESEARCH-MONITOR — Progress Tracker

**Current Phase:** v2.3.0 — Paper Comparison + Citations + Summary
**Current Version:** v2.3.0
**Status:** Full analysis pipeline with Claude Opus 4.6, comparison, citation refresh, summary cards

---

## Session Log

### 2026-03-29 — Session 1

#### Phase 1 (v0.1.0) — COMPLETATA
- Full project scaffold pushed to GitHub

#### Phase 2 (v0.2.0) — COMPLETATA
- PDFManager, PaperValidator, TopicClassifier, ExportService

#### Phase 3 (v0.3.0) — COMPLETATA
- Enhanced dashboard, D3 network, discovery triggers, topic CRUD

#### Phase 4 (v0.4.0) — COMPLETATA
- **AnalysisService** (`backend/app/services/analysis.py`):
  - Rule-based NLP: FL technique detection (30+ techniques)
  - Methodology classification (experimental, theoretical, survey, etc.)
  - Key findings extraction via regex patterns
  - Relevance scoring (0.0-1.0) per FL/healthcare/EHDS
  - Auto-generated summaries
- **ReportGenerator** (`backend/app/services/report_generator.py`):
  - Jinja2 HTML template with dark theme styling
  - Stats cards (total, new, PDF, validated)
  - Paper cards with authors, sources, topics, abstract preview
  - Embedded analysis (summary, FL techniques)
  - DB record tracking (daily_reports table)
- **ZoteroClient** (`backend/app/clients/zotero.py`):
  - Zotero Web API v3 integration
  - Auto-create "FL-Research-Monitor" collection
  - Add papers with full metadata (authors, DOI, abstract)
- **ZoteroSyncService** (`backend/app/services/zotero_sync.py`):
  - Sync individual or all unsynced papers
  - Track zotero_key per paper
- **APScheduler** (`backend/app/tasks/scheduler.py`):
  - Daily job at 06:00 UTC (production only)
  - Full pipeline: discover → analyze → export → report
- **Reports API** (`backend/app/api/reports.py`):
  - GET /reports — list reports
  - GET /reports/{date}/html — serve HTML report
  - POST /reports/generate — trigger generation
- **Reports Frontend**:
  - Report list with date, paper count, generation time
  - Inline iframe viewer for HTML reports
  - "Generate Report" button with background execution
  - "Open in new tab" link
- **GitHub Actions** improved:
  - Scheduled fetch now includes validation, analysis, report, exports
- **Tested**: 9 papers analyzed, 15 KB HTML report generated

#### Files Created/Modified (Phase 4)
- NEW: `backend/app/services/analysis.py`
- NEW: `backend/app/services/report_generator.py`
- NEW: `backend/app/services/zotero_sync.py`
- NEW: `backend/app/clients/zotero.py`
- NEW: `backend/app/tasks/scheduler.py`
- NEW: `backend/app/api/reports.py`
- MOD: `backend/app/api/router.py` (reports router)
- MOD: `backend/app/main.py` (scheduler, version 0.4.0)
- MOD: `frontend/src/app/reports/page.tsx` (full report viewer)
- MOD: `.github/workflows/scheduled-fetch.yml` (analysis + report)

---

#### Phase 5 (v1.0.0) — COMPLETATA
- ARCHITECTURE.md aggiornato comprehensivamente (tutte le API, schema DB, componenti)
- README.md completo con quick start, features, API keys, dashboard pages
- Tracking files finali
- Push v1.0.0

---

## Summary

| Version | Phase | Key Deliverables |
|---------|-------|-----------------|
| v0.1.0 | Foundation | Backend scaffold, 5 API clients, frontend shell |
| v0.2.0 | PDF + Export | PDFManager, Validator, Classifier, ExportService |
| v0.3.0 | Dashboard | D3 network, discovery triggers, topic CRUD, themes |
| v0.4.0 | Automation | Analysis, reports, Zotero, scheduler |
| v1.0.0 | Polish | Complete documentation, production-ready |
| v1.1.0 | Compendium | FedCompendium XL embedded as iframe |
| v1.2.0 | Integration | Unified papers, learning path, DOI enrichment |
| v1.4.0 | Auth | JWT multi-user auth, RBAC, login page, user management |
| v1.5.0 | LLM Analysis | Individual paper reports with Gemma4, keyword categorization, PDF |
| v2.0.0–v2.2.7 | Claude Opus + Smart Search | Claude API analysis, Smart Search, labels, notes, bibliography import, Zotero sync, PDF fixes |
| v2.3.0 | Comparison + Citations + Summary | Paper comparison table, citation refresh, summary card/LLM, keyword browser, Excel export |

**Total files:** ~95 | **Total lines:** ~15,000+ | **Papers in DB:** 525+ | **Structured analyses:** 11+

#### v1.1.0 — FedCompendium XL embed
- FedCompendium embedded as iframe at /compendium
- 27 papers imported, dark/light theme toggle

#### v1.2.0 — Compendium Integration (Opzione C)
- **Papers page unified** with 3 tabs: All / API Sources / Compendium
  - Tab switcher with visual distinction
  - Compendium banner with link to full sub-app
  - Compendium papers marked with purple left border
  - Source filter adapts to active tab
- **Paper detail**: "Open in Compendium" button for compendium papers
- **Sidebar Learning Path**: 6 educational topics with difficulty indicators
  - Beginner (green): Introduction to FL, FedAvg
  - Intermediate (amber): Non-IID Data, FL Healthcare
  - Advanced (red): Differential Privacy, Personalization
- **DOI enrichment**: 4/27 compendium papers enriched via Semantic Scholar
  - Most compendium papers are custom/unpublished titles (not indexed in S2)
- **Source colors**: Compendium gets purple (#a855f7) badge
- **314 total papers** in DB: 148 PubMed + 93 bioRxiv + 46 medRxiv + 27 Compendium

#### v1.4.0 — JWT Authentication System
- **User model** (`backend/app/models/user.py`):
  - Users table: username, email, hashed_password, role (admin/viewer), is_active, last_login
- **Auth service** (`backend/app/services/auth.py`):
  - JWT access tokens (24h) + refresh tokens (7 days)
  - bcrypt password hashing via passlib
  - Auto-seed admin user on first startup (from .env)
  - User CRUD operations
- **Auth API** (`backend/app/api/auth.py`):
  - POST /auth/login — JWT login
  - POST /auth/refresh — token refresh
  - GET /auth/me — current user profile
  - PUT /auth/me/password — change own password
  - GET /auth/users — list users (admin only)
  - POST /auth/users — create user (admin only)
  - PUT /auth/users/{id} — update role/status (admin only)
- **Route protection**:
  - All API routes require JWT Bearer token
  - /auth/login and /health are public
  - Discovery trigger and topic CRUD require admin role
  - API_SERVICE_KEY for GitHub Actions unattended access
- **Frontend login page** (`frontend/src/app/login/page.tsx`):
  - Clean login form matching app theme
  - Error handling, loading state
- **Auth context** (`frontend/src/lib/auth.tsx`):
  - AuthProvider with login/logout/refresh
  - Token persistence in localStorage
  - Auto-redirect on auth state change
- **Route guard** (`frontend/src/components/layout/AuthGuard.tsx`):
  - Redirects unauthenticated users to /login
  - Loading spinner during auth check
- **AppShell** (`frontend/src/components/layout/AppShell.tsx`):
  - Login page renders without sidebar
  - All other pages wrapped with sidebar layout
- **API client updated** (`frontend/src/lib/api.ts`):
  - All requests include Authorization header
  - Auto token refresh on 401
  - authFetcher for SWR hooks
- **Sidebar**: user avatar, role badge, logout button
- **Settings page**: user management panel (admin), change password (all users)
- **Dependencies**: python-jose, bcrypt, python-multipart

#### v1.5.0 — LLM Paper Analysis Reports
- **LLM Analysis Service** (`backend/app/services/llm_analysis.py`):
  - Integrazione Ollama locale con Gemma4:e4b
  - Prompt template strutturato (9 sezioni) per analisi in italiano
  - Timeout 600s per paper lunghi, temperature 0.3 per consistenza
- **Paper Report Generator** (`backend/app/services/paper_report_generator.py`):
  - Template HTML dark-theme con Jinja2
  - Keyword categorization: FL Core (blu), Privacy (rosso), Healthcare (verde), Systems (arancione), Methods (viola)
  - Conversione Markdown→HTML dell'analisi LLM
  - Generazione PDF via weasyprint
  - Sezioni: Summary, Research Context, Methodology, Key Findings, FL Techniques, Relevance Assessment, Limitations, Healthcare/EHDS, Keyword Research
- **Analysis Queue** (`backend/app/models/analysis.py`):
  - Tabella `analysis_queue`: paper_id, status (pending/running/done/failed), paths HTML/PDF
  - Worker background che processa 1 paper alla volta
- **Analysis Worker** (`backend/app/services/analysis_worker.py`):
  - Processa coda in background, 1 paper alla volta (Gemma4 ~10GB RAM)
  - Progress tracking (total, completed, current_paper)
  - Verifica disponibilità Ollama prima di partire
- **Analysis API** (`backend/app/api/paper_analysis.py`):
  - POST /analysis/trigger — accoda paper per analisi (admin only)
  - GET /analysis/status — stato worker (running, progress)
  - GET /analysis/queue — lista coda completa
  - GET /analysis/reports — report completati
  - GET /analysis/{paper_id}/html — report HTML
  - GET /analysis/{paper_id}/pdf — download PDF
- **Frontend Papers page**: checkbox selezione + barra "Genera Analisi" (admin only)
- **Frontend Reports page**: tab Daily/Analysis, viewer HTML, download PDF
- **Dependencies**: weasyprint

#### v2.0.0–v2.2.7 — Claude Opus Analysis + Smart Search + UI
- **Claude Opus 4.6 API** replaces Gemma4 as default analysis engine (~$0.33/paper, ~60-80s)
- **AsyncAnthropic** client for non-blocking analysis (other requests served during analysis)
- **Prompt v2**: R1-R6 rules, [Dal paper]/[Osservazione] labels, LaTeX formulas, Italian output
- **Quick mode** (1500-2500 words, ~5 pages) + **Deep mode** (3500-6000 words, ~7+ pages)
- **Auto PDF download** before analysis for both modes
- **Direct backend call** from frontend (bypass Next.js proxy, 5min timeout)
- **Structured data extraction** via Claude Haiku 4.5 (~$0.001/paper, 20+ fields)
- **Smart Search**: keywords (AND logic), title, author, DOI across 5 sources
- **Bibliography import**: paste bibliography text, extract DOIs with line-break handling, resolve via CrossRef
- **CrossRef API** client for universal DOI resolution (no API key)
- **Labels + Notes**: create/assign/remove labels per paper, personal notes with save
- **Paper disable/enable** toggle
- **PDF upload** + **View PDF** button serving local files from backend
- **Enrich**: merge keywords from S2/PubMed/PDF (not overwrite), PDF keywords replace category
- **PDF keyword extraction**: robust regex with Unicode-aware terminators
- **Zotero sync**: label→sub-collection mapping, upload attachment 3-step flow
- **JWT auto-refresh** on 401 in authFetcher
- **Analysis History**: collapsible details with engine, duration, cost, chars
- **High contrast buttons**: dark solid backgrounds with white text (user feedback)
- **525+ papers** in DB from 5+ sources

#### v2.3.0 — Paper Comparison + Citation Refresh + Summary (2026-04-08)
- **Paper Comparison page** (`/comparison`):
  - Structured comparison table: 13 fields (problem, method, FL techniques, datasets, metrics, privacy, reproducibility, novelty, relevance, healthcare, findings, limitations)
  - Papers as columns, fields as rows, sticky "Field" column, horizontal scroll
  - Best metric highlighted in green among comparable papers
  - Research Gaps tab: aggregated FL techniques, datasets, privacy mechanisms, novelty/relevance distribution, common limitations
  - Saved comparisons in localStorage with rename/delete, paper titles, labels
  - Export to Excel (.xlsx) via SheetJS (dynamic import, 22 fields)
  - "Confronta (N)" button in Papers batch selection bar
  - Comparison link in sidebar navigation
- **Citation Refresh Service** (`backend/app/services/citation_refresh.py`):
  - `refresh_citations_batch()`: S2 batch API (500 papers/request), rate limited 1 req/sec
  - `refresh_citation_single()`: single paper lookup via S2
  - `fetch_s2_citation_count()`: quick DOI→citation count for discovery fallback
  - Scheduled job at 07:00 UTC via APScheduler (after discovery at 06:00)
  - S2 fallback during discovery for PubMed/arXiv/bioRxiv papers with 0 citations
  - "Refresh Citations (N)" button in Papers batch selection (selected papers only)
  - Refresh icon next to citation count in paper detail page
- **Summary Card** (from structured data, zero cost):
  - Section in paper detail page: Problem, Method, FL Techniques (badges), Datasets (badges), Performance (metric + delta + baseline), Assessment grid (Novelty, Relevance, Healthcare, Privacy, Reproducibility with stars), Key Findings, Limitations
  - PDF export via dedicated 1-page HTML template with weasyprint
  - Endpoint: `GET /analysis/{paper_id}/summary-card` (JSON) + `GET /analysis/{paper_id}/summary-card-pdf` (PDF)
- **Summary LLM mode** (Claude Opus 4.6, 1 page, ~400 words):
  - Third analysis mode alongside Quick and Deep
  - Tight prompt: Overview (2-3 sentences), Method (2-3 sentences), Key Results (3-5 bullets), Assessment (novelty, relevance, healthcare, privacy, limitations)
  - Max 1500 tokens output
  - Badge arancione SUMMARY in analysis history and report header
- **Keyword Browser** in Discovery Smart Search:
  - `GET /papers/keywords/categorized` endpoint with case-insensitive dedup
  - Browse panel with keywords grouped by category (Author Keywords, S2 Fields, MeSH Terms, etc.)
  - Filter input to search within keywords
  - Click to add keyword to search field (comma-separated), disabled if already selected
  - Count badge per keyword showing paper frequency
- **Zotero sync improvements**:
  - Upload all analysis modes: summary → quick → deep (order avoids Zotero rename)
  - Delete old `analysis_*` attachments before upload (case-insensitive match)
  - `mtime` parameter added to upload auth (Zotero API requirement)
  - Force re-upload when Zotero returns "exists" (append timestamp to change md5)
  - If-None-Match/If-Match fallback chain for auth and register steps
- **Papers list improvements**:
  - Sort selector: 8 options (newest/oldest added, pub date newest/oldest, most/least cited, title A-Z/Z-A)
  - Analysis badges deduplicated per mode with SUMMARY badge (arancione)
  - Labels sorted alphabetically
- **Label picker** redesigned:
  - "ASSIGN EXISTING" section showing available labels with color dots
  - "CREATE NEW" section with name input, color preset picker, Create & Add button
  - Wider dropdown (w-64) with max-height scroll
- **Mode badge in reports**: QUICK (blue), DEEP (purple), SUMMARY (orange) badge in HTML+PDF report header
- **Dependencies added**: xlsx (SheetJS)
