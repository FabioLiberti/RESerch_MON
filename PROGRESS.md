# FL-RESEARCH-MONITOR — Progress Tracker

**Current Phase:** Phase 2 — COMPLETATA
**Current Version:** v0.2.0 (ready to push)
**Next Phase:** Phase 3 — Dashboard Frontend

---

## Session Log

### 2026-03-29 — Session 1

#### Phase 1 (v0.1.0) — COMPLETATA
- Full project scaffold: backend (FastAPI) + frontend (Next.js) + GitHub Actions
- 5 API clients: PubMed, Semantic Scholar, arXiv, bioRxiv/medRxiv, IEEE
- DiscoveryService + DeduplicationService
- REST API with papers, analytics, sources, topics endpoints
- Dashboard with StatsCards, TimelineChart, SourcePieChart, TopicTreemap
- Pushed to GitHub as v0.1.0

#### Phase 2 (v0.2.0) — COMPLETATA
- Conda environment `fl-research-monitor` (Python 3.11) creato
- **PDFManager** (`backend/app/services/pdf_manager.py`):
  - Download PDF con validazione magic bytes
  - Storage organizzato: `data/pdfs/{year}/{source}/{title}.pdf`
  - Skip se PDF gia scaricato
  - Stats e listing dei PDF scaricati
- **PaperValidator** (`backend/app/services/validator.py`):
  - Validazione DOI via HEAD request a doi.org (302 = valido)
  - Validazione arXiv via abs page check
  - Validazione PMID via NCBI esummary
  - Validazione multi-identifier (DOI → arXiv → PMID)
- **TopicClassifier** (`backend/app/services/topic_classifier.py`):
  - Classificazione keyword-weighted (title: 0.4, abstract: 0.2 per keyword)
  - Confidence score 0.0-1.0
  - Bonus per match multipli
- **ExportService** (`backend/app/services/export_service.py`):
  - Export JSON con metadata e tutti i paper
  - Export XLSX multi-sheet: AllPapers, ByTopic, BySource, Statistics
  - Styled headers, auto-column width
- **DiscoveryService aggiornato**:
  - Integra PDF download automatico dopo discovery
  - Integra validazione automatica post-fetch
  - Integra topic classification automatica
- **API exports**: `/api/v1/exports/json` e `/api/v1/exports/xlsx`
- **CLI scripts**: `validate_papers.py`, `generate_registry.py`
- **Fix**: arXiv base URL da HTTP a HTTPS
- **Test**: Pipeline completo testato con successo
  - PubMed: 9 paper reali fetchati e validati (9/9 validated)
  - Export JSON (6.2 KB) + XLSX (9.2 KB) generati
  - Deduplicazione cross-topic funzionante

#### Files Created/Modified (Phase 2)
- NEW: `backend/app/services/pdf_manager.py`
- NEW: `backend/app/services/validator.py`
- NEW: `backend/app/services/topic_classifier.py`
- NEW: `backend/app/services/export_service.py`
- NEW: `backend/app/api/exports.py`
- NEW: `backend/scripts/validate_papers.py`
- NEW: `backend/scripts/generate_registry.py`
- NEW: `DEVELOPMENT_PLAN.md`
- NEW: `PROGRESS.md`
- MOD: `backend/app/services/discovery.py` (PDF + validation + classification)
- MOD: `backend/app/api/router.py` (exports router)
- MOD: `backend/app/clients/arxiv.py` (HTTPS fix)
- MOD: `backend/app/models/analysis.py` (missing import fix)

---

## Next Steps (Phase 3 — Dashboard Frontend)

1. Dashboard home con dati reali connessi al backend
2. Papers page con TanStack Table avanzata
3. Paper detail con PDF viewer
4. Discovery page con calendar heatmap
5. Topics page con sunburst visualization
6. Dark/Light mode toggle
7. Responsive design
