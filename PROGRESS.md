# FL-RESEARCH-MONITOR — Progress Tracker

**Current Phase:** v2.40.0 — Smart Search over WHO IRIS (OAI-PMH harvest + local ranking)
**Current Version:** v2.40.0
**Status:** Framework LIVE at **https://resmon.fabioliberti.com** — WHO IRIS added as a Smart Search source. OAI-PMH harvest across HQ + EU Europe sets (last 24 months configurable), local tokenized ranking on title/abstract/subjects. First live probe shows IRIS has very limited content on ML/FL topics — the feature is more useful for health-policy / digital-health / data-governance keywords.

---

### 2026-04-22 — Session: v2.40.0 Smart Search over WHO IRIS

**Why:** dopo aver completato l'auto-fill per documenti WHO/IRIS (v2.39.0–v2.39.3), user ha chiesto di esplorare IRIS come fonte di ricerca automatica. Non prima di un test empirico di rilevanza: prima si verifica che IRIS contenga materiale relevante con query specifiche, poi si decide se vale un full cron di discovery automatico (Phase 3, rimandata).

**Design:** Smart Search (non Discovery cron) come container — è user-triggered, transparent, non inquina il DB finché l'utente non importa esplicitamente. Riusa il job worker esistente di `smart_search.py`.

**Challenge tecnica:** OAI-PMH è un protocollo di harvesting, non di ricerca — non supporta query full-text. Workaround implementato in `iris_who.py`:
1. `list_records(sets, from_date, max_records)` — pagina via resumptionToken su `ListRecords`, cap hardware 20 pagine per set (~2000 record totali)
2. In-memory cache class-level (`_harvest_cache`, TTL 1h) keyed by `(frozenset(sets), from_date)` — una volta harvestato, le query successive nella stessa sessione filtrano sui record in memoria senza rifetchare
3. `search(query, max_results, year_from, language)` orchestrating: harvest → filter lingua (default EN, esclude i 50%+ di record in FR/RU/DE/ES/AR/ZH) → tokenize query → score record per token match (title 3x, subjects 2x, abstract 1x) → top-N per score

**Architettura:** `_parse_xoai_record_node(record, handle)` estratto come funzione condivisa fra `get_record` e `list_records`. Default sets = HQ + EU Europe (`com_10665_8` + `com_10665_107131`), override possibile via kwargs.

**Integrazione Smart Search:** `IrisWhoClient` registrato in `_get_clients`; `iris_who` marcato unsupported per mode title/author/doi (solo keywords); `query_generator.py` mappa le keyword in una stringa piatta (il ranking avviene lato client).

**Frontend:** `iris_who` aggiunto a `ALL_SOURCES`, con label "WHO IRIS" e colore sky-500 (`#0ea5e9`) in `SOURCE_LABELS`/`SOURCE_COLORS`. Nessun cambio UI strutturale — la checkbox sorgente appare automaticamente.

**Probe locale (2000 record harvested da finestra from=2024-01-01):**
- Language distribution: EN=249, FR=74, RU=70, DE=40, ES=15, AR=12, ZH=6 (filtro `en` è essenziale)
- Paper type: report=402, journal_article=78
- **Match per keyword in title/abstract**:
  - `federated`: 0
  - `learning`: 0 (con window 1000 record), 1 con 2000 (false positive su "Evaluation policy")
  - `artificial intelligence`: 0
  - `machine learning`: 0
  - `data space`: 0
  - `digital health`: 3 ✓ (Regional Committee Tel Aviv 2022 — Regional digital health action plan)

**Finding operativo:** WHO IRIS come fonte per FL/AI/ML è povera. Ha valore per keyword di ordine health-policy / governance / digital strategy. Decisione su promozione a discovery cron rimandata dopo test aggiuntivi utente con keyword diverse.

**Ancillare v2.39.4:** parallelamente fissato bug UX minore — se utente incolla un WHO report number (`WHO-EURO-2026-...`) invece dell'IRIS handle, il backend ora ritorna un errore dedicato ("This looks like a WHO report number, not an IRIS handle"). Placeholder UI aggiornato con i 3 formati validi.

---

### 2026-04-22 — Session: v2.39.3 WHO auto-fill: source preview + robust date

**Why:** Test utente su v2.39.2 ha rivelato due gap:
1. Nei tre flussi (IRIS handle, WHO site, bare handle) l'auto-fill non dava modo di **verificare** il documento prima del save — costringeva l'utente a copiare l'URL, aprirlo in nuova tab a mano, e poi tornare al form. Frizione inutile.
2. Per URL `www.who.int` la `publication_date` restava vuota: WHO non espone `citation_*` meta tag come Google Scholar, ma usa JSON-LD schema.org con `"datePublished": "20 April 2026"` (formato testuale). Il parser esistente accettava solo formati ISO/numerici.

**What:**
- `who_web.py` — `_MetaTagParser` esteso per catturare blocchi `<script type="application/ld+json">...</script>`: handle_starttag rileva lo script type, handle_data buffera il contenuto, handle_endtag parsea JSON (anche array di oggetti e `@graph` annidato). Due helper `_jsonld_date` e `_jsonld_pdf` navigano ricorsivamente cercando `datePublished`/`dateCreated` e `sameAs` (che WHO usa per puntare al bitstream IRIS reale).
- `who_web.py` — `_normalize_date` riscritto per gestire 4 famiglie: ISO numerico, "DD Month YYYY", "Month DD, YYYY", "Month YYYY". Tabella `_MONTHS` con nomi Jan/January (EN) per risoluzione. Caso "April 2026" → default al primo del mese (YYYY-04-01).
- Endpoint `resolve-external` — catena fallback date estesa a 13 chiavi meta (citation_*, publication_date, article:published_time, og:article:published_time, dc.date, dc.date.issued, dcterms.issued, dcterms.created, dc.date.created, date) + fallback JSON-LD.
- Frontend — nuovo stato `resolvedSourceUrl` impostato dopo successo fetch. Nel blocco auto-fill appaiono due pulsanti conditionali: "Open source" (sempre presente, emerald bg, apre l'URL che utente ha incollato in nuova tab), "Open PDF" (blue bg, solo se pdf_url estratto ≠ URL originale — cioè quando il backend ha trovato un bitstream IRIS più specifico). Reset pulisce entrambi gli stati.

**Smoke test:** `https://www.who.int/europe/publications/i/item/WHO-EURO-2026-12707-52481-81471`
- Prima (v2.39.2): DATE=None, PDF_URL=source landing page
- Dopo (v2.39.3): DATE=2026-04-20 ✓, PDF_URL=`iris.who.int/server/api/core/bitstreams/ae3fcbfc-b6a0-4aad-a0b3-35027b451648/content` ✓ (il vero PDF)

**Gap che NON si risolve lato server per www.who.int:** autori e abstract non vengono esposti come meta tag o JSON-LD da www.who.int (il CMS Sitefinity rende il contenuto via JavaScript client-side). Tramite scraping server-side non si può ottenere oltre quanto già fatto. Workaround: usare l'URL IRIS corrispondente quando disponibile (xoai ha sempre metadati più ricchi). Altrimenti completare manualmente — il nuovo bottone "Open source" rende questo passaggio rapido.

---

### 2026-04-22 — Session: v2.39.2 WHO/IRIS auto-fill (OAI-PMH + HTML scraper)

**Why:** Dopo v2.39.0/v2.39.1 il form "Add External Document" richiedeva 7 campi compilati a mano (title, issuing org, type, date, URL, authors, abstract). Per letteratura grigia WHO — che è la fonte più rilevante per il corpus EHDS/digital health del progetto — volevamo un "paste URL → done" del tutto analogo a Import-by-DOI per il peer-reviewed. Ma WHO non ha DOI e l'API REST di IRIS è chiusa (401/403). Le due strade aperte erano OAI-PMH (protocol di harvesting DSpace, confermato aperto su iris.who.int con 782 set disponibili, formato xoai ricco) e HTML meta-scraping delle pagine www.who.int (citation meta tag Google-Scholar-style). Abbiamo implementato entrambe.

**What:**
- `backend/app/clients/iris_who.py` — client OAI-PMH con `get_record(handle)`. Usa `metadataPrefix=xoai` (formato Lyncode più ricco di `oai_dc`). Parser XML (stdlib ET) che itera la struttura annidata xoai `<element name="dc"><element name="title"><element name="none"><field name="value">...`. Dedup automatica dei valori ripetuti. Mapping `dc.type → paper_type` (Journal articles/Technical Documents/Guidelines/Governing Bodies documents/Reports/Publications → journal_article/report/guideline/white_paper/standard). Heuristic abstract: preferisce `description.abstract` qualificato, fallback a `dc.description` escludendo stringhe tipo "v, 17 p." / "292" (page counts).
- `backend/app/clients/who_web.py` — HTML scraper con `resolve(url)`. `HTMLParser` stdlib raccoglie tutti i `<meta name|property=... content=...>`. Legge `citation_title`, `citation_author` (multiplo), `citation_publication_date`, `citation_pdf_url`, `citation_publisher`, `og:description`. Euristica issuing org da path URL (/europe/ → WHO Regional Office for Europe, etc.). Heuristic paper_type=guideline quando "Guideline" nel titolo.
- Endpoint `POST /papers/resolve-external` in `api/papers.py` — pydantic `ResolveExternalRequest {url}`. Dispatcher: URL iris.who.int o bare 10665/NNN → IrisWhoClient; URL www.who.int → WhoWebClient; altrimenti 400. Ritorna dict normalizzato (`{source, title, issuing_organization, paper_type, publication_date, pdf_url, abstract, authors, keywords, external_ids}`).
- Frontend `/discovery` — blocco "Auto-fill from WHO / IRIS URL" in cima al form AddExternalDocument. Input full-width + pulsante "Auto-fill". Enter key attiva fetch. Tooltip esplicativo. Dopo fetch i 7 campi si pre-popolano, l'utente può correggere e salvare normalmente con il bottone "Save Document" già esistente.

**Smoke test effettuati localmente contro IRIS produzione:**
- `10665/52481` (Diagana 1989, Journal articles) → type=journal_article ✓, date=1989-12-31 ✓, 1 autore ✓, keywords=[Marriage, Women, Education for Health] ✓
- `10665/378307` (EMT Türkiye earthquake 2024, Technical Documents) → type=report ✓, date=2024-08-02 ✓, full abstract 1400+ caratteri ✓, keywords=[Disaster Medicine, Disaster Planning, …] ✓, journal="World Health Organization. Regional Office for Europe" ✓
- `10665/325375` (Calleja Malta 2016, Journal articles) — scoperta: dc.description conteneva "292" e "301" (page numbers). Fix euristico aggiunto: lunghezza >80 chars + no pagination pattern. Re-test OK.

**Non in scope (rimandato):** harvest automatico (`ListRecords` + cron) non implementato. Aggiunto in roadmap come Phase 2 — valuterò dopo qualche settimana di uso se il volume giustifica l'investimento. Codice del client OAI è già strutturato in modo estensibile (basta aggiungere il metodo `list_records`).

---

### 2026-04-22 — Session: v2.39.1 External Document editable + visible

**Why:** Dopo deploy v2.39.0, primo documento inserito (#22266 WHO/Europe "Digital health in the WHO European Region") non era modificabile da UI: il pulsante Edit sulla detail page era gated a `paper_role in (my_manuscript, reviewing)` e l'endpoint `PUT /metadata` non accettava `pdf_url`. Inoltre nel menu Papers i nuovi tipi apparivano come plain text lowercase, indistinguibili dagli altri — il valore dello sforzo di classificazione era visivamente perso.

**What:**
- Backend `UpdatePaperMetadataRequest`: aggiunto campo `pdf_url`; `PUT /papers/{id}/metadata` lo salva con la stessa logica degli altri campi (aggiornato solo se non-None).
- Frontend `/papers/[id]` EditableHeader: la condizione di visibilità del pulsante Edit include ora `created_via === "external_document"`. Aggiunto campo "Original URL / PDF link" nel form.
- Frontend `/papers` lista tabellare: colonna paper_type usa `getPaperTypeBadge()` per renderizzare un badge colorato (stesso stile badge già definito in `paperTypes.ts`). I tipi grey literature hanno palette distinta (slate/cyan/stone/zinc) dalle tipologie peer-reviewed.
- Frontend `/papers` filtri laterali: le pillole filtro paper_type usano ora i colori del badge + label ufficiale ("REPORT" invece di "report"), stato attivo con ring bianco.

**Impatto:** zero breaking changes. Endpoint retro-compatibile (pdf_url opzionale). Badge rendering funziona per tutti i paper_type esistenti (journal_article, preprint, conference, review, ...) — quelli non mappati in `PAPER_TYPE_OPTIONS` usano il fallback grigio di default.

---

### 2026-04-22 — Session: v2.39.0 Add External Document

**Why:** Il framework accettava solo paper con DOI (via Discovery automation, Smart Search, Import Bibliography, Import-by-DOI). La letteratura grigia istituzionale autorevole — report WHO/Europe, documenti OECD, white paper EU Commission, linee guida EMA/FDA, standard ISO/IEEE — non ha DOI ma è spesso la fonte primaria per contesto regolatorio e policy su FL in healthcare ed EHDS. Escluderla significava perdere una parte rilevante della letteratura di riferimento.

**What:**
- Backend: nuovo endpoint `POST /papers/external-document` in `backend/app/api/papers.py` — accetta title (obbligatorio), issuing_organization (→ `journal`), paper_type (report/guideline/white_paper/standard, validato server-side), publication_date, pdf_url (link originale), abstract, authors (comma-separated). Crea un `Paper` con `paper_role="bibliography"`, `created_via="external_document"`, `validated=True`.
- Frontend `paperTypes.ts`: 4 nuovi tipi nella lista `PAPER_TYPE_OPTIONS` con badge colorati (report/guideline/white_paper/standard); nuova costante `EXTERNAL_DOCUMENT_TYPES` per il dropdown della form.
- Frontend `PaperInfoBox.tsx`: aggiunto `external_document: "External Document (grey literature)"` nel mapping `VIA_LABELS`.
- Frontend `/discovery`: nuovo componente collassabile `<AddExternalDocument>` posizionato subito sotto `<ImportBibliography>`. Gated admin. Campi come da backend, submit verso `/api/v1/papers/external-document`, toast di successo con link "Open detail →" al paper creato.
- Detail page: nessuna modifica necessaria — `/papers/[id]` legge qualsiasi record via `_paper_to_detail()` senza discriminare per `paper_type`. Tutte le feature (abstract, PDF upload, topics, rating, tutor check, LLM analysis, Zotero sync) funzionano nativamente.

**Decisione di architettura:** collocazione in `/discovery` (non in `/papers`) perché `/discovery` è la pagina di "alimentazione" del framework (Run Discovery, Smart Search, Import Bibliography). Aggiungere qui il flusso per documenti senza DOI mantiene la coerenza semantica e rende il feature discoverable accanto al suo caso d'uso complementare.

**Impatto sui filtri esistenti:** zero. I dropdown paper_type in `/papers` leggono `/type-stats` dinamicamente dal DB, quindi i nuovi tipi appaiono automaticamente appena viene creato il primo record.

---

### 2026-04-20 — Session: v2.38.0 Venue Key Dates

**Why:** Each manuscript targets a venue (IFKAD, FLICS, ICSIS, ...) with its own calendar — submission deadlines, notifications, registration cut-offs, conference dates. Previously only per-round deadlines tracked in SubmissionTimeline. User needed a dedicated venue-level calendar, visible prominently at the top of the paper detail page because highly time-critical.

**What:**
- New table `venue_key_dates` (isolated — zero conflict with existing schema)
- CRUD API at `/api/v1/venue-key-dates/{paper_id}` + `/entry/{id}`
- Component `<VenueKeyDates>` with two modes:
  - **Full** (my-manuscripts detail, right column above SubmissionTimeline): dropdown preset of 19 labels covering all three target conferences, inline add/edit form, urgency badges, is_done checkbox, optional link to a SubmissionRound or ReviewerEntry
  - **Compact** (paper detail, at top, only for my_manuscript): top-4 priority cards (overdue > urgent > upcoming > done), "Manage →" link to full view
- Urgency color coding: done=emerald, overdue=red, urgent=amber (≤7d), upcoming=blue (≤30d), neutral=gray
- Preset labels cover IFKAD (track proposals, extended abstract, early-bird registration), FLICS/ICSIS (workshop paper, camera-ready), plus custom

**Paper 1041 (FedHR5.0 → IFKAD 2026) verification:**
- Extended Abstract already accepted_with_revisions (2026-02-24) — will mark as Done
- Full Paper Deadline 2026-05-01 (~11d) — will show as Urgent
- Early-Bird Registration 2026-04-20 (today) — will show as Urgent
- Conference Sessions 2026-07-01/03 — Upcoming event

---

### 2026-04-14/15 — Session: v2.20.0 → v2.35.0 (35+ releases)

**Review Journal & Tutor Notes (v2.20–v2.22, v2.27.1, v2.34.6, v2.35.0):**
- Review Journal read-only for viewer + admin edit lock (Edit/Done toggle)
- Tutor notes: source_type `tutor_feedback`, red box with ! TUTOR badge
- Editable observations (text, severity, delete)
- Notification system: addressee multi-select, status workflow (NEW→READ→REPLIED→ACKNOWLEDGED), email at each transition

**Manuscript Development Center (v2.21–v2.24, v2.29–v2.31):**
- Overleaf URL field, multi-format upload (.pdf/.md/.tex/.txt)
- Document panel with PDF/TEX/MD import-export dropdowns
- Supplementary file: upload, tabbed Main/Supplementary viewer, red S badge with page count
- Document type classification (7 types with colored badges)
- Submission status badge in manuscript list
- Paper Detail opens in new tab

**Viewer Permissions Lockdown (v2.23–v2.25):**
- Comprehensive audit: labels, notes, rating, TutorCheck, Zotero, forms disabled for viewer
- Sidebar: all menus visible, LLM references removed
- User Management redesigned: reset password inline, delete user, password strength bar (6 criteria)

**Login & Security (v2.25–v2.26):**
- Login notifications via Gmail SMTP + persistent login_log table
- Login Log in Settings with TXT/CSV export
- Password show/hide toggle on all fields

**Guided Tours (v2.27–v2.28):**
- driver.js: 12-step sidebar tour + 8-step manuscript tour
- Auto-start for tutor/viewer, manual restart for all from About
- Sidebar NEW badges (pulsing red dots) on 4 review sections

**Scheduled Jobs Admin (v2.32–v2.33):**
- Full CRUD: create/edit/delete/enable/disable/trigger jobs from Settings
- DB-driven (no more hardcoded), topic filter multi-select
- Run logging with persistent running state + live polling
- Email notifications per job with topic breakdown
- Citation refresh: retry with exponential backoff on 429
- Execution History with View Report link, run ID traceability

**Bibliography & Notes (v2.34):**
- Development Notes + Bibliography Notes (per-user, edit lock)
- Bibliography Analysis page: 6 charts + cascade filters + sortable table
- Extract Keywords from PDF button (papers without DOI)
- Note icons in manuscript list (! tutor, notepad dev, lens bib)

**Documentation:**
- README comprehensive update with all v2.20–v2.35 features
- Platform Presentation PDF in About page
- Image captions for architecture diagram and feature infographic

**Tags released:** v2.20.0 → v2.35.0 (35+ releases in one session)

---

### 2026-04-14 — Session: Pending items #1-#3

3 releases (v2.20.0 → v2.22.0), all pending items from previous session completed.

**v2.20.0 — Review Journal read-only + edit lock:**
- Viewer sees all Review Journal content but cannot modify (buttons hidden)
- Notes text darker (`text-foreground` instead of `text-muted-foreground`)
- Edit/Done toggle for admin: rating, decision, rubric, observation status locked by default, require explicit Edit click
- Attachment download accessible to all users

**v2.21.0 — Manuscript development center:**
- `overleaf_url` field in paper metadata (model, schema, API, EditableHeader form, header display)
- Emerald Overleaf icon in paper detail and my-manuscripts headers
- Submission round upload accepts .pdf, .md, .tex, .txt (was PDF-only)
- File type badge shows actual extension (PDF/MD/TEX/TXT)
- Backend validates allowed extensions with 400 error

**v2.22.0 — Tutor notes:**
- New source_type `tutor_feedback` with blue TUTOR badge
- Viewer sees "Add Tutor Note" button (simplified form: name + text)
- Viewer can edit/delete only their own tutor_feedback entries (Edit lock, notes, observations, attachments)
- Backend enforces: POST restricted to tutor_feedback for viewer, PUT/DELETE restricted to tutor_feedback entries
- Admin retains full control over all entry types

---

## Session Log

### 2026-04-12/13 — Session Phase 12 + Production bug fixes

Epic session: 35+ releases (v2.13.4 → v2.16.18), production bug fixes + Phase 12 implementation + full mobile responsive.

**Production bug fixes (v2.13.4 – v2.14.5):**
- Fix hardcoded `localhost:8000` in `api.triggerAnalysis` and `api.bibliographyExtract` (broke Claude analysis + Zotero upload in production)
- Mobile hamburger menu with slide-in drawer (sidebar accessible on mobile portrait)
- Page overflow fix for long paper titles (desktop + mobile)
- Discovery: "no results" feedback card + error messages in recent searches
- Missing `markdown` dependency (broke Claude analysis render on VPS)
- Raw LLM text safety net: save `raw_<mode>_<id>.txt` before render pipeline
- PDF keyword extractor: block pattern upgrades single-line results when more keywords found
- Sidebar: consistent `max-h-96` scroll on all 4 tabs (Labels, Keys, Topics, Paths)
- Save-as-topic missing `db.commit()`, exact paper count (`formatNumber` → `toLocaleString`), Papers header mobile layout
- Papers + Peer Review tables responsive (hide secondary columns on mobile)

**Phase 12.A — paper_role + peer_review→paper link (v2.15.0-1):**
- `paper_role` column: bibliography | reviewing | my_manuscript
- `peer_reviews.paper_id` FK with idempotent ALTER TABLE migration
- Peer Review creation auto-creates Paper with role=reviewing
- Peer Review list: title links to `/papers/{id}`, R badge for linked PRs
- Paper detail: "Peer Review" button (cyan), REVIEWING/MY MANUSCRIPT badges
- Papers list: role dropdown filter + role badges in table rows
- Existing PR #1 manually linked to Paper #1040 via one-shot script

**Phase 12.B — Review Journal (v2.15.2-3):**
- `reviewer_entries` table: reviewer_label, source_type, received_at, raw_text, attachment_path, items_json
- Observations: text, section_ref, severity (major/minor/suggestion/praise), status (to_address/addressed/rejected_justified/not_applicable), response
- ReviewJournal component: collapsible reviewer blocks, severity badges, status dropdown, response field, progress bar, add reviewer/observation forms
- Shared component: integrated in paper detail AND peer review detail

**Phase 12.C — My Manuscripts + Submission Timeline (v2.15.4-9, v2.16.0-1):**
- POST `/papers/my-manuscript` + POST `/papers/{id}/mark-published`
- PUT `/papers/{id}/metadata` with conference_url, conference_notes, github_url
- New `/my-manuscripts` list page + `/my-manuscripts/[id]` side-by-side detail page (PDF left, Timeline + Review Journal right)
- Sidebar: "My Manuscripts" entry
- Submission Timeline: `submission_rounds` table with round_number, label (standardized presets), document_type, submitted_at, deadline, decision, decision_at, decision_notes, per-round PDF
- Deadline tracking with visual urgency indicator (red overdue, amber within 7d)
- Full round editing: all fields editable after creation
- EditableHeader: inline metadata editing for non-bibliography papers
- Conference URL + Notes + GitHub URL in paper metadata with header display

**Mobile responsive (v2.16.4 – v2.16.18):**
- Peer Review detail: stack vertically on mobile, PDF fallback button, header wraps
- My Manuscripts detail: already responsive from creation
- Quality Review detail: stack vertically, PDF fallback, header wraps
- Meta Review modal: full-screen on mobile (no overlay), EXT.ABS iframe 60vh, PDF fallback
- Quality Review list: hide Grade/Score/Version/Updated on mobile, inline grade badge, title break-words
- Meta Review list: hide Rating/Last Generated, column widths, table-fixed + overflow-x-auto
- Peer Review list: hide Journal/Deadline/Status/Recommendation on mobile (already done earlier)

**Uniform navigation (v2.16.15 – v2.16.18):**
- All review list pages: title click → paper detail page (uniform behavior)
- Paper detail: 4 review buttons aligned right (Meta Review + Peer Review + My Manuscripts + Quality Review)
- All review lists: Open + Del buttons per row (consistent naming)

**Tags released:** v2.13.4 → v2.16.18 (35+ releases in one session)

---

### 2026-04-11 — Session Deployment Fase 1 + Fase 2

Sessione lunga in un giorno solo per portare il framework online.

**Fase 1 — Docker porting locale (v2.12.0):**
- Creato stack Docker locale completo (`backend/Dockerfile` multi-stage, `frontend/Dockerfile` con Next.js standalone, `docker-compose.yml`, `Caddyfile` locale)
- Isolamento totale dai dati veri: `data-docker/` separato + `.env.docker`
- Prima build 20-40 min (TeX Live + WeasyPrint libs), smoke test su `localhost:8080` — tutte le rotte verdi
- Dev locale nativo (`uvicorn :8000 + npm run dev :3000`) intatto e operativo in parallelo

**authHeaders refactor (v2.12.1):**
- `next build` strict ha rilevato 29 errori TS latenti nel pattern `headers: token ? { Authorization } : {}` distribuito su 8 file
- Creato helper `frontend/src/lib/authHeaders.ts` SSR-safe (return `Record<string, string>`)
- Refactor di tutti i 29 siti, rimossi 4 helper locali duplicati (`auth()`, `getAuthHeaders()`, 2 × `const auth = ...`)
- Rimosso flag temporaneo `typescript.ignoreBuildErrors`, build strict TS ora passa senza scorciatoie
- 1 callsite intenzionalmente non refattorizzata in `papers/[id]/page.tsx:614-616` (guard esplicito `if (!token) return Promise.reject(...)`, semantica diversa)
- Merge feature branch in main (51b1e81)

**Fase 2 — Deploy VPS produzione (v2.13.0 + v2.13.1):**

Backend hardening:
- `slowapi>=0.1.9` rate limiting
- Pydantic `Field(min_length=12, max_length=20)` su password
- `@limiter.limit("5/minute")` sul login endpoint
- Rimossi legacy manual `len < 6` check
- Test live: 5 × 401 → 6° 429, validazione Pydantic `< 12` e `> 20` → rejected

Production config files (mai committato `.env.production` reale, solo `.example`):
- `Caddyfile.production` con `resmon.fabioliberti.com` + Let's Encrypt + HSTS + security headers (X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, `-Server`)
- `docker-compose.production.yml` porte 80/443/tcp + 443/udp (HTTP/3), APP_ENV=production, bind `./data`, no `host.docker.internal`

Secrets production generati via `openssl rand` (JWT 62 char, ADMIN_PASSWORD 20 char, API_SERVICE_KEY 43 char) — salvati nel password manager dell'utente, mai nel repo.

DNS Aruba: record A `resmon.fabioliberti.com → 188.213.166.153`, propagato su Google + Cloudflare in ~5 min.

VPS preparation:
- UFW allow 80/443 (tcp + udp per HTTP/3)
- `/opt/reserch_mon/` creato con owner `fabio:fabio`
- Git clone pubblico dalla main

Data transfer:
- `rsync -avz` di `backend/data/` (352 MB, 520 file) al VPS in ~12 sec a 29 MB/s

`.env.production` creato sul VPS via SSH heredoc, permessi 600, gitignored.

Build VPS (problemi risolti):
1. **Bug v2.13.1**: `COPY backend/alembic` nel backend Dockerfile falliva perché la directory è vuota localmente e git non traccia dir empty → rimossa, DB creato via `Base.metadata.create_all` in lifespan
2. **Permission mismatch**: container `appuser` uid 1000 vs `fabio` uid 1001 → `sudo chown -R 1000:1000 /opt/reserch_mon/data`

Admin password mutation:
- Problema: i dati rsync-ati includono la tabella `users` con admin/admin hash legacy. `seed_admin_user()` skippa se ci sono già utenti, quindi `ADMIN_PASSWORD` in `.env.production` sarebbe stato ignorato
- Soluzione: one-shot container effimero `docker compose run --rm backend python -c "..."` che sovrascrive direttamente l'hash bcrypt del DB con la password production
- Da quel momento `admin/admin` invalidato sul VPS

Docker compose up -d production:
- Caddy su 80/443 (tcp+udp), backend + frontend su network interno
- Caddy log: `new ACME account registered` → `trying to solve challenge tls-alpn-01` → 5 verifiche multi-perspective da IP Let's Encrypt → `certificate obtained successfully`
- Primo certificato TLS firmato

Verifica end-to-end:
- `curl -I https://resmon.fabioliberti.com/` → HTTP/2 200, HSTS, X-Frame-Options, via: Caddy, alt-svc: h3
- `curl /api/v1/papers` → 401 (auth required, corretto)
- Login manuale browser con password production → OK, dati visibili

Documentazione:
- `DEPLOYMENT_OPERATIVE_DOCKER.md` (gitignored, local only) aggiornato con Fase 2 completa + runbook operations (start/stop/logs/backup/password reset)
- `DEVELOPMENT_PLAN.md` aggiornato con Phase 10 (VPS deployment) + Phase 11 (Operational hardening, pianificata) + Future Enhancements rivisti

**Tag git rilasciati oggi:** v2.12.0 → v2.12.1 → v2.13.0 → v2.13.1 (4 versioni in una sessione).

**Prossimo passo consigliato:** Phase 11.1 (backup automatico notturno + Backblaze B2) e 11.2 (uptime monitoring con UptimeRobot).

---

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
