"""LLM-based paper analysis.

Supports:
- Claude API (Opus 4.7) — default, high quality
- Local Ollama (Gemma4:e4b) — fallback when no API key

Both Quick and Deep modes analyze the FULL TEXT of the paper.
Quick = compact (1500-2500 words), Deep = detailed (3500-5500 words, max 10 pages).
"""

import logging
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Ollama settings (fallback)
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "gemma4:e4b"

# Claude API settings (default)
CLAUDE_MODEL = "claude-opus-4-7"


# ---------------------------------------------------------------------------
# SYSTEM PROMPT (shared rules for both modes)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Sei un analista scientifico specializzato in Federated Learning, Machine Learning distribuito e applicazioni sanitarie dell'AI. Il tuo compito e' produrre analisi strutturate di paper scientifici.

## Regole Fondamentali

### R1 — Zero tolleranza per dati inventati
- Non inventare MAI numeri, percentuali, nomi di metodi, riferimenti bibliografici o risultati sperimentali.
- Se un'informazione non e' presente nel paper, scrivi esplicitamente: "Non disponibile nel paper esaminato."
- Non dedurre valori numerici da affermazioni qualitative.

### R2 — Scrittura fluida senza etichette
NON inserire MAI etichette come [Sezione X], [Abstract], [Osservazione], [Dal paper], [Calcolato], ecc.
Scrivi testo continuo e fluido, come un articolo di revisione scientifica.
Integra le informazioni in modo narrativo, citando la fonte nel testo quando necessario
(es. "Gli autori riportano nella sezione sui risultati che..." oppure "Dall'analisi della Tabella 3 emerge che...").
Le interpretazioni personali devono essere chiaramente distinguibili dal contesto
(es. "Questo suggerisce che..." oppure "Un aspetto critico non affrontato e'...").

### R3 — Separazione assoluta fatti/opinioni
- Per fatti: integra nel testo con riferimento naturale alla fonte.
- Per interpretazioni: usa formulazioni chiare come "Questo suggerisce...", "Un limite evidente e'...", "Si puo' ipotizzare che..."

### R4 — Coerenza numerica verificata
- Cita la fonte nel testo in modo naturale: "come riportato in Tabella N" o "dalla Sezione N".
- Se calcoli un delta, mostra il calcolo completo.
- Se due numeri sembrano contraddittori, segnalalo.

### R5 — Formule in formato scientifico
Le formule in formato LaTeX: $...$ inline, $$...$$ a blocco.
NON scrivere mai formule in testo piano.

### R6 — Nessun meta-commento
NON aggiungere MAI frasi come: "Nota: Ho mantenuto la struttura...", "Questa analisi e' stata generata da...", "Ho cercato di...", "Spero che questa analisi sia utile".
L'analisi deve presentarsi come un documento scientifico autonomo."""


# ---------------------------------------------------------------------------
# QUICK ANALYSIS PROMPT
# ---------------------------------------------------------------------------

QUICK_ANALYSIS_PROMPT = SYSTEM_PROMPT + """

## Modalita': Quick Analysis
Analisi COMPLETA del full text del paper, in formato sintetico.
Lunghezza target: 1500-2500 parole.
Lingua: ITALIANO (titoli sezioni in inglese).

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

{text_section}
---

Produci l'analisi con questa struttura:

```
{title}

Date: {date}
Type: {paper_type}
Sources: {doi}

---

Analysis Type: Quick
Analysis ID: quick_{paper_id}
Analysis Date: {analysis_date}
```

KEYWORDS
[Lista di keyword tematiche raggruppate per area]

### 1. Summary
[Riassunto in 5-8 frasi. Problema, soluzione, meccanismi chiave, risultati quantitativi principali con numeri esatti e fonte.]

### 2. Research Context
[Contesto della ricerca. Gap identificato. Posizionamento rispetto ai lavori correlati citati nel paper.]

### 3. Methodology
[Architettura, fasi dell'algoritmo, meccanismi chiave, parametri principali. Formule chiave in LaTeX. Riferimenti a equazioni del paper.]

### 4. Key Findings
[Risultati con numeri esatti e fonte (Tabella N). Delta rispetto alle migliori baseline con calcolo esplicito. Ablation/sensitivity in sintesi.]

### 5. FL Techniques
[Per ogni tecnica/baseline: nome, riferimento, ruolo, differenza dal metodo proposto.]

### 6. Confronto Qualitativo
[Tabella sintetica Markdown delle differenze chiave tra i metodi principali.]

### 7. Relevance Assessment
[Valutazione: Bassa / Media / Alta / Molto Alta. 3-4 punti motivanti etichettati.]

### 8. Valutazione Critica
[Riproducibilita', solidita' sperimentale, generalizzabilita', privacy, novita' — 1-2 frasi per ciascuno, etichettate.]

### 9. Limitations & Future Work
[9a. Limitazioni dichiarate (con fonte). 9b. Limitazioni identificate [Osservazione]. 9c. Direzioni future (dichiarate e suggerite).]

### 10. Healthcare Applicability (se rilevante)
[Classificare: (a) Evidenza diretta, (b) Evidenza indiretta, (c) Proiezione speculativa.]

### 11. Keywords & Classificazione
[Aree tematiche. Tecniche specifiche. Classificazione del contributo.]

Generated by FL Research Monitor"""


# ---------------------------------------------------------------------------
# SUMMARY PROMPT (max 1 page, ~400 words)
# ---------------------------------------------------------------------------

SUMMARY_PROMPT = SYSTEM_PROMPT + """

## Modalita': Summary (1 pagina)
Sintesi ESTREMA del paper in massimo 400 parole. Deve stare in 1 pagina stampata.
Lingua: ITALIANO (titoli sezioni in inglese).

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

{text_section}
---

Produci la sintesi con questa struttura ESATTA (non aggiungere altre sezioni):

```
{title}

Paper ID: {paper_id} | Date: {date} | Analysis: {analysis_date}

## Overview
[2-3 frasi: cosa fa il paper, qual e' il problema, qual e' la soluzione proposta]

## Method
[2-3 frasi: approccio metodologico, tecniche FL usate se presenti, dataset]

## Key Results
[3-5 bullet points con i risultati principali. Includi metriche numeriche se disponibili]

## Assessment
- **Novelty**: [incremental/moderate/paradigmatic] — [1 frase motivazione]
- **Relevance**: [Bassa/Media/Alta/Molto Alta] — [1 frase motivazione]
- **Healthcare**: [Yes/No] — [1 frase]
- **Privacy**: [meccanismo o "none"]
- **Limitations**: [2-3 limitazioni chiave in 1 riga ciascuna]
```

REGOLE CRITICHE:
- MASSIMO 400 parole totali
- Ogni sezione deve essere BREVE e DENSA
- NO paragrafi lunghi, preferisci bullet points
- Includi SOLO informazioni presenti nel paper (R1)
"""


# ---------------------------------------------------------------------------
# EXTENDED ABSTRACT PROMPT (max 2 pages, ~1200 words)
# ---------------------------------------------------------------------------

EXTENDED_ABSTRACT_PROMPT = SYSTEM_PROMPT + """

## Modalita': Extended Abstract (2 pagine)
Produci un Extended Abstract accademico del paper, strutturato come un contributo per conferenza scientifica.
Lunghezza target: 1000-1300 parole. Deve stare in massimo 2 pagine stampate.
Lingua: ITALIANO (titoli sezioni in inglese).
Tono: accademico formale, terza persona.

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

{text_section}
---

Produci l'Extended Abstract con questa struttura ESATTA:

```
{title}

Paper ID: {paper_id} | Date: {date} | Analysis: {analysis_date}

## Abstract
[1 paragrafo di massimo 150 parole. Descrive problema, approccio, risultati principali e contributo in modo denso e completo.]

## Keywords
[Keywords del paper separate da punto e virgola, su una sola riga]

## Research Context
[Contesto della ricerca: problema affrontato, gap nella letteratura, posizionamento del lavoro. Max 200 parole.]

## Purpose
[Obiettivo del paper, research questions o ipotesi, contributo atteso. Max 150 parole.]

## Methodology
[Approccio metodologico: tipo di studio, dati utilizzati, tecniche, metriche di valutazione. Max 200 parole.]

## Results
[Risultati principali con dati quantitativi quando disponibili. Organizzare per punti chiave. Max 250 parole.]

## Limitations
[Limitazioni riconosciute dagli autori e limitazioni identificate. Max 100 parole.]

## Implications
[Implicazioni pratiche, manageriali o per policy-makers. Max 150 parole.]

## Originality
[Contributo originale del paper alla letteratura, cosa lo distingue dai lavori precedenti. Max 100 parole.]
```

REGOLE CRITICHE:
- MASSIMO 1300 parole totali
- Ogni sezione deve rispettare il limite indicato
- Tono accademico formale, terza persona
- Includere dati quantitativi nei Results quando presenti nel paper
- NO meta-commenti, NO etichette [Sezione X], testo fluido
"""


# ---------------------------------------------------------------------------
# DEEP ANALYSIS PROMPT
# ---------------------------------------------------------------------------

DEEP_ANALYSIS_PROMPT = SYSTEM_PROMPT + """

## Modalita': Deep Analysis
Analisi approfondita e dettagliata del full text completo del paper, incluse appendici.
Lunghezza target: 3500-5500 parole. Massimo 10 pagine A4 stampate.
Idealmente piu' conciso del paper originale (~70% della sua lunghezza):
preferisci densita' interpretativa rispetto a sola riformulazione.
Lingua: ITALIANO (titoli sezioni in inglese).

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

{text_section}
---

Produci l'analisi con questa struttura:

```
{title}

Date: {date}
Type: {paper_type}
Sources: {doi}

---

Analysis Type: Deep
Analysis ID: deep_{paper_id}
Analysis Date: {analysis_date}
```

KEYWORDS
[Lista di keyword tematiche raggruppate per area]

### 1. Summary
[Riassunto in 8-12 frasi. Problema, soluzione, meccanismi chiave, risultati quantitativi principali con numeri esatti e fonte, contributi dichiarati.]

### 2. Research Context
[Contesto dettagliato. Gap identificato. Posizionamento rispetto a ciascun lavoro citato come baseline, con riferimento [N] e spiegazione.]

### 3. Methodology

#### 3a. Architettura del metodo
[Descrizione tecnica completa. Equazioni chiave in LaTeX con riferimento (Eq. N).]

#### 3b. Fasi dell'algoritmo
[Step-by-step. Pseudocodice se presente (Algorithm N). Flusso operativo.]

#### 3c. Meccanismi chiave
[Dettaglio di ogni meccanismo innovativo. Formule complete in LaTeX.]

#### 3d. Parametri critici
[Tutti i parametri con valori esatti e fonte. Learning rate, batch size, round, ratio partecipazione, configurazione hardware.]

#### 3e. Giustificazione empirica
[Measurement study, ablation study. Risultati intermedi con numeri e fonte.]

### 4. Key Findings

#### 4a. Setup sperimentale
[Dataset, baseline, metriche, architetture, hardware.]

#### 4b. Risultati principali
[Per ogni dataset e condizione: valore metodo proposto (fonte), valore baseline (nome e fonte), delta calcolato.]

#### 4c. Ablation / Sensitivity
[Valori esatti per ogni configurazione, con fonte.]

#### 4d. Overhead
[Confronto computazionale e comunicativo. Complessita' asintotica. Misurazioni empiriche.]

### 5. FL Techniques
[Per ogni tecnica: nome, riferimento [N], ruolo, meccanismo, differenza dal metodo proposto, performance comparativa.]

### 6. Confronto Qualitativo dei Metodi
[Tabella comparativa dettagliata in Markdown. Per ogni cella: [Dal paper] o [Osservazione].]

### 7. Relevance Assessment
[Valutazione: Bassa / Media / Alta / Molto Alta. 4-6 punti motivanti etichettati.]

### 8. Valutazione Critica Approfondita

#### 8a. Riproducibilita'
[Codice? Dataset pubblici? Parametri completi? Hardware?]

#### 8b. Solidita' sperimentale
[Ripetizioni. Deviazioni standard. Significativita' statistica. Adeguatezza baseline.]

#### 8c. Generalizzabilita'
[Varieta' task, domini, architetture.]

#### 8d. Privacy e Sicurezza
[Garanzie formali vs qualitative. Vettori di attacco. Conformita' regolatoria.]

#### 8e. Novita'
[Contributo incrementale vs paradigmatico. Originalita' rispetto a ciascun lavoro correlato.]

### 9. Limitations & Future Work

#### 9a. Limitazioni dichiarate dagli autori
[Con fonte esatta (Sezione N).]

#### 9b. Limitazioni identificate
[Etichettare OGNI punto come [Osservazione]. Argomentare con evidenza.]

#### 9c. Direzioni future dichiarate
[Se presenti, con fonte.]

#### 9d. Direzioni future suggerite
[Etichettare come [Osservazione].]

### 10. Healthcare Applicability (se rilevante)
[Classificare: (a) Evidenza diretta, (b) Evidenza indiretta, (c) Proiezione speculativa. Dettaglio su framework regolatori e criticita'.]

### 11. Keywords & Classificazione
[Aree tematiche. Tecniche specifiche. Classificazione del contributo.]

Generated by FL Research Monitor"""


# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

def is_claude_configured() -> bool:
    return bool(settings.anthropic_api_key)


async def check_ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get("http://localhost:11434/api/tags")
            if res.status_code == 200:
                models = [m["name"] for m in res.json().get("models", [])]
                return any(OLLAMA_MODEL.split(":")[0] in m for m in models)
    except Exception:
        pass
    return False


def check_analysis_available() -> bool:
    return is_claude_configured()


def extract_text_from_pdf(pdf_path: str) -> str | None:
    """Extract text from a PDF file using PyMuPDF."""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        full_text = "\n".join(text_parts).strip()
        if len(full_text) < 100:
            return None
        if len(full_text) > 80000:
            full_text = full_text[:80000] + "\n\n[... text truncated for context limit ...]"
        return full_text
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        return None


async def generate_paper_analysis(
    title: str,
    abstract: str,
    journal: str | None = None,
    date: str | None = None,
    doi: str | None = None,
    paper_type: str | None = None,
    keywords: list[str] | None = None,
    mode: str = "quick",
    pdf_path: str | None = None,
    paper_id: int | None = None,
) -> str | None:
    """Generate analysis using Claude API (default) or Ollama (fallback).

    Both Quick and Deep analyze the full text if PDF is available.
    Quick = compact output (1500-2500 words)
    Deep = detailed output (3500-5500 words, max 10 A4 pages, target ~70% of paper length)
    """
    from datetime import datetime

    kw_str = ", ".join(keywords) if keywords else "N/A"
    analysis_date = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    pid = paper_id or 0

    # Extract full text from PDF (both modes need it)
    full_text = None
    if pdf_path:
        full_text = extract_text_from_pdf(pdf_path)

    # Build text section
    if full_text:
        text_section = f"FULL TEXT:\n{full_text}"
    elif abstract:
        text_section = f"ABSTRACT (full text not available):\n{abstract}"
    else:
        logger.warning(f"No text for paper '{title}', skipping analysis")
        return None

    # Select prompt template
    if mode == "deep":
        template = DEEP_ANALYSIS_PROMPT
        # 5500-word IT target × ~1.7 tok/word + LaTeX/markdown overhead
        # ≈ 9700-10500 token. 10000 leaves a safe margin without bloating
        # Anthropic spend.
        max_tokens = 10000
    elif mode == "summary":
        template = SUMMARY_PROMPT
        max_tokens = 1500
    elif mode == "extended":
        template = EXTENDED_ABSTRACT_PROMPT
        # Was 3000 — too tight: 1300-word target × ~1.7 tokens/word (IT) +
        # markdown structure + LaTeX formulas regularly hit the cap and
        # truncated mid-section. 4500 gives a comfortable 50% margin.
        max_tokens = 4500
    else:
        template = QUICK_ANALYSIS_PROMPT
        max_tokens = 4096

    prompt = template.format(
        title=title,
        journal=journal or "N/A",
        date=date or "N/A",
        doi=doi or "N/A",
        paper_type=paper_type or "N/A",
        keywords=kw_str,
        text_section=text_section,
        paper_id=pid,
        analysis_date=analysis_date,
    )

    logger.info(f"{mode.upper()} analysis for '{title[:60]}' ({len(text_section)} chars input)")

    # Try Claude API first
    if is_claude_configured():
        result = await _generate_with_claude(prompt, max_tokens, mode, title)
        if result:
            return result
        logger.warning("Claude API failed, trying Ollama fallback")

    # Fallback to Ollama
    return await _generate_with_ollama(prompt, max_tokens, mode, title)


async def _generate_with_claude(prompt: str, max_tokens: int, mode: str, title: str) -> str | None:
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        input_tokens = message.usage.input_tokens
        output_tokens = message.usage.output_tokens

        cost = (input_tokens * 15 + output_tokens * 75) / 1_000_000

        logger.info(
            f"{mode.upper()} via Claude ({CLAUDE_MODEL}): '{title[:60]}' "
            f"{input_tokens}+{output_tokens} tokens, ~${cost:.4f}"
        )

        return response_text if response_text.strip() else None

    except Exception as e:
        logger.error(f"Claude API error for '{title[:60]}': {e}")
        return None


async def _generate_with_ollama(prompt: str, max_tokens: int, mode: str, title: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=900.0) as client:
            res = await client.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": max_tokens},
                },
            )

            if res.status_code != 200:
                logger.error(f"Ollama error {res.status_code}: {res.text[:200]}")
                return None

            data = res.json()
            response_text = data.get("response", "")
            eval_count = data.get("eval_count", 0)
            duration = data.get("total_duration", 0) / 1e9

            logger.info(f"{mode.upper()} via Ollama: '{title[:60]}' {eval_count} tokens in {duration:.1f}s")

            return response_text if response_text.strip() else None

    except httpx.TimeoutException:
        logger.error(f"Ollama timeout for '{title[:60]}'")
        return None
    except Exception as e:
        logger.error(f"Ollama error for '{title[:60]}': {e}")
        return None
