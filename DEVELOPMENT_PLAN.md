# FL-RESEARCH-MONITOR — Development Plan

**Last Updated:** 2026-04-06

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

## Phase 5: Polish + Deploy (v1.0.0) — COMPLETATA

- [x] ARCHITECTURE.md aggiornato comprehensivamente
- [x] README.md completo con tutte le istruzioni
- [x] DEVELOPMENT_PLAN.md e PROGRESS.md finali
- [x] Push v1.0.0

## Future Enhancements

- [ ] Deploy frontend su Vercel
- [ ] Deploy backend su Railway/Render + PostgreSQL
- [ ] Email report integration (SendGrid/Gmail SMTP)
- [ ] LLM-powered analysis (replace rule-based with Claude API)
---

## Phase 6: Authentication (v1.4.0) — COMPLETATA

- [x] User model con ruoli (admin/viewer) e SQLite table
- [x] JWT access token (24h) + refresh token (7 giorni) via python-jose
- [x] bcrypt password hashing via passlib
- [x] Auto-seed admin user da variabili .env al primo avvio
- [x] Auth API: login, refresh, me, change password, user CRUD (admin)
- [x] Route protection: tutti gli endpoint richiedono JWT
- [x] Permessi per ruolo: discovery trigger e topic CRUD solo admin
- [x] API_SERVICE_KEY per accesso GitHub Actions automatizzato
- [x] Frontend: pagina login, AuthProvider context, AuthGuard
- [x] AppShell: login senza sidebar, pagine protette con sidebar
- [x] API client: auto-inject Authorization header, auto-refresh su 401
- [x] Sidebar: avatar utente, ruolo, logout
- [x] Settings: pannello gestione utenti (admin), cambio password (tutti)
- [x] Aggiornamento .env.example con variabili auth

---

## Phase 7: LLM Paper Analysis (v1.5.0) — COMPLETATA

- [x] LLM Analysis Service con Ollama locale (Gemma4:e4b)
- [x] Prompt template 9 sezioni, analisi in italiano
- [x] Paper Report Generator con template HTML dark-theme
- [x] Keyword categorization (FL Core, Privacy, Healthcare, Systems, Methods)
- [x] Sezione Keyword Research per ogni keyword del paper
- [x] Conversione Markdown→HTML dell'output LLM
- [x] Generazione PDF via weasyprint
- [x] Analysis Queue (tabella DB) con worker background
- [x] Worker processa 1 paper alla volta, progress tracking
- [x] API: trigger, status, queue, reports, HTML, PDF download
- [x] Frontend: checkbox selezione paper + barra "Genera Analisi"
- [x] Frontend: tab Daily/Analysis nella pagina Reports
- [x] Viewer inline + download PDF

---

## Future Enhancements

- [ ] Citation network data from Semantic Scholar references
- [ ] Author tracking and affiliation analytics
- [ ] Full-text search via PostgreSQL tsvector
- [ ] Webhook notifications for new high-relevance papers
