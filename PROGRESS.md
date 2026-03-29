# FL-RESEARCH-MONITOR — Progress Tracker

**Current Phase:** Phase 3 — COMPLETATA
**Current Version:** v0.3.0 (ready to push)
**Next Phase:** Phase 4 — Automation + Analysis

---

## Session Log

### 2026-03-29 — Session 1

#### Phase 1 (v0.1.0) — COMPLETATA
- Full project scaffold pushed to GitHub

#### Phase 2 (v0.2.0) — COMPLETATA
- PDFManager, PaperValidator, TopicClassifier, ExportService
- Pipeline testato: 9 paper reali, 9/9 validati

#### Phase 3 (v0.3.0) — COMPLETATA
- **Discovery API** (`backend/app/api/discovery.py`):
  - POST `/api/v1/discovery/trigger` — trigger discovery in background
  - GET `/api/v1/discovery/status` — check if running
  - Supports topic/source filtering via query params
- **Dashboard Enhanced**:
  - HeatmapCalendar component (GitHub-style activity heatmap)
  - Export buttons (JSON/XLSX) nella dashboard header
  - All charts collegati a dati reali via SWR
- **Discovery Page Enhanced**:
  - Source health cards con paper count, last fetch, status
  - "Run Discovery" button con background execution
  - Per-source "Fetch" button
  - Running status banner con spinner
  - Click source card → fetch history table
  - Real-time status polling (3s interval)
- **Topics Page Enhanced**:
  - Topic cards grid con gradient colors
  - Paper count + percentage bar per topic
  - Click topic → filtered papers list
  - Source queries detail view
  - Keywords preview
- **Network Page**:
  - D3.js force-directed graph (co-topic network)
  - Node size = citation count, color = source
  - Drag to rearrange, tooltips on hover
  - Labels for high-citation papers
  - Network stats (nodes, sources, citations)
  - Source legend
- **Settings Page Enhanced**:
  - Full topic CRUD: create, edit, delete
  - Topic form: name, description, keywords, per-source queries
  - API keys info section
  - System info section
- **Dark/Light Mode**:
  - Light theme CSS variables
  - Theme toggle via `.light-theme` class
- **Responsive Design**:
  - Sidebar hides on mobile (< 768px)
  - Content takes full width on mobile
  - Responsive grids throughout
- **CSS Improvements**:
  - Inter font from Google Fonts
  - Fade-in animation for page transitions
  - Line-clamp utilities
  - Font smoothing

#### Files Created/Modified (Phase 3)
- NEW: `backend/app/api/discovery.py`
- NEW: `frontend/src/components/charts/HeatmapCalendar.tsx`
- NEW: `frontend/src/components/charts/CitationNetwork.tsx`
- NEW: `frontend/src/components/layout/Header.tsx`
- MOD: `backend/app/api/router.py` (discovery router)
- MOD: `frontend/src/app/page.tsx` (heatmap, exports)
- MOD: `frontend/src/app/discovery/page.tsx` (fetch trigger, logs)
- MOD: `frontend/src/app/topics/page.tsx` (cards, papers, queries)
- MOD: `frontend/src/app/network/page.tsx` (D3 graph)
- MOD: `frontend/src/app/settings/page.tsx` (topic CRUD)
- MOD: `frontend/src/app/layout.tsx` (responsive, fonts)
- MOD: `frontend/src/app/globals.css` (light theme, animations)
- MOD: `frontend/src/lib/api.ts` (discovery, sources APIs)

---

## Next Steps (Phase 4 — Automation + Analysis)

1. AnalysisService (synthetic paper analysis)
2. ReportGenerator (daily HTML/PDF reports)
3. ZoteroClient + ZoteroSyncService
4. APScheduler integration (daily fetch job)
5. GitHub Actions improvements
