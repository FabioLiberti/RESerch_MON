# Piano di sviluppo — miglioramenti della pagina Bibliography Analysis su resmon

Versione: 1 — 2026-04-23
Autore: Fabio Liberti
Destinazione: progetto RESerch_MON (resmon). Il documento nasce nella working directory IFKAD2026 come traccia di specifica; va poi portato nel repository di resmon.
Stato: bozza pianificatoria. Non implementato.

## 1. Obiettivo

Trasformare la pagina `/bibliography-analysis/{id}` da dashboard quantitativa a strumento di composizione bibliografica utile allo sviluppo di un manoscritto. Le funzioni attualmente presenti non supportano le decisioni che un autore prende durante la fase di allineamento bibliografia: cosa supporta cosa, dove la copertura è insufficiente, quali paper sovrapporre o tagliare, quali pilastri difendere.

Il piano è stato disegnato sulla base di un caso d'uso reale: lo sviluppo del manoscritto 1041 (FedHR5.0, IFKAD 2026), in cui il lavoro di allineamento è stato eseguito fuori da resmon attraverso tre documenti manuali (mapping sezione-paper, sintesi bibliografica, piano ricerca aggiuntiva). I miglioramenti qui proposti mirano a riportare quella logica dentro resmon, in forma parametrica e riutilizzabile per ogni manoscritto.

## 2. Motivazione

1. Ogni nuovo manoscritto aggiunto a `my_manuscripts` ripropone lo stesso bisogno di analisi bibliografica. Senza strumenti nativi, l'autore lo rifà a mano ogni volta.
2. Le analisi sintetiche di ciascun paper citato sono già generate sul sistema ma oggi non vengono aggregate in vista del manoscritto che le cita.
3. I tutor, quando consultano un manoscritto, non hanno una vista sintetica della copertura bibliografica. La pagina attuale mostra metriche, non argomentazioni.
4. La fase di ricerca bibliografica aggiuntiva, fortemente soggetta a deadline, beneficerebbe di un gap analysis automatico guidato dalla struttura del manoscritto in sviluppo.

## 3. Stato attuale della pagina

Frontend: `frontend/src/app/bibliography-analysis/[id]/page.tsx`, circa 430 righe.

Componenti oggi presenti:

- aggregati quantitativi: keyword cloud, label cloud, citation buckets, rating distribution, year distribution, context distribution;
- metriche aggregate: totale citazioni, media, massimo;
- filtri: keyword, label, citation range, rating, year;
- ordinamento: title, citations, rating, year;
- tabella riferimenti con metadati essenziali.

Limite: è una vista piatta e quantitativa. Rimanda a domande del tipo "quanti, di che anno, quanto citati" e non a "cosa supporta cosa, dove sto corto, cosa tagliare, quali sono i pilastri".

## 4. Roadmap a tre livelli

I livelli sono progressivi per valore e per complessità implementativa. Ogni livello è autonomamente utile e rilasciabile.

### Livello 1 — additivi quantitativi

Nessun coinvolgimento di LLM, solo organizzazione dei dati già presenti. Obiettivo: rendere azionabili le metriche esistenti.

| Feature | Descrizione | Dipendenze | Effort stimato |
|---|---|---|---|
| **Cluster tematici automatici** | raggruppamento dei paper per co-occurrence delle label; ciascun cluster mostrato con cardinalità, rating medio e citazioni totali | nessuna (label già presenti) | 1-2 giorni |
| **Classificazione pilastro / supporto / laterale** | regola deterministica: pilastro se citations >= soglia_A e rating >= 4; laterale se citations < soglia_B e rating <= 2; altrimenti supporto. Soglie configurabili. | nessuna | 1 giorno |
| **Heatmap anno × cluster** | matrice temporale per cluster tematico; evidenzia vuoti ("nessun paper 5.0 pre-2019") | cluster auto | 1 giorno |
| **Timeline di acquisizione** | quando ciascun paper è stato linkato al manoscritto, con marker di eventi chiave (submission, review, ecc.) | dati già presenti su `paper_references.created_at` | 1 giorno |
| **Indicatore di disabilitati / tutor_check** | quanti paper sono esclusi, flaggati review, confermati; con rimando alla lista | dati già presenti | mezza giornata |
| **Export CSV / BibTeX della vista filtrata** | esportazione di ciò che l'utente sta guardando in formato analisi o bibliografia | dati già presenti | mezza giornata |

Totale Livello 1: circa 5-6 giornate di sviluppo.

### Livello 2 — analisi semantica

Richiede LLM leggero sulle sintetiche già generate (Gemma4, locale, non costoso). Obiettivo: portare la pagina oltre le metriche quantitative.

| Feature | Descrizione | Dipendenze | Effort stimato |
|---|---|---|---|
| **Sezioni target del manoscritto (configurabili)** | l'autore definisce l'insieme di sezioni del proprio paper (default IMRAD; override per venue) | estensione modello dati (vedi §5) | 1 giorno |
| **Mapping semantico sezione → paper** | per ciascuna coppia (sezione, paper) calcolare similarity fra vettore di sezione e sintetica del paper; proporre assegnazione primaria/secondaria; override manuale | sezioni target + embeddings delle sintetiche | 2-3 giorni |
| **Matrice sezione × paper** | heatmap "supporto forte / medio / assente", con drill-down a livello di paper | mapping semantico | 1-2 giorni |
| **Densità di copertura per sezione** | punteggio 0-100% di copertura; radar chart dei vuoti | matrice sezione × paper | 1 giorno |
| **Sovrapposizioni fra paper** | coppie di paper con sintetiche altamente simili (cosine similarity oltre soglia); candidati al taglio o alla fusione argomentativa | embeddings delle sintetiche | 1 giorno |
| **Argument tag extraction** | estrazione di concetti ricorrenti dalle sintetiche (es. "differential privacy", "SECI", "workforce agility") con conteggio paper per concetto | LLM su sintetiche | 2 giorni |
| **Navigazione per concetto** | dato un concetto, elenco dei paper che lo trattano, con link a paragrafo rilevante della sintetica | argument tag extraction | 1 giorno |

Totale Livello 2: circa 9-11 giornate di sviluppo.

### Livello 3 — generazione di documenti

Obiettivo: trasformare la pagina da dashboard a strumento di composizione. I documenti generati sostituiscono il lavoro manuale svolto per il manoscritto 1041.

| Feature | Descrizione | Dipendenze | Effort stimato |
|---|---|---|---|
| **Auto-generation MAPPING** | tabella sezione → paper_id esportabile in Markdown/LaTeX; versionata | mapping semantico (L2) | 1 giorno |
| **Auto-generation SINTESI** | schede paper standardizzate con campi (contributo, metodo, rilevanza per sezione) + matrice sezione-argomenti; editing in-place per voce autoriale | argument tags + sintetiche | 3-4 giorni |
| **Auto-generation piano ricerca aggiuntiva** | identificazione di sezioni sotto-coperte; proposta di 3-5 keyword di ricerca per ciascun gap, con titolo concettuale del paper target | densità copertura + LLM | 2-3 giorni |
| **Export BibTeX con chiavi coerenti** | `.bib` pronto per Overleaf con chiavi `AutoreAnno` o schema configurabile; disambiguazione automatica in caso di omonimie | dati già presenti | 1 giorno |
| **Gap radar chart esportabile** | immagine radar della copertura moduli/sezioni; da includere in presentazioni ai tutor | densità copertura | 1 giorno |
| **Versioning dei documenti generati** | storico dei documenti (v1, v2, ...) con delta rispetto alla versione precedente; editing tracciato | tabella `manuscript_analysis_doc` | 2 giorni |

Totale Livello 3: circa 10-12 giornate di sviluppo.

## 5. Estensioni al modello dati

Alcune feature richiedono nuovi campi sul modello `Paper` e nuove tabelle.

### 5.1 Estensione `Paper` (solo per `paper_role='my_manuscript'`)

```python
class Paper(Base):
    # ... campi esistenti ...
    sections_json = Column(Text, nullable=True)
    # array ordinato di sezioni del manoscritto, es.
    # [{"code":"intro","title":"Introduction","word_budget":500}, ...]

    framework_elements_json = Column(Text, nullable=True)
    # opzionale: elementi teorici/architetturali del manoscritto
    # es. per FedHR5.0: [{"code":"M1","title":"Trust-based architecture"}, ...]

    venue_constraints_json = Column(Text, nullable=True)
    # vincoli editoriali, es.
    # {"max_words": 5000, "abstract_words": 400, "template": "ifkad-full-paper"}
```

### 5.2 Nuova tabella `ManuscriptSectionMapping`

Materializza l'assegnazione paper → sezione, con supporto a override manuale.

```python
class ManuscriptSectionMapping(Base):
    __tablename__ = "manuscript_section_mappings"
    id = Column(Integer, primary_key=True)
    manuscript_id = Column(Integer, ForeignKey("papers.id"), index=True)
    cited_paper_id = Column(Integer, ForeignKey("papers.id"), index=True)
    section_code = Column(String(50))
    role = Column(String(20))  # 'primary' | 'secondary' | 'none'
    similarity_score = Column(Float, nullable=True)  # da embeddings
    override_by_user = Column(Boolean, default=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

### 5.3 Nuova tabella `ManuscriptAnalysisDocument`

Documenti generati dal Livello 3, versionati.

```python
class ManuscriptAnalysisDocument(Base):
    __tablename__ = "manuscript_analysis_documents"
    id = Column(Integer, primary_key=True)
    manuscript_id = Column(Integer, ForeignKey("papers.id"), index=True)
    doc_type = Column(String(30))  # 'mapping'|'synthesis'|'research_plan'|'bibtex'
    version = Column(Integer)
    content_md = Column(Text)
    content_edited_md = Column(Text, nullable=True)
    generated_at = Column(DateTime)
    edited_at = Column(DateTime, nullable=True)
    status = Column(String(20))  # 'draft'|'edited'|'shared'|'archived'
```

### 5.4 Embeddings delle synthetic analysis

Cache dei vettori di embedding per ogni `synthetic_analysis` (campo aggiunto alla tabella esistente o tabella separata). Evita ricalcolo a ogni apertura pagina. Modello embeddings: locale (sentence-transformers) oppure OpenAI/Anthropic a scelta.

## 6. API da aggiungere

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/v1/bibliography-analysis/{manuscript_id}/clusters` | GET | cluster tematici automatici (L1) |
| `/api/v1/bibliography-analysis/{manuscript_id}/roles` | GET | classificazione pilastro/supporto/laterale (L1) |
| `/api/v1/bibliography-analysis/{manuscript_id}/mapping` | GET | matrice sezione × paper (L2) |
| `/api/v1/bibliography-analysis/{manuscript_id}/mapping/override` | PUT | override manuale di una cella di mapping (L2) |
| `/api/v1/bibliography-analysis/{manuscript_id}/coverage` | GET | densità di copertura per sezione (L2) |
| `/api/v1/bibliography-analysis/{manuscript_id}/overlaps` | GET | coppie di paper con sovrapposizione alta (L2) |
| `/api/v1/bibliography-analysis/{manuscript_id}/tags` | GET | argument tags con paper associati (L2) |
| `/api/v1/bibliography-analysis/{manuscript_id}/documents/{doc_type}` | GET, POST, PUT | documenti generati versionati (L3) |
| `/api/v1/bibliography-analysis/{manuscript_id}/bibtex` | GET | export BibTeX della bibliografia (L3) |

## 7. Dipendenze tra feature

```
Livello 1 (indipendenti fra loro)
  Cluster auto ──────────────┐
  Roles classification ──────┼──> Dashboard migliorato (rilascio 1)
  Heatmap anno × cluster ────┤
  Timeline ──────────────────┤
  Disabilitati / tutor_check ┘
  Export CSV / BibTeX ────────> utile già al Livello 1

Livello 2
  Estensione modello dati ────> Sezioni target configurabili ────┐
                                                                 ├──> Mapping semantico
  Cache embeddings sintetiche ─────────────────────────────────────┘
                                                                        │
                                                                        ├──> Matrice sezione × paper
                                                                        ├──> Densità copertura
                                                                        ├──> Sovrapposizioni
                                                                        └──> Argument tags ──> Navigazione per concetto

Livello 3 (richiedono L2 stabile)
  Auto-generation MAPPING ────> Export BibTeX
  Auto-generation SINTESI ────> Gap radar chart
  Auto-generation piano ricerca aggiuntiva
  Versioning documenti generati
```

## 8. Criteri di successo

Il piano è da considerare riuscito quando, per un nuovo manoscritto aggiunto a `my_manuscripts`:

- all'apertura della pagina `/bibliography-analysis/{id}` l'autore vede cluster tematici e classificazione pilastro/supporto/laterale senza alcuna azione (Livello 1);
- dopo aver configurato le sezioni target, il mapping sezione × paper è pre-compilato con similarity > 0.7 e l'autore conferma o corregge (Livello 2);
- con un click viene generato un documento `MAPPING.md` già condivisibile in forma tecnica e un documento `SINTESI.md` pronto per il passaggio di editing umano (Livello 3);
- il tempo di allineamento bibliografia per il manoscritto successivo scende da 2 giornate (tempo misurato sul manoscritto 1041) a 0.5 giornate, una volta abilitati tutti e tre i livelli.

## 9. Stima effort totale

- Livello 1: 5-6 giornate.
- Livello 2: 9-11 giornate.
- Livello 3: 10-12 giornate.
- Estensione modello dati e API di supporto: 3-4 giornate (trasversale).

Totale: circa 27-33 giornate di sviluppo singolo-sviluppatore, rilasciabili in tre milestone separate.

## 10. Caso d'uso di riferimento

Il manoscritto 1041 (FedHR5.0, IFKAD 2026) è il caso su cui il piano è stato dimensionato. I tre documenti prodotti manualmente per quel manoscritto, presenti nel repository IFKAD al percorso `paper/`, sono:

- `BIBLIOGRAFIA_MAPPING_v2.1.md` — mapping sezione → paper_id con link resmon;
- `BIBLIOGRAFIA_SINTESI_v2.md` — sintesi narrativa dei paper citati con matrice sezione-argomenti;
- `bibliografia_ricerca_aggiuntiva.md` — piano di ricerca aggiuntiva ordinato per gap.

Questi tre documenti costituiscono la specifica funzionale informale di ciò che il Livello 3 deve generare in forma automatica. Vanno consultati come riferimento di stile e di struttura in fase di implementazione.

## 11. Note implementative

- Il carico LLM del Livello 2 e 3 deve preferire modelli locali (Gemma4 su Ollama) per contenere i costi e non dipendere da servizi cloud a pagamento. Solo le estrazioni più delicate (argument tags su grandi bibliografie, differenze semantiche fini) possono essere delegate al canale cloud esistente del sistema.
- La cache degli embeddings va invalidata quando la synthetic analysis viene rigenerata o editata.
- Le decisioni di override dell'autore (ad esempio, forzare un paper a essere "primario" su una sezione anche se la similarity è bassa) vanno sempre preservate rispetto a ricalcoli successivi.
- L'editing umano dei documenti generati (Livello 3) va tracciato con un flag visibile sul documento, così il tutor sa quali parti sono state riviste manualmente e quali provengono dal generatore.

## 12. Ordine di rilascio raccomandato

1. Livello 1 completo (rilascio singolo). Beneficia anche i manoscritti già esistenti senza richiedere alcuna configurazione autore.
2. Estensione modello dati e sezioni target configurabili.
3. Mapping semantico e matrice sezione × paper (parte visiva del Livello 2).
4. Densità copertura, sovrapposizioni, argument tags (parte analitica del Livello 2).
5. Generazione documenti Livello 3 (MAPPING, SINTESI, piano ricerca).
6. Versioning documenti e editing tracciato.

A ogni rilascio, validare con almeno due manoscritti diversi di `my_manuscripts`.

## 13. Cosa è fuori scope

- Generazione automatica del testo delle sezioni del paper. Questo compito è assegnato a un modulo separato ("Section Composer") e non è parte della pagina di analisi bibliografia.
- Gestione del full-text dei paper citati: la pagina lavora sulle sintetiche, non sui PDF integrali. La navigazione al PDF è già disponibile nella scheda paper e non va duplicata.
- Collegamento con Zotero: già gestito al livello di sincronizzazione paper; la pagina di analisi lo tratta come fornitore di metadati, non come destinazione di analisi.
