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

## Phase 3: Dashboard Frontend Completa (v0.3.0) — PIANIFICATA

- [ ] Dashboard home con dati reali
- [ ] Papers page con TanStack Table avanzata (sorting, column resize)
- [ ] Paper detail con PDF viewer integrato
- [ ] Discovery page: calendar heatmap, fetch log timeline
- [ ] Topics page: sunburst visualization, trend charts
- [ ] Network page: D3 citation force graph (dati da Semantic Scholar)
- [ ] Reports page: lista + viewer HTML
- [ ] Settings page: CRUD topics con form
- [ ] Dark/Light mode toggle
- [ ] Responsive mobile/tablet
- [ ] Push v0.3.0

---

## Phase 4: Automation + Analysis (v0.4.0) — PIANIFICATA

- [ ] AnalysisService (synthetic paper analysis: key findings, methodology, relevance score)
- [ ] ReportGenerator (daily HTML/PDF summary via Jinja2)
- [ ] ZoteroClient + ZoteroSyncService
- [ ] APScheduler integration nel backend (daily fetch job)
- [ ] GitHub Actions: scheduled-fetch migliorato con report generation
- [ ] Email report template (preparazione per integrazione futura)
- [ ] Push v0.4.0

---

## Phase 5: Polish + Deploy (v1.0.0) — PIANIFICATA

- [ ] Deploy frontend su Vercel
- [ ] Deploy backend su Railway/Render
- [ ] Full discovery run su tutte le 5 fonti
- [ ] Performance optimization
- [ ] Comprehensive README
- [ ] Push v1.0.0
