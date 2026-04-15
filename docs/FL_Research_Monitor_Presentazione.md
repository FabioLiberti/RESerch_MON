# FL Research Monitor — Presentazione della piattaforma

**URL:** https://resmon.fabioliberti.com
**Versione:** 2.34
**Autore:** Fabio Liberti

---

## Panoramica

FL Research Monitor è un framework integrato per il supporto alla ricerca scientifica nell'ambito del **Federated Learning**, con particolare attenzione alle applicazioni in ambito **Healthcare** e all'**European Health Data Space (EHDS)**.

La piattaforma automatizza la scoperta, l'analisi e la revisione di paper scientifici, interrogando quotidianamente sette database accademici internazionali: **PubMed**, **arXiv**, **bioRxiv/medRxiv**, **Semantic Scholar**, **IEEE Xplore** ed **Elsevier (Scopus)**. I paper scoperti vengono automaticamente deduplicati, validati, classificati per topic di ricerca e arricchiti con metadati e keyword dalle diverse fonti.

La piattaforma è accessibile da qualsiasi dispositivo (desktop, tablet, mobile) tramite browser web, senza necessità di installazione.

---

## Profili utente

| Profilo | Accesso | Funzionalità principali |
|---------|---------|------------------------|
| **Admin** | Completo | Gestione completa: discovery, analisi LLM, upload documenti, sincronizzazione Zotero, gestione utenti, configurazione |
| **Tutor** | Consultazione + feedback | Consultazione di tutte le sezioni, possibilità di lasciare **Tutor Notes** sui manoscritti in lavorazione |

---

## Descrizione dei menù

### 1. Dashboard

La pagina principale offre una panoramica sintetica dell'intero sistema:

- **Metriche globali** — numero totale di paper, nuovi paper scoperti, paper validati, paper con PDF
- **Heatmap delle attività** — calendario con intensità di colore che mostra l'attività di scoperta giorno per giorno
- **Timeline delle pubblicazioni** — grafico temporale con l'andamento delle scoperte
- **Distribuzione per fonte** — grafico a torta che mostra la provenienza dei paper (PubMed, arXiv, S2, IEEE, etc.)
- **Keyword cloud** — nuvola di parole chiave più frequenti nella bibliografia
- **Paper recenti** — gli ultimi paper aggiunti al sistema

### 2. Discovery

Sezione dedicata alla ricerca e scoperta di nuovi paper scientifici:

- **Smart Search** — ricerca manuale per keyword, titolo, autore o DOI, con scelta delle fonti da interrogare
- **Ricerche recenti** — storico delle ricerche effettuate con risultati e stato
- **Import by DOI** — importazione diretta di un singolo paper tramite DOI
- **Source health** — stato di connessione e funzionamento di ciascuna delle 7 fonti accademiche

*Nota: la scoperta automatica avviene quotidianamente alle 06:00 UTC senza intervento manuale.*

### 3. Topics

Gestione dei topic di ricerca monitorati dal sistema:

- **Federated Learning** — algoritmi, sistemi, privacy, ottimizzazione
- **FL in Healthcare** — studi clinici, imaging medico, EHR, ospedali
- **European Health Data Space (EHDS)** — regolamentazione, data governance, dati sanitari transfrontalieri

Ogni topic ha query personalizzate per ciascuna fonte accademica, keyword di riferimento e statistiche sul numero di paper classificati.

### 4. Papers

La bibliografia completa con oltre 1.100 paper scientifici indicizzati:

- **Ricerca full-text** nel titolo e abstract
- **14+ filtri** — per topic, fonte, keyword, label, tecnica FL, dataset, metodo, rating, citazioni, validazione, qualità, stato tutor check, PDF, Zotero
- **Ordinamento** — 8 opzioni (data aggiunta, data pubblicazione, citazioni, titolo A-Z/Z-A)
- **Dettaglio paper** — autori con ORCID, abstract, keyword cliccabili, link alle fonti originali, metadati completi, cronologia delle analisi

### 5. Meta Review

Coda di validazione degli **Extended Abstract** generati per ciascun paper:

- Elenco dei paper con Extended Abstract generato, raggruppati per paper e ordinati per rating
- Visualizzazione side-by-side: testo dell'analisi (sinistra) + rubrica di valutazione (destra)
- Ogni sezione dell'Extended Abstract viene valutata con punteggio 1-5 e commento
- L'Extended Abstract validato è l'unico artefatto condiviso con i tutor tramite Zotero

### 6. Peer Review

Modulo isolato per la revisione confidenziale di manoscritti ricevuti da journal e conferenze:

- Layout side-by-side: PDF del manoscritto (sinistra) + form di revisione strutturata (destra)
- **Template per journal** — supporta template specifici (es. IEEE T-AI con 10 criteri, rubrica, raccomandazioni)
- Esportazione in 4 formati: **PDF, LaTeX, Markdown, TXT** (quest'ultimo formattato per il copia-incolla su ScholarOne/EditorialManager)
- Note private, commenti all'autore, commenti confidenziali all'editor
- Completamente separato dalla bibliografia pubblica — i manoscritti sotto embargo non vengono indicizzati né sincronizzati

### 7. My Manuscripts

Gestione dei propri manoscritti sottomessi a journal e conferenze:

- **Elenco manoscritti** con badge di stato (tipo documento, decisione corrente, supplementary)
- **Pagina dettaglio** con layout split-pane:
  - **Pannello sinistro** — visualizzatore documenti con tab Main/Supplementary, toolbar per upload PDF/TEX/MD, link Overleaf
  - **Pannello destro** — Submission Timeline, Review Journal, Development Notes, Bibliography Notes, Bibliography
- **Submission Timeline** — tracciamento round per round delle sottomissioni con deadline, decisioni, PDF per versione
- **Review Journal** — feedback strutturato dei reviewer con severity (major/minor/suggestion/praise), stato, risposte
- **Tutor Notes** — i tutor possono lasciare le proprie osservazioni cliccando "**+ Add Tutor Note**". Le note tutor sono evidenziate in rosso con badge **! TUTOR** e visibili a tutti gli utenti
- **Development Notes** — note personali per-utente sullo sviluppo del manoscritto (icona blocco note giallo)
- **Bibliography Notes** — note personali per-utente sulla copertura bibliografica (icona lente indigo)
- **Bibliography** — elenco dei paper citati con contesto (Introduction, Related Work, Methodology, etc.), keyword aggregate, filtri cascade, export TXT/BibTeX/CSV
- **Bibliography Analysis** — pagina dedicata con 6 grafici (Keywords, Labels, Citations, Rating, Year, Context) e filtri cascade con tabella ordinabile

### 8. Quality Review

Valutazione strutturata della qualità scientifica dei paper nella bibliografia:

- **10 dimensioni** di valutazione: research question, literature review, methodology, results, discussion, limitations, reproducibility, originality, significance, writing clarity
- **5 gradi** — Excellent, Good, Adequate, Weak, Unreliable (con badge colorato per paper)
- **Versionamento** — ogni revisione del giudizio crea una nuova versione, con storico completo
- Layout side-by-side: PDF del paper (sinistra) + form di valutazione (destra)
- Esportazione per versione in PDF/LaTeX/Markdown/TXT

### 9. Network

Esploratore della rete di citazioni:

- **Grafo interattivo** (D3.js force-directed) con tre livelli: Co-Keywords, Co-Authors, Citations
- **Citation network** — grafo ego-centrico per singolo paper con referenze e citazioni da Semantic Scholar
- Filtro per numero minimo di citazioni, import batch di nodi esterni, export CSV

### 10. Compendium

Modulo didattico integrato con contenuti curati sul Federated Learning:

- **Learning paths** organizzati per livello: Beginner (Introduction to FL, FedAvg), Intermediate (Non-IID Data, FL Healthcare), Advanced (Differential Privacy, Personalization)
- Contenuti embedded dalla sotto-applicazione FedCompendium XL

### 11. Comparison

Confronto strutturato side-by-side tra più paper:

- **13 campi** di confronto: problema, metodo, tecniche FL, dataset, metriche, privacy, riproducibilità, novità, rilevanza, healthcare, risultati, limitazioni
- **Tab Research Gaps** — aggregazione di tecniche FL, dataset, meccanismi privacy, distribuzione novità/rilevanza
- Salvataggio comparazioni in memoria locale con rinomina/cancellazione
- Export in Excel (.xlsx)

### 12. Reports

Report giornalieri e analisi individuali:

- **Tab Daily** — report HTML generati automaticamente con statistiche e card per ogni nuovo paper scoperto
- **Tab Analysis** — report individuali per paper (Extended Abstract, Quick, Deep, Summary)
- Visualizzazione inline e download PDF

### 13. Settings

Configurazione del sistema (funzionalità variabili per profilo):

- **Tutti gli utenti** — cambio password con validazione di sicurezza (6 criteri, barra di forza visuale)
- **Solo admin:**
  - **Scheduled Jobs** — gestione job automatici (creazione, modifica orario, abilitazione/disabilitazione, trigger manuale, notifiche email, storico esecuzioni)
  - **User Management** — creazione, modifica ruolo, reset password, disabilitazione, eliminazione utenti
  - **Login Log** — registro accessi con export TXT/CSV
  - **Topics** — configurazione topic di ricerca e query per fonte
  - **API Keys** — panoramica chiavi API configurate
  - **PDF Author Signature** — firma personalizzata nel footer di tutti i PDF generati

### 14. About

Informazioni sul progetto:

- Versione corrente, tech stack, repository GitHub
- **Guided Tour** — possibilità di riavviare i tour interattivi (Tour Generale + Tour Manoscritto)

---

## Sidebar — Sezioni laterali

Nella barra laterale, sotto i menù principali, sono presenti quattro tab di navigazione rapida:

| Tab | Contenuto |
|-----|-----------|
| **Labels** | Etichette personalizzate assegnate ai paper (cliccabili per filtrare) |
| **Keys** | Keyword più frequenti nella bibliografia (min. 2 occorrenze, ordinate alfabeticamente) |
| **Topics** | Topic di ricerca configurati |
| **Paths** | Learning path del Compendium FL |

## Notifiche visive

- **Pallini rossi pulsanti** sui menù Meta Review, Peer Review, My Manuscripts, Quality Review quando è presente contenuto nuovo dall'ultima visita
- **Icone per paper** nella lista My Manuscripts:
  - **!** (rosso) — il paper ha feedback tutor
  - **Blocco note** (giallo) — il paper ha development notes
  - **Lente** (indigo) — il paper ha bibliography notes

---

**FL Research Monitor** — v2.34 — Aprile 2026
