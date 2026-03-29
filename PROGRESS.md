# FL-RESEARCH-MONITOR — Progress Tracker

**Current Phase:** v1.2.0 — FedCompendium integration (Opzione C)
**Current Version:** v1.2.0
**Status:** Compendium unified as educational module

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

**Total files:** ~85 | **Total lines:** ~10,000+ | **Real papers tested:** 9/9 validated

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
