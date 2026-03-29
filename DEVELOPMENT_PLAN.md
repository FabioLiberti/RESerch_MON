# FL-RESEARCH-MONITOR — Development Plan

**Last Updated:** 2026-03-29

---

## Phase 1: Foundation (v0.1.0) — COMPLETATA

- [x] Init git repo, directory structure, .gitignore, .env.example
- [x] Backend: pyproject.toml, FastAPI app, SQLAlchemy models (9 tabelle)
- [x] BaseAPIClient con rate limiting, retry, exponential backoff
- [x] 5 API clients: PubMed, Semantic Scholar, arXiv, bioRxiv/medRxiv, IEEE
- [x] DiscoveryService + DeduplicationService (DOI + title similarity)
- [x] REST API: papers CRUD, analytics, sources, topics
- [x] 3 topic default configurabili: FL, FL Healthcare, EHDS
- [x] Frontend Next.js + React + TypeScript + Tailwind dark theme
- [x] Dashboard: StatsCards, TimelineChart, SourcePieChart, TopicTreemap, RecentPapers
- [x] 8 pagine: Dashboard, Papers (lista + dettaglio), Discovery, Topics, Network, Reports, Settings
- [x] CLI fetch script (scripts/fetch_papers.py)
- [x] GitHub Actions: CI + daily scheduled fetch
- [x] ARCHITECTURE.md
- [x] Push v0.1.0

---

## Phase 2: PDF Management + Export + Validation (v0.2.0) — COMPLETATA

- [x] `PDFManager` — Download, validate magic bytes, organize by year/source
- [x] `ExportService` — JSON + XLSX multi-sheet (AllPapers, ByTopic, BySource, Statistics)
- [x] `PaperValidator` — DOI resolution + arXiv + PMID check
- [x] `TopicClassifier` — Keyword-weighted classification con confidence score
- [x] Export API endpoints: `/api/v1/exports/json` e `/api/v1/exports/xlsx`
- [x] CLI scripts: `validate_papers.py`, `generate_registry.py`
- [x] DiscoveryService integrato con PDF + validation + classification
- [x] Pipeline testato: 9 paper reali, 9/9 validati
- [x] Push v0.2.0

---

## Phase 3: Dashboard Frontend Completa (v0.3.0) — COMPLETATA

- [x] Dashboard con HeatmapCalendar, export buttons, SWR data
- [x] Discovery page con fetch trigger, source cards, fetch history
- [x] Topics page con cards grid, paper list, source queries detail
- [x] Network page con D3 force-directed graph (co-topic)
- [x] Settings page con topic CRUD (create/edit/delete)
- [x] Discovery API (trigger/status)
- [x] Dark/Light mode toggle
- [x] Responsive design (mobile sidebar hidden)
- [x] Push v0.3.0

---

## Phase 4: Automation + Analysis (v0.4.0) — COMPLETATA

- [x] AnalysisService (FL technique detection, methodology, key findings, relevance score)
- [x] ReportGenerator (daily HTML report via Jinja2 dark-theme template)
- [x] ZoteroClient + ZoteroSyncService (Web API v3, collection management)
- [x] APScheduler (daily 06:00 UTC, full pipeline)
- [x] Reports API (list, view HTML, trigger generation)
- [x] Reports frontend (list, iframe viewer, generate button)
- [x] GitHub Actions: analysis + report + export in scheduled job
- [x] Push v0.4.0

---

## Phase 5: Polish + Deploy (v1.0.0) — PIANIFICATA

- [ ] Deploy frontend su Vercel
- [ ] Deploy backend su Railway/Render
- [ ] Full discovery run su tutte le 5 fonti
- [ ] Performance optimization
- [ ] Comprehensive README
- [ ] Push v1.0.0
