# FL-RESEARCH-MONITOR — Development Plan

**Last Updated:** 2026-04-22

---

## v2.40.7 — Smart Search UX + dedup whitespace fix (2026-04-22) — COMPLETATA

- [x] `discovery/page.tsx` — rimosso pulsante "Clear & new" dall'header Smart Search (era troppo prominente, colorato ambra). Aggiunto invece un link "Clear & new search" discreto (stile muted-foreground) in cima alla sezione ESPANSA, visibile solo quando c'è stato persistito (`results || jobId || keywords`). Non compare quando la sezione è collassata
- [x] Rimosso il duplicato in fondo alla sezione (era gated su `results`, ora ridondante col nuovo in cima)
- [x] `deduplication.py::find_existing_paper` — LIKE pattern cambiato da `%word1 word2 word3%` a `%word1%word2%word3%`. Diagnosi: il paper #22266 ha titolo con **doppi spazi** salvato nel DB; il normalize_title li rimuove, ma il LIKE SQL è literal e lo skippava dal set di candidati prima del fuzzy compare. Wildcard tra parole rende pre-filter tollerante a whitespace irregolari

**Motivazione:** user ha richiesto UX più coerente del pulsante Clear (non visibile da collapsed, meno invasivo). Ha anche segnalato che un paper già in DB (#22266) non veniva flaggato "already_in_db" quando lo stesso doc veniva riscoperto via IRIS Smart Search. Root cause isolata con test locale: `fuzz.ratio=100` perfetta corrispondenza post-normalize, ma SQL LIKE con spazio singolo non matchava un titolo DB con doppi spazi.

---

## v2.40.6 — Smart Search: no-store cache headers end-to-end (2026-04-22) — COMPLETATA

- [x] Backend `smart_search.py`: endpoint `POST /search` e `GET /status/{id}` ora settano `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` + `Pragma: no-cache` via `Response` header injection
- [x] Frontend `api.ts::smartSearch` (POST): aggiunto `cache: "no-store"` al fetch
- [x] Frontend `api.ts::authFetcher` (usato da SWR per GET status/recent): aggiunto `cache: "no-store"` a tutte le chiamate (include token refresh)

**Motivazione:** user ha segnalato che dopo deploy v2.40.3 (multi-window fix verificato funzionante via test end-to-end nel container prod: 9 risultati per "european health data space"), il client Chrome continuava a restituire 1 risultato stale — stesso identico a prima dei fix. Evidenza di caching intermedio (browser HTTP cache o service worker). Difensivo: forzare `no-store` su entrambe le sponde impedisce qualsiasi caching layer di interporsi tra richiesta e risposta. Primo fetch sarà sempre fresco.

**Note di sviluppo:** rinominato variabile locale `response` (dict dei dati) in `result` dentro `get_job_status` per non collidere con il parametro FastAPI `response: Response` usato per settare gli header.

---

## v2.40.5 — Smart Search: always-visible "Clear & new" button (2026-04-22) — COMPLETATA

- [x] Nuovo pulsante "Clear & new" (amber) nell'header della sezione Smart Search, sempre visibile quando `results !== null || jobId !== null || keywords.length > 0`
- [x] Indipendente da `smartExpanded` — funziona anche se la sezione è collassata
- [x] Click fa `stopPropagation` così non toggle l'espansione della sezione
- [x] Header diviso in 3 parti: click-area per expand/collapse (title), Clear button, freccia expand/collapse

**Motivazione:** user ha segnalato che il pulsante "Clear results & new search" era visibile solo dopo aver espanso la sezione E solo dopo aver aperto una ricerca precedente. Workflow scomodo: si blocca se la sezione è collassata. Ora Clear è al top-right dell'header, sempre raggiungibile con 1 click quando serve.

---

## v2.40.4 — Smart Search: persist expanded state across refresh (2026-04-22) — COMPLETATA

- [x] `smartExpanded` ora idratato da `localStorage.getItem("smart-search-expanded")` al mount
- [x] `useEffect` persiste `smartExpanded` in localStorage ad ogni cambio
- [x] `useEffect` auto-espande la sezione quando `results` è non-vuoto (anche dopo refresh quando SWR ri-idrata dal job id)
- [x] `newSearch()` rimuove anche `smart-search-expanded` dal localStorage per coerenza

**Motivazione:** user ha segnalato che dopo refresh il pulsante "Clear results & new search" scompariva pur rimanendo visibile il conteggio "(1 results)" nell'header. Diagnosi: tutta la UI Smart Search è wrappata da `{smartExpanded && ...}` e lo state `smartExpanded` era non-persistito (default false ad ogni mount). Al refresh la sezione si collassava; `results` veniva rihidratato da SWR via il jobId salvato, mostrando il conteggio nell'header ma nascondendo tutto il contenuto interno (inclusi i risultati e il pulsante Clear). Fix: persistenza + auto-expand se ci sono risultati.

---

## v2.40.3 — Smart Search IRIS: precision threshold + shorter cache (2026-04-22) — COMPLETATA

- [x] `_score_record` ora richiede token-coverage >= 60% prima di scorare (via `MIN_TOKEN_COVERAGE`). Impedisce che record con match solo su token generici ("data" + "health" da soli) siano ranked top per query specifiche multi-token ("European Health Data Space" = 4 token)
- [x] `CACHE_TTL_SECONDS` ridotto da 3600 a 1800 (30 min) per ridurre finestra in cui record "transient-deleted" da IRIS restino nella cache server-side. DSpace `Identify` dichiara `Deletion Mode: transient` — i record possono essere ritirati e reapparire

**Motivazione:** user ha segnalato due problemi correlati su Smart Search "European Health Data Space":
1. Il top result era "Bridging methods in health workforce planning: complementary approaches and the data they require" — clearly off-topic. Cliccando "Source" otteneva 404 dalla pagina IRIS. OAI-PMH `GetRecord` confermava `idDoesNotExist`: il record era stato eliminato da IRIS dopo il nostro harvest.
2. Il fatto stesso che il record scorasse top era un difetto di ranking: matchava solo su "data" e "health" (token generici comunissimi nel corpus WHO), mentre "european" e "space" non matchavano. Coverage 2/4 = 50%.

Con il fix coverage >= 60%, quel record viene automaticamente escluso dal ranking. Top 3 per "European Health Data Space" dopo fix: "Leveraging data, AI and digital health in WHO Europe" (2026-04-14), "Mental health WHO Europe review" (2026-03-19), "Artificial intelligence is reshaping health systems" (2026-04-20, = paper #22266).

---

## v2.40.2 — Smart Search IRIS: multi-window harvest (2026-04-22) — COMPLETATA

- [x] `iris_who.py::search` ora fa 2 harvest: Window A (ultimi 120 giorni, `max_records=1500`) + Window B (da year_from, `max_records=2000`), poi dedup per handle
- [x] Root cause documentato: DSpace OAI-PMH restituisce record in ordine datestamp ASC; con finestra larga il cap di 20 pagine (~1200 record) copre solo le pagine iniziali (più "vecchie"), mancando i record recenti. Il Window A è la chiave — finestra stretta fa entrare subito i docs freschi

**Verifica:** Paper #22266 (handle `10665/385097`, publicato 2026-04-20) ora TROVATO come top-1 per "artificial intelligence health systems" e top-7 per "HEALTH INFORMATION SYSTEMS". Smart Search latenza 35s (vs 30s precedente, +15% per il doppio harvest; cache 1h mitiga).

**Motivazione:** user ha segnalato che Smart Search non trovava un documento WHO/Europe del 2026 che lui stesso aveva importato manualmente. Diagnostic ha rivelato il bug dell'ordinamento ASC di DSpace OAI-PMH — la finestra larga paradossalmente nascondeva i docs nuovi.

---

## v2.40.1 — Smart Search fix: pub-date filter + preview buttons (2026-04-22) — COMPLETATA

- [x] `iris_who.py::search` — default `year_from = current_year - 2` quando l'utente non specifica un filtro
- [x] `iris_who.py::search` — post-filtro by `dc.date.issued >= year_from` (OAI `from` usa IRIS datestamp, non publication date; senza questo filtro risalivano documenti pubblicati anni fa ma reindicizzati di recente)
- [x] `iris_who.py::search` — senza query tokens, ordinamento per `publication_date` desc
- [x] Frontend Smart Search — helper `getSmartSourceUrl(r)` calcola URL sorgente per tutte le 7 sorgenti (DOI → doi.org, arXiv → abs, S2 → paper, PubMed → pmid, IRIS → handle)
- [x] Frontend Smart Search — supporto titolo cliccabile per `iris_who` nei risultati (usa `external_ids.iris_url`)
- [x] Frontend Smart Search — badge **Source** (emerald, apre pagina sorgente) e **PDF** (blue, solo se `pdf_url` ≠ source URL) su ogni risultato, `e.stopPropagation()` per non triggerare la checkbox

**Motivazione:** user ha testato v2.40.0 con "European Health Data Space" notando che IRIS restituiva documenti fino al 2023 mentre ne esistono di 2024-2026. Causa: `from` OAI-PMH è datestamp IRIS (upload/modifica del record), non data pubblicazione. Dopo fix: "EHDS" → 10 risultati con date reali 2024-2025-2026. Inoltre user voleva verificare i documenti prima di importarli (come già fatto in Add External Document); risolto con badge Source/PDF cliccabili.

**Smoke test locale post-fix:**
- "European Health Data Space" year_from=2024: 10 risultati (date range 2024-2026)
- "digital health" year_from=2024: 10 risultati, top-1 = "Demystifying artificial intelligence in health: what health policy-makers need to know" (2026-02)
- "artificial intelligence" year_from=2024: 1 risultato (stesso doc 2026-02 AI in health)

---

## v2.40.0 — Smart Search over IRIS (OAI-PMH harvest + local ranking) (2026-04-22) — COMPLETATA

- [x] `iris_who.py` — aggiunto `list_records(sets, from_date, max_records)` con paginazione via resumptionToken, cap 20 pagine per set (~2000 record), gestione `noRecordsMatch` e deleted records
- [x] `iris_who.py` — in-memory cache class-level (`_harvest_cache`, TTL 1h) per evitare refetch tra query della stessa sessione
- [x] `iris_who.py` — metodo `search(query, max_results, year_from, language)` = harvest + filtro lingua (default EN) + ranking token match (title 3x, subjects 2x, abstract 1x). Default sets: HQ (`com_10665_8`) + EU Europe (`com_10665_107131`)
- [x] `iris_who.py` — parser estratto in `_parse_xoai_record_node(record, handle)` riutilizzabile sia da GetRecord che da ListRecords
- [x] `smart_search.py` — registrato `IrisWhoClient` in `_get_clients`, aggiunto `iris_who` a `unsupported_modes` per title/author/doi (supporta solo keywords)
- [x] `query_generator.py` — mapping `keywords → iris_who` query stringa semplice (client fa local ranking)
- [x] Frontend — aggiunto `iris_who` a `ALL_SOURCES` in `/discovery`, entry in `SOURCE_LABELS`/`SOURCE_COLORS` ("WHO IRIS", sky-500)
- [x] Smoke test locale: 2000 record harvested in ~30s; 0 match su "federated learning"/"machine learning"/"artificial intelligence", 3 match su "digital health" → WHO IRIS come fonte per FL specifica produce rumore, utile per topic più policy/governance

**Motivazione:** user feedback dopo v2.39.3 ha chiesto di esplorare IRIS come fonte automatica partendo da un test di rilevanza keyword-driven. Smart Search è il container naturale (user-triggered, non-invasive). Implementato con harvest + local ranking dato che OAI-PMH non supporta full-text search.

**Finding operativo:** IRIS ha catalogo molto limitato su AI/ML/FL. La feature è utile per altri topic (digital health, EHDS, data governance, health systems). Valutazione se promuovere a discovery automatica (Phase 3) rimandata dopo ulteriori test utente con keyword più WHO-aligned.

---

## v2.39.4 — Bare handle UX clarification (2026-04-22) — COMPLETATA

- [x] Backend `resolve-external`: distingue errore "WHO report number vs IRIS handle" (pattern `^WHO[-/:]`) con messaggio dedicato
- [x] Frontend placeholder aggiornato per mostrare i 3 formati supportati: `iris.who.int/handle/10665/NNN · 10665/NNN · www.who.int/…/publications/…`

---

## v2.39.3 — WHO auto-fill: source preview + robust date parsing (2026-04-22) — COMPLETATA

- [x] `who_web.py` — `_normalize_date` ora gestisce `"20 April 2026"` / `"April 2026"` / `"April 20, 2026"` oltre ai formati ISO
- [x] `who_web.py` — estrazione JSON-LD schema.org (`<script type="application/ld+json">`) tramite HTMLParser esteso; popola `datePublished` (via `_jsonld_date`) e preferisce `sameAs` IRIS bitstream come `pdf_url` (via `_jsonld_pdf`)
- [x] Frontend `AddExternalDocument` — nuovo stato `resolvedSourceUrl`; dopo auto-fill il blocco Auto-fill mostra pulsanti "Open source" (emerald, URL originale in nuova tab) e "Open PDF" (blue, solo se diverso da source URL). Permette verifica visiva del documento prima di salvare
- [x] Smoke test: URL WHO/Europe AI reshaping health → DATE=2026-04-20 ✓, PDF_URL=iris.who.int/server/api/core/bitstreams/... ✓

**Motivazione:** Dopo v2.39.2 l'utente aveva segnalato due issue sul caso `www.who.int`: (a) nessun modo di verificare il documento prima di salvare, dovendo incollare l'URL in una nuova tab manualmente; (b) `publication_date` non popolato perché WHO non usa `citation_*` meta tag ma espone la data solo via JSON-LD (formato testuale "20 April 2026" che il parser esistente non gestiva). Entrambi risolti.

**Limite residuo noto:** autori e abstract non popolati per `www.who.int` perché la pagina non li espone come meta tag né JSON-LD (è un CMS Sitefinity che rende il contenuto via JavaScript lato client). Questi campi restano editabili manualmente. Workaround migliore: usare l'URL IRIS corrispondente quando disponibile (metadati xoai sono sempre più ricchi).

---

## v2.39.2 — WHO/IRIS auto-fill (OAI-PMH + page scraper) (2026-04-22) — COMPLETATA

- [x] Client `backend/app/clients/iris_who.py` — OAI-PMH 2.0 GetRecord verso `https://iris.who.int/server/oai/request` con `metadataPrefix=xoai` (Lyncode XOAI, formato più ricco disponibile). Parser xoai che estrae title, authors, date.issued, description.abstract, type, publisher, subjects. Mapping `dc.type → paper_type` (Journal articles / Reports / Guidelines / Technical Documents / …). Filtra descrizioni tipo page-count (v, 17 p.) dall'abstract
- [x] Client `backend/app/clients/who_web.py` — scraper HTML per `www.who.int/**/publications/**`. Estrae Google Scholar citation meta tags (`citation_title`, `citation_author`, `citation_pdf_url`, `citation_publication_date`) + Open Graph fallback. Euristica regione-da-URL per issuing organization. Heuristic paper_type=guideline se "Guideline" nel titolo
- [x] Endpoint `POST /papers/resolve-external` — dispatch basato su URL (iris.who.int → OAI, www.who.int → HTML scraper, bare handle 10665/NNN → OAI). Ritorna JSON compatibile con `CreateExternalDocumentRequest`
- [x] Frontend `/discovery` — componente `AddExternalDocument` esteso con blocco "Auto-fill from WHO / IRIS URL" sopra ai campi manuali. Enter key attiva fetch. Review manuale prima di save
- [x] Smoke test: 3 record IRIS reali (10665/52481, 10665/378307 EMT Türkiye, 10665/325375 Malta) — abstract, authors, date, paper_type corretti

**Motivazione:** workflow di inserimento manuale "Add External Document" (v2.39.0) richiedeva 7 campi a mano. Con auto-fill: incolla URL → 1 click → form popolato → review + save. Riduce tempo di inserimento da ~2min a ~10sec. Copre sia i documenti in IRIS (repository istituzionale) sia quelli sul sito pubblico WHO (www.who.int/publications/).

**Not in scope di questa release:** Phase 2 (harvest automatico via ListRecords + cron giornaliero) rimandata — si valuta dopo qualche settimana di uso di v2.39.2 per capire volumi e rilevanza.

---

## v2.39.1 — External Document: editable + visible in Papers (2026-04-22) — COMPLETATA

- [x] Backend: `UpdatePaperMetadataRequest` accetta `pdf_url`; `PUT /papers/{id}/metadata` lo salva
- [x] Frontend detail page: pulsante "Edit" ora visibile anche per `created_via === "external_document"` (oltre a my_manuscript/reviewing)
- [x] Frontend detail page: nuovo campo "Original URL / PDF link" nel form di editing
- [x] Frontend `/papers` lista: colonna paper_type renderizzata con badge colorato (usa `getPaperTypeBadge` da `paperTypes.ts`) — i documenti grey literature (REPORT/GUIDELINE/WHITE PAPER/STANDARD) sono visualmente distinti
- [x] Frontend `/papers` filtri: pillole filtro paper_type ora usano colore + label dedicato (es. "REPORT" invece di "report") con conteggio

**Motivazione:** dopo il deploy v2.39.0, un documento grigio esistente (#22266 WHO/Europe) non era modificabile dall'UI (Edit button gated a manuscript/reviewing, e comunque `pdf_url` non era tra i campi dell'endpoint metadata). Inoltre nel menu Papers i nuovi tipi apparivano come testo grigio qualsiasi, indistinguibili dai journal articles.

---

## v2.39.0 — Add External Document (grey literature) (2026-04-22) — COMPLETATA

- [x] Backend endpoint `POST /papers/external-document` — crea `Paper` con `paper_role="bibliography"`, `created_via="external_document"`, `paper_type` ∈ {report, guideline, white_paper, standard}, issuing organization salvata in `journal`, `pdf_url` con link originale
- [x] `paperTypes.ts` — 4 nuovi tipi con badge dedicati (report=slate, guideline=cyan, white_paper=stone, standard=zinc); nuova costante `EXTERNAL_DOCUMENT_TYPES` per dropdown form
- [x] `PaperInfoBox` — mapping `external_document: "External Document (grey literature)"`
- [x] `/discovery` — componente collassabile `<AddExternalDocument>` sotto `<ImportBibliography>`: title, issuing org, document type, publication date, original URL, authors (comma-separated), abstract; solo admin; Clear/Save + link "Open detail" al paper creato
- [x] Detail page funziona nativamente (rotta `/papers/[id]` non discrimina per paper_type)

**Motivazione:** letteratura grigia autorevole (WHO/Europe, OECD, EU Commission, ISO, FDA) senza DOI non entrava nel framework. Ora inserita come paper di bibliografia con `paper_type` dedicato per distinguerla dal peer-reviewed.

---

## v2.38.0 — Venue Key Dates (2026-04-20) — COMPLETATA

- [x] New table `venue_key_dates` (paper_id FK, label, date, is_done, notes, source_url, linked_round_id?, linked_journal_entry_id?)
- [x] API CRUD `/api/v1/venue-key-dates/{paper_id}` + `/entry/{id}`
- [x] `<VenueKeyDates>` React component (full + compact modes)
- [x] Full mode integrated above SubmissionTimeline in my-manuscripts detail
- [x] Compact mode at top of paper detail (only for paper_role=my_manuscript)
- [x] 19 preset labels covering IFKAD, FLICS, ICSIS + Custom
- [x] Urgency badges: done/overdue/urgent/upcoming/neutral
- [x] Optional bidirectional link to SubmissionRound and ReviewerEntry
- [x] Deploy VPS + verify paper 1041 (IFKAD 2026)

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

## Phase 8: Claude Opus Analysis + Smart Search (v2.0.0–v2.2.7) — COMPLETATA

- [x] Claude Opus 4.6 API come engine principale (sostituisce Gemma4)
- [x] AsyncAnthropic client per non-blocking durante analisi
- [x] Prompt v2 con regole R1-R6, etichette [Dal paper]/[Osservazione], formule LaTeX
- [x] Quick mode (~5 pagine, 1500-2500 parole) + Deep mode (~7+ pagine, 3500-6000 parole)
- [x] Auto PDF download prima dell'analisi (entrambi i mode)
- [x] Direct backend call (bypass Next.js proxy timeout)
- [x] Structured data extraction via Claude Haiku 4.5 (20+ campi)
- [x] Analysis History con CURRENT/SUPERSEDED per tipo
- [x] Smart Search ibrido: keywords, title, author, DOI
- [x] Bibliography import con DOI extraction multi-sorgente
- [x] CrossRef API per DOI resolution universale
- [x] Labels + Notes per paper
- [x] Paper disable/enable toggle
- [x] PDF upload + View PDF locale (serve file da backend)
- [x] Enrich: keyword merge da S2, PubMed, PDF extraction
- [x] PDF keyword extraction robusta (regex per section headings, footnotes, Unicode)
- [x] Zotero sync con label→sub-collection mapping
- [x] JWT auto-refresh su 401
- [x] High contrast buttons (dark backgrounds, white text)

---

## Phase 9: Comparison + Citations + Summary (v2.3.0) — COMPLETATA

- [x] **Paper Comparison page** (`/comparison`):
  - Tabella strutturata (13 campi) con paper in colonne
  - Research Gaps tab con aggregazioni (FL techniques, datasets, privacy, novelty, relevance)
  - Saved comparisons repository in localStorage con rename/delete
  - Export Excel (.xlsx) con SheetJS
  - Bottone "Confronta" nella selezione batch Papers
  - Sidebar link "Comparison"
  - Labels per paper nel comparison data
- [x] **Citation Refresh**:
  - Service batch via S2 batch API (500 paper/request, rate limited)
  - Service singolo paper via S2 single API
  - Fallback S2 durante discovery (PubMed/arXiv/bioRxiv con citation_count=0)
  - Job schedulato alle 07:00 UTC (dopo discovery 06:00)
  - Bottone "Refresh Citations (N)" nella selezione batch Papers
  - Icona refresh accanto a citation count nella pagina paper detail
- [x] **Summary Card** (da dati strutturati, zero costi):
  - Sezione nella pagina paper detail con Problem, Method, FL Techniques, Datasets, Performance, Assessment grid (Novelty, Relevance, Healthcare, Privacy, Reproducibility), Key Findings, Limitations
  - PDF export con template dedicato 1 pagina
- [x] **Summary LLM mode** (Claude Opus, 1 pagina, ~400 parole):
  - Terza modalità analisi accanto a Quick e Deep
  - Prompt tight: Overview, Method, Key Results, Assessment
  - Max 1500 tokens, badge arancione SUMMARY
  - Mode badge (QUICK/DEEP/SUMMARY) nel report header HTML+PDF
- [x] **Keyword Browser** in Discovery Smart Search:
  - Endpoint `/keywords/categorized` con dedup case-insensitive
  - Pannello browse con keyword per categoria (Author Keywords, S2 Fields, MeSH Terms)
  - Click per aggiungere keyword alla ricerca
  - Tag selector con remove singolo e "Clear all"
- [x] **Zotero sync migliorato**:
  - Upload tutti i mode (summary → quick → deep, ordine per evitare rename)
  - Delete vecchi attachment prima di upload
  - Gestione "exists" con force re-upload
  - mtime obbligatorio per Zotero API
- [x] **Papers list**:
  - Sort selector (8 opzioni: newest/oldest added, pub date, citations, title)
  - Analysis badges deduplicati con SUMMARY mode (arancione)
  - Labels in ordine alfabetico
- [x] **Label picker** con sezione "Assign existing" + "Create new"

---

## Phase 10: Docker Porting + VPS Deployment (v2.12.0 – v2.13.1) — COMPLETATA

- [x] **Docker local stack (v2.12.0)**:
  - [x] `backend/Dockerfile` multi-stage (Python 3.12-slim-bookworm + TeX Live + WeasyPrint libs, user appuser uid 1000, tini PID1, healthcheck)
  - [x] `frontend/Dockerfile` three-stage (Node 22-alpine + Next.js standalone output)
  - [x] `docker-compose.yml` (backend + frontend + Caddy :8080 on local)
  - [x] `Caddyfile` reverse proxy locale (no TLS)
  - [x] `.env.docker` isolato + `data-docker/` bind-mount separato dal dev nativo
  - [x] Frontend `next.config.ts`: `output: "standalone"` (ignored in dev)
- [x] **authHeaders helper + TS strict build (v2.12.1)**:
  - [x] `frontend/src/lib/authHeaders.ts` — SSR-safe, `Record<string, string>`
  - [x] Refactor 29 siti auth header in 8 file (reports, network, settings, peer-review, peer-review/[id], paper-quality/[id], papers/[id], lib/api)
  - [x] Rimossi 4 helper locali duplicati (`auth()`, `getAuthHeaders()`, 2 × `const auth = ...`)
  - [x] Rimosso flag temporaneo `typescript.ignoreBuildErrors`
- [x] **Backend production hardening (v2.13.0)**:
  - [x] `slowapi>=0.1.9` in requirements.txt
  - [x] Pydantic `Field(min_length=12, max_length=20)` su `CreateUserRequest.password` e `ChangePasswordRequest.new_password`
  - [x] Rate limit `@limiter.limit("5/minute")` su `POST /auth/login`
  - [x] Removed legacy manual checks `len(password) < 6`
  - [x] `app.state.limiter` + `RateLimitExceeded` exception handler in main.py
- [x] **Production config files (v2.13.0)**:
  - [x] `Caddyfile.production` — resmon.fabioliberti.com + Let's Encrypt + HSTS + security headers
  - [x] `docker-compose.production.yml` — ports 80/443/tcp + 443/udp (HTTP/3), APP_ENV=production, `./data` bind-mount
  - [x] `.env.production.example` committed (template), real `.env.production` solo sul VPS (gitignored, mode 600)
- [x] **Dockerfile fix (v2.13.1)**:
  - [x] Rimossa `COPY backend/alembic` (dir empty, untracked in git, bloccava build VPS)
- [x] **Production secrets generation (local Mac, never committed)**:
  - [x] `JWT_SECRET_KEY`, `ADMIN_PASSWORD` (20 char), `API_SERVICE_KEY` via `openssl rand`
  - [x] Salvati nel password manager dell'utente
- [x] **DNS Aruba**: A record `resmon.fabioliberti.com → 188.213.166.153`
- [x] **VPS preparation**: UFW 80/443, `/opt/reserch_mon/`, git clone pubblico
- [x] **Data transfer**: rsync di `backend/data/` → `/opt/reserch_mon/data/` (352 MB)
- [x] **`.env.production`** creato sul VPS con heredoc SSH, permessi 600
- [x] **Build production images** sul VPS (backend 990 MB, frontend 223 MB)
- [x] **Admin password mutation**: one-shot container effimero che sovrascrive l'hash in DB con la password production (risolve il problema che `seed_admin_user` skippa se esistono già utenti)
- [x] **Chown 1000:1000** di `/opt/reserch_mon/data/` per permessi container
- [x] **Docker compose up** produzione: Caddy + Let's Encrypt TLS-ALPN-01 challenge OK, certificato emesso
- [x] **HTTPS smoke test**: HTTP/2 200, HSTS attivo, `/api/v1/papers` → 401, login admin OK
- [x] **Merge su main** + push (nessun branch feature residuo)
- [x] **Documentazione Fase 2 completa** in `DEPLOYMENT_OPERATIVE_DOCKER.md` (gitignored, local only)

**URL produzione:** https://resmon.fabioliberti.com

---

## Phase 11: Operational Hardening (v2.14.0) — PIANIFICATA

**Obiettivo:** rendere il deploy produzione resiliente a guasti hardware, errori umani, e tentativi d'intrusione.

### 11.1 Backup automatico (priorità alta)

- [ ] Script cron notturno `/opt/reserch_mon/scripts/backup.sh`:
  - `tar czf backup-YYYYMMDD.tgz data/` (esclude `data/reports/tmp/`)
  - `gpg --symmetric --cipher-algo AES256` con passphrase nel password manager
  - Upload su **Backblaze B2** (o Wasabi, o S3 Glacier) via `b2 upload-file` o `rclone`
- [ ] Retention policy: 7 daily + 4 weekly + 3 monthly
- [ ] `healthchecks.io` ping a fine script (alert se backup non avviene entro 36h)
- [ ] Script di restore testato: `restore.sh backup-YYYYMMDD.tgz` ricrea `data/` vergine
- [ ] Documentare nel `DEPLOYMENT_OPERATIVE_DOCKER.md` sezione Backup & Restore
- **Tempo stimato:** 1-2 ore
- **Costo:** ~€0.50/mese per 100 GB retention

### 11.2 Uptime monitoring (priorità alta)

- [ ] **UptimeRobot** (free tier, 50 monitor):
  - Monitor HTTPS su `https://resmon.fabioliberti.com/health` via Caddy path routing (serve route Caddy dedicata `/health` → backend, attualmente intercettata da Next 404)
  - Oppure monitor TCP su `resmon.fabioliberti.com:443`
  - Check interval 5 min
  - Email + SMS alert (se pro plan)
- [ ] **Healthchecks.io** (free tier) per cron backup (vedi 11.1)
- **Tempo stimato:** 15-30 min

### 11.3 Caddy route `/health` bypass frontend

- [ ] Aggiungere in `Caddyfile.production` un `handle /health` che fa `reverse_proxy backend:8000` prima del catch-all frontend, così `/health` diventa disponibile pubblicamente per i monitor esterni (oggi va sul frontend 404)
- **Nota:** nessun rischio di leak perché `/health` espone solo `{"status":"ok","version":"0.1.0"}`

---

## Future Enhancements

### Deploy / Ops

- [ ] **CI/CD GitHub Actions → VPS** — push su main tag `v*` triggera build+push GHCR + SSH deploy su VPS
- [ ] **Staging environment** — terzo stack `staging.resmon.fabioliberti.com` per test pre-produzione
- [ ] **Ollama/Gemma4 sul VPS** — containerizzato o su macchina dedicata, se serve analisi LLM in italiano anche da produzione (oggi Ollama è solo sul Mac dev)
- [ ] **SSH port change 22 → 2222** — bonus sicurezza rimandato, da rivalutare se i log fail2ban crescono
- [ ] **Base image upgrade** bookworm → trixie (Debian 13) quando i pacchetti TeX Live saranno stabili

---

## Phase 12: Unified Paper Lifecycle (v2.15.0 – v2.16.1) — IN CORSO

**Obiettivo:** unificare paper pubblicati e non-pubblicati in un unico modello con ciclo
di vita tracciabile, collegare Peer Review al DB papers, e introdurre un diario strutturato
delle review ricevute — sia per paper da revieware per conto di journal, sia per paper
propri sottomessi a journal con osservazioni dai reviewer.

### 12.A — paper_role + collegamento peer_review → paper — COMPLETATA (v2.15.0-1)

- [x] Nuova colonna `paper_role` su `papers`: `'bibliography'` (default) | `'reviewing'` | `'my_manuscript'`
- [x] Nuova FK `peer_reviews.paper_id → papers.id` (nullable per retrocompatibilità)
- [x] Creazione Peer Review: crea automaticamente anche il paper nel DB con `role = reviewing` + titolo/journal
- [x] Titolo nella lista Peer Review → click apre `/papers/{id}` (pagina dettaglio standard)
- [x] Bottone "Peer Review" in `/papers/{id}` → apre `/peer-review/{id}` (allineato a destra accanto a Quality Review)
- [x] Filtro per ruolo nella papers list (All / Bibliography / Reviewing / My Manuscripts)
- [x] Badge ruolo nella papers list: REVIEWING (cyan) per reviewing, MY MANUSCRIPT (blu) per my_manuscript
- [x] Badge ruolo nell'header della paper detail page (REVIEWING / MY MANUSCRIPT)
- [x] Peer Review upload PDF → auto-link al paper record (`pdf_local_path`)
- [x] `peer_review_id` nella risposta PaperDetail per collegamento bidirezionale

### 12.B — Review Journal: diario delle review ricevute — COMPLETATA (v2.15.2-3)

- [x] Nuova tabella `reviewer_entries` (review_journal):
  - `id` PK, `paper_id` FK → papers
  - `reviewer_label` TEXT, `source_type` ENUM (email/pdf_annotated/editorial_letter/scholarone/verbal/other)
  - `received_at` DATE, `raw_text` TEXT, `attachment_path` TEXT NULL
  - `items_json` JSON array di osservazioni strutturate
- [x] Sotto-struttura `items`: text, section_ref, severity (major/minor/suggestion/praise), status (to_address/addressed/rejected_justified/not_applicable), response
- [x] Backend API CRUD: `GET/POST /review-journal/{paper_id}`, `PUT/DELETE /review-journal/entry/{id}`, `POST /entry/{id}/attachment`
- [x] Aggregate progress stats: total_observations, addressed, progress_pct
- [x] Frontend: ReviewJournal component (collapsible reviewer blocks, severity badges, status dropdown, response field, progress bar, add reviewer/observation forms)
- [x] Integrated in paper detail page (for reviewing/my_manuscript papers)
- [x] Integrated in peer review detail page (shared component, same data)

### 12.C — My Manuscript + Submission Timeline — COMPLETATA (v2.15.4-9, v2.16.0-1)

- [x] POST `/papers/my-manuscript`: create paper with `role=my_manuscript`, auto-create authors from comma-separated input
- [x] New `/my-manuscripts` page: creation form (title, authors, journal, date, abstract) + list with badges
- [x] New `/my-manuscripts/[id]` page: **side-by-side layout** — PDF viewer (left) + Submission Timeline + Review Journal (right), same pattern as Peer Review and Quality Review
- [x] Sidebar: new "My Manuscripts" entry between Peer Review and Quality Review
- [x] Paper detail: "My Manuscripts" button (blue, between Peer Review and Quality Review), links to `/my-manuscripts/{id}`
- [x] POST `/papers/{id}/mark-published?doi=...`: transition my_manuscript/reviewing → bibliography with DOI assignment
- [x] "Mark as Published" button in paper detail header (green pill, prompt for DOI)
- [x] PUT `/papers/{id}/metadata`: update title, abstract, journal, date, type, conference_url, conference_notes, github_url
- [x] EditableHeader component: inline edit form for non-bibliography papers
- [x] Submission Timeline (`submission_rounds` table):
  - round_number, label (standardized presets: Abstract/EA/Full Paper/Revised/Camera Ready/etc. + custom), document_type, submitted_at, deadline, decision (pending/accepted/accepted_with_revisions/minor/major/rejected), decision_at, decision_notes, document_path (per-round PDF)
  - Deadline tracking with visual urgency indicator (red "overdue!", amber "Nd left")
  - Full round editing: all fields editable after creation (label, doc type, dates, deadline, decision)
  - Per-round PDF upload/replace
  - Vertical timeline with colored dots (green=accepted, amber=revisions, red=rejected)
- [x] Conference URL + Notes fields in paper metadata (model + API + edit form + header display)
- [x] GitHub repository URL field in paper metadata (model + API + edit form + GitHub icon in header)

### 12.C+ — "Suggest & Confirm" match with published — PIANIFICATA
  - Durante la daily discovery, il match engine confronta i paper scoperti con i paper unpublished nel DB
  - Match per DOI esatto (confidenza altissima), titolo identico dopo normalizzazione (alta), titolo Levenshtein > 90% (media), titolo simile + autore in comune (alta)
  - **Mai merge automatico** → crea una `match_suggestion` con livello di confidenza
  - L'admin vede un badge nella Dashboard ("N match suggestions") e un banner nel paper detail
  - Click → modale side-by-side:
    - Sinistra: paper unpublished (titolo, autori, abstract, review journal)
    - Destra: paper scoperto (DOI, journal, abstract completo)
    - Bottoni: [Confirm Match → merge] [Not the same → dismiss] [Skip for now]
  - Caso raro (multipli candidati): modale con radio button per scegliere il match corretto
  - Al "Confirm Match": aggiorna il paper esistente (DOI, publication_date, journal, abstract arricchito, keywords, sources mergiati, `role → bibliography`), tutto lo storico (review journal, peer review, analisi, labels, notes, tutor check) preservato
  - Al "Not the same": paper scoperto creato come nuovo record `bibliography`, suggestion dismissed e mai riproposta
- [ ] Nuova tabella `match_suggestions`:
  - `id` PK
  - `unpublished_paper_id` FK → papers (il paper my_manuscript o reviewing)
  - `discovered_paper_data` JSON (snapshot dei dati del paper scoperto, prima di decidere)
  - `confidence` ENUM: `very_likely` | `likely` | `possible`
  - `match_reason` TEXT (es. "DOI exact match", "Title 95% similar + author overlap")
  - `status` ENUM: `pending` | `confirmed` | `dismissed`
  - `resolved_at` DATETIME NULL

### 12.D — Confidenzialità configurabile + polish (~1.5h)

- [ ] Nuova app_setting `review_papers_visible_to_viewers` (default: `true`)
  - Se `false`: paper con `role = reviewing` o `my_manuscript` visibili solo all'admin nella papers list e non accessibili via API per viewer
- [ ] Settings UI: toggle in sezione "Privacy"
- [ ] Badge ruolo nella papers list con colori distinguibili

### 12.E — Test end-to-end (~2h)

- [ ] Creare un Peer Review e verificare che il paper appaia nel DB con ruolo `reviewing`
- [ ] Creare un My Manuscript, aggiungere review journal con 2 reviewer e 5 osservazioni, verificare progress
- [ ] Simulare una discovery che matcha un my_manuscript → verificare suggestion + confirm merge
- [ ] Verificare che la pagina paper detail mostri correttamente tutti i tab (Abstract, Analysis, Review Journal, Quality)
- [ ] Verificare retrocompatibilità: peer review esistenti senza paper_id continuano a funzionare
- [ ] Verificare confidenzialità: viewer non vede paper con ruolo reviewing/my_manuscript quando setting è false

**Completato:** Phase 12.A + 12.B + 12.C + mobile responsive + uniform navigation (~16h)
**Residuo:** 12.C+ match engine (~3h) + 12.D confidenzialità (~1.5h) + 12.E test (~2h) = ~6.5h

### 12.F — Mobile Responsive + Uniform Navigation — COMPLETATA (v2.16.4 – v2.16.18)

- [x] All side-by-side pages responsive: Peer Review, Quality Review, My Manuscripts, Meta Review modal
  - Stack vertically on mobile (`flex-col lg:flex-row`), PDF fallback "Open PDF" button on mobile
  - Meta Review modal: full-screen on mobile (no overlay), EXT.ABS iframe `min-h-[60vh]`
- [x] All review list pages responsive: hide secondary columns on mobile, `table-fixed`, `break-words`
- [x] All header sections responsive: title `line-clamp-2`, buttons `flex-wrap`
- [x] Uniform navigation across all review menus:
  - Title click → paper detail page (Papers, Meta Review, Peer Review, Quality Review, My Manuscripts)
  - Paper detail page: 4 review buttons aligned right (Meta Review, Peer Review, My Manuscripts, Quality Review)
  - All review lists: Open + Del buttons per row with consistent naming
- [x] Hamburger menu on mobile with slide-in drawer (from Phase 10 session)

---

### Features funzionali

- [ ] **Start Peer Review** button on any paper (create PR linked to existing paper) — ~1h
- [ ] **My Manuscripts dedicated detail page** with full editing (currently side-by-side works, future: richer UI) — ~3h
- [ ] **Response Letter Generator** — generate "Response to Reviewers" document from Review Journal observations + responses — ~4h
- [ ] Citation network data from Semantic Scholar references
- [ ] Author tracking and affiliation analytics
- [ ] Full-text search via PostgreSQL tsvector
- [ ] Webhook notifications for new high-relevance papers
- [ ] Dashboard widgets per structured data aggregati
- [ ] Comparison UI refinement dopo uso reale
- [ ] Creazione primi tutor scientifici (ruolo `viewer`, account non admin via script CLI)
- [ ] Comparison export/import tra localStorage di origini diverse (Mac `:3000` ↔ VPS `resmon.fabioliberti.com`)
- [ ] **Zotero Group Library Sync** — per-label mapping (label → Group Library ID + collection), artifact selection per-label (PDF, EXT.ABS, Summary, Quick, Deep, Validation, Quality), filtri globali (tutor_check=OK, exclude disabled). Design: tabella `label_group_sync` + `paper_group_sync`. **Prerequisito**: osservare per 2-3 settimane se i tutor scrivono nel Group Library o sono solo lettori — determina se serve sync unidirezionale semplice (~8h) o merge bidirezionale con protezione campi (~12h)

### Completati (sessione 2026-04-14/15)

- [x] **Review Journal read-only for viewer (v2.20.0)** — all edit/add/delete buttons hidden for viewer, darker notes text, admin edit-lock
- [x] **Manuscript development center (v2.21.0–v2.24.1)** — Overleaf URL, multi-format upload, PDF/TEX/MD dropdowns, supplementary file with tabbed viewer
- [x] **Tutor notes (v2.22.0–v2.35.0)** — tutor_feedback entries with red ! TUTOR badge, addressee multi-select, status workflow (NEW→READ→REPLIED→ACKNOWLEDGED), email notifications at each transition
- [x] **Viewer permissions lockdown (v2.23.0–v2.25.0)** — comprehensive audit across all pages, fieldset disabled on review forms
- [x] **User Management (v2.25.1–v2.25.4)** — reset password inline, delete user, password strength bar (6 criteria, show/hide toggle)
- [x] **Login notifications (v2.26.0–v2.26.2)** — Gmail SMTP, login_log table, Settings panel with TXT/CSV export
- [x] **Guided Tours (v2.27.0–v2.28.3)** — driver.js sidebar + manuscript tours, sidebar NEW badges
- [x] **Document type classification (v2.29.0)** — 7 types with colored badges across manuscript pages
- [x] **Supplementary file (v2.30.0–v2.30.4)** — upload, tabbed viewer, red S badge with page count
- [x] **Submission status (v2.31.0)** — latest round decision badge in manuscript list
- [x] **Scheduled Jobs admin (v2.32.0–v2.33.7)** — full CRUD, DB-driven, topic filter multi-select, run logging, email notifications, citation refresh retry with backoff
- [x] **Development Notes + Bibliography Notes (v2.34.0–v2.34.7)** — per-user notes with edit lock, note icons in list
- [x] **Bibliography Analysis (v2.34.0–v2.34.7)** — page with 6 charts, cascade filters, sortable table, Year filter
- [x] **Extract Keywords from PDF (v2.28.4)** — button for papers without DOI
- [x] **Platform Presentation (v2.34.8)** — PDF documentation in About page
- [x] **Email integration (v2.26.0)** — Gmail SMTP for login, job completion, tutor note notifications

### Scalabilità condizionale

- [ ] **PostgreSQL** migration da SQLite (solo quando serve per multi-utente concorrenti o >10k paper)
