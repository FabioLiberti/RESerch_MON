"""LLM-based paper analysis.

Supports:
- Claude API (Opus 4.6, Sonnet 4.6, Haiku 4.5) — default, high quality
- Local Ollama (Gemma4:e4b) — fallback when no API key

Modes:
- Quick Analysis: abstract only
- Deep Analysis: full PDF text
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
CLAUDE_MODEL = "claude-opus-4-6"


# ---------------------------------------------------------------------------
# QUICK ANALYSIS PROMPT (abstract only)
# ---------------------------------------------------------------------------

QUICK_ANALYSIS_PROMPT = """Sei un analista di ricerca scientifica specializzato in Federated Learning e Machine Learning. Produci un'analisi strutturata, accurata e critica del seguente paper accademico, destinata a un pubblico altamente scientifico.

REGOLE FONDAMENTALI:
- I titoli delle sezioni devono essere in inglese, tutto il testo dell'analisi in ITALIANO.
- Distingui SEMPRE tra contenuti del paper e tue interpretazioni usando le etichette:
  [Dal paper] per contenuti degli autori
  [Osservazione dell'analista] per tue interpretazioni o estensioni
- Riporta SEMPRE i dati quantitativi disponibili nell'abstract.
- Non inventare informazioni non presenti nel testo fornito.
- Se un'informazione non e' disponibile nell'abstract, scrivi: "Non disponibile dall'abstract — richiede analisi Deep con full text."
- IMPORTANTE: stai analizzando SOLO l'abstract, non il paper completo. Non fingere di avere accesso a tabelle, equazioni o sezioni che non sono nell'abstract.

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

ABSTRACT:
{abstract}
---

Genera il report con queste sezioni, nell'ordine indicato:

### 1. Summary
Riassunto in 4-6 frasi del contributo principale. Deve rispondere a: Qual e' il problema? Qual e' la soluzione proposta? Qual e' il risultato principale? Includi il dato quantitativo piu' rappresentativo se disponibile nell'abstract.

### 2. Research Context
[Dal paper] Problema affrontato e perche' e' rilevante. Gap specifico nella letteratura che il paper intende colmare. Posizionamento rispetto ai filoni di ricerca esistenti.

### 3. Methodology
[Dal paper] Descrivi l'approccio metodologico:
- Architettura del metodo: componenti principali e come interagiscono
- Meccanismi chiave: descrivi le tecniche principali a parole
- Se menzionati nell'abstract, riporta parametri chiave e configurazione sperimentale
[Osservazione dell'analista] Commenta la solidita' dell'approccio basandoti su quanto disponibile.

### 4. Key Findings
[Dal paper] Risultati principali con TUTTI i dati quantitativi presenti nell'abstract.
Formato obbligatorio per ogni risultato: "Su [dataset/contesto], il metodo raggiunge [valore] vs [baseline] con un miglioramento di [delta]."
Se non ci sono dati quantitativi nell'abstract, scrivi esplicitamente: "L'abstract non fornisce metriche quantitative specifiche."

### 5. FL Techniques
[Dal paper] Tecniche di Federated Learning identificate nel paper. Per ciascuna specifica:
- Ruolo nel paper (baseline, componente, ispirazione)
- Come il metodo proposto si differenzia o la migliora
[Osservazione dell'analista] Posizionamento rispetto allo stato dell'arte FL.

### 6. Confronto qualitativo
[Osservazione dell'analista] Basandoti sulle informazioni disponibili, confronta qualitativamente il metodo proposto con gli approcci standard in termini di: complessita', scalabilita', privacy, requisiti di comunicazione. Etichetta chiaramente che questa e' una tua interpretazione.

### 7. Relevance Assessment
Valutazione: [Bassa / Media / Alta / Molto Alta]
Motivazione strutturata in 3-4 punti, ciascuno con evidenza dal paper.

### 8. Valutazione critica
[Osservazione dell'analista] Rispondi a queste domande basandoti su quanto disponibile:
- Riproducibilita': il paper menziona codice, dataset pubblici, configurazione hardware?
- Solidita' sperimentale: sono menzionati confronti con baseline multiple?
- Generalizzabilita': il metodo e' testato su un solo dominio o e' piu' ampio?
- Privacy: le garanzie sono formali (es. differential privacy con bound) o argomentate qualitativamente?
- Novita': il contributo e' incrementale o introduce un'idea fondamentalmente nuova?

### 9. Limitations & Future Work
**9a. Limitazioni dichiarate [Dal paper]**: solo cio' che gli autori menzionano nell'abstract. Se assenti, scrivi: "L'abstract non menziona limitazioni esplicite."
**9b. Limitazioni identificate [Osservazione dell'analista]**: valuta criticamente cosa manca o e' debole.
**9c. Direzioni future [Dal paper]**: solo se menzionate.
**9d. Direzioni future suggerite [Osservazione dell'analista]**: tue proposte.

### 10. Healthcare Applicability
- Potenziale applicabilita' al dominio sanitario e al contesto EHDS (European Health Data Space).
- Connessioni con framework regolatori (GDPR, EHDS).
- Esempi concreti di applicazione.
- [Osservazione dell'analista] Specificare se il paper include o meno esperimenti su dati sanitari reali.

### 11. Keyword Research
Per ciascuna delle seguenti keyword, spiega come il paper si relaziona a quel concetto: {keywords}

Rispondi SOLO con il report strutturato. NON aggiungere note, commenti, disclaimer o meta-osservazioni sul tuo processo di analisi. NON scrivere frasi come "ho mantenuto la struttura" o "per simulare". Produci SOLO il contenuto dell'analisi."""


# ---------------------------------------------------------------------------
# DEEP ANALYSIS PROMPT (full PDF text)
# ---------------------------------------------------------------------------

DEEP_ANALYSIS_PROMPT = """Sei un analista di ricerca scientifica specializzato in Federated Learning e Machine Learning. Il tuo compito e' produrre un'analisi strutturata, accurata e critica di questo paper accademico completo, destinata a un pubblico altamente scientifico.

REGOLE FONDAMENTALI:
- I titoli delle sezioni in inglese, tutto il testo dell'analisi in ITALIANO.
- Distingui SEMPRE tra contenuti del paper e tue interpretazioni:
  [Dal paper] per contenuti degli autori
  [Osservazione dell'analista] per tue interpretazioni
- Ogni affermazione deve essere riconducibile a una sezione specifica del paper.
- MAI affermare che il paper "non fornisce" dati senza aver verificato TUTTE le sezioni incluse appendici, tabelle e figure.
- Riporta SEMPRE i risultati numerici: metriche, valori, margini di miglioramento.

---
TITLE: {title}
JOURNAL: {journal}
DATE: {date}
DOI: {doi}
TYPE: {paper_type}
KEYWORDS: {keywords}

FULL TEXT:
{full_text}
---

Genera il report con queste sezioni, nell'ordine indicato:

### 1. Summary
Riassunto in 4-6 frasi. Qual e' il problema? Qual e' la soluzione? Qual e' il risultato principale? Includi il dato quantitativo piu' rappresentativo.

### 2. Research Context
[Dal paper] Problema, rilevanza, gap nella letteratura, posizionamento.

### 3. Methodology
Sezione critica. Includi:
- **Architettura del metodo**: componenti, interazione, flusso di dati.
- **Fasi dell'algoritmo**: elenca ogni fase con nome, scopo, operazioni.
- **Meccanismi chiave**: descrivi le equazioni principali a parole con notazione. Esempio: "La similarita' tra client i e j e' calcolata tramite cosine similarity dei classifier (Eq. X)."
- **Parametri critici**: valori usati negli esperimenti e loro effetto.
- **Giustificazione empirica**: se il paper include measurement study che motivano le scelte di design.

### 4. Key Findings
Checklist obbligatoria:
- Quanti dataset? Quali? Con quali condizioni?
- Quanti metodi baseline? Quali?
- Metrica principale?
- Miglioramento medio rispetto alla miglior baseline?
- Miglioramento massimo e in quale scenario?
- Caso in cui il metodo migliora meno?
- Analisi di ablazione o sensitivity? Cosa mostrano?
- Analisi di overhead (computazionale, comunicazione)?
Formato: "Su [dataset], con [condizione], il metodo raggiunge [valore] vs [baseline] ([nome]), miglioramento di [delta]."

### 5. FL Techniques
[Dal paper] Per ogni tecnica FL:
- Ruolo nel paper (baseline, componente, ispirazione)
- Come il metodo proposto si differenzia
Se il paper include tabella comparativa qualitativa, riportala.

### 6. Confronto qualitativo dei metodi
Se presente una tabella di confronto (overhead, privacy, requisiti), riproducila.
Se assente, [Osservazione dell'analista] crea un confronto basato sulle informazioni nel paper.

### 7. Relevance Assessment
Valutazione: [Bassa / Media / Alta / Molto Alta]
Motivazione in 3-4 punti con evidenza dal paper.

### 8. Valutazione critica
[Osservazione dell'analista] Rispondi a:
- **Riproducibilita'**: codice, hyperparameter, configurazione hardware, dataset pubblici?
- **Solidita' sperimentale**: quanti run/seed? Deviazioni standard? Significativita' statistica?
- **Generalizzabilita'**: testato su un solo tipo di task/dato? Architetture diverse?
- **Privacy**: garanzie formali (differential privacy con bound) o argomentate qualitativamente?
- **Novita'**: contributo incrementale o idea fondamentalmente nuova?

### 9. Limitations & Future Work
**9a. Limitazioni dichiarate [Dal paper]**: cerca in Limitations, Discussion, Broader Impact, Conclusion, Appendix.
**9b. Limitazioni identificate [Osservazione dell'analista]**: valuta criticamente.
**9c. Direzioni future [Dal paper]**: solo se menzionate.
**9d. Direzioni future suggerite [Osservazione dell'analista]**.

### 10. Healthcare Applicability
- Applicabilita' sanitario e EHDS.
- Framework regolatori (GDPR, EHDS, HIPAA).
- Esempi concreti.
- Specificare se il paper include esperimenti su dati sanitari reali.

### 11. Keyword Research
Per ciascuna keyword, spiega come il paper si relaziona: {keywords}

Rispondi SOLO con il report strutturato. NON aggiungere note, commenti, disclaimer o meta-osservazioni sul tuo processo di analisi. NON scrivere frasi come "ho mantenuto la struttura" o "per simulare". Produci SOLO il contenuto dell'analisi."""


# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

def is_claude_configured() -> bool:
    """Check if Claude API is configured."""
    return bool(settings.anthropic_api_key)


async def check_ollama_available() -> bool:
    """Check if Ollama is running and the model is available."""
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
    """Check if any analysis engine is available."""
    return is_claude_configured()  # Claude is always available if configured


def extract_text_from_pdf(pdf_path: str) -> str | None:
    """Extract text from a PDF file using PyMuPDF."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        full_text = "\n".join(text_parts).strip()
        if len(full_text) < 100:
            return None
        # Limit to ~80K chars (~20K tokens) to stay within context
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
) -> str | None:
    """Generate analysis using Claude API (default) or Ollama (fallback).

    Args:
        mode: "quick" (abstract only) or "deep" (full PDF text)
        pdf_path: path to PDF file (required for deep mode)

    Returns the raw markdown text of the analysis, or None on failure.
    """
    kw_str = ", ".join(keywords) if keywords else "N/A"

    # Build prompt
    if mode == "deep" and pdf_path:
        full_text = extract_text_from_pdf(pdf_path)
        if not full_text:
            logger.warning(f"Could not extract text from PDF for '{title[:60]}', falling back to quick mode")
            mode = "quick"
        else:
            prompt = DEEP_ANALYSIS_PROMPT.format(
                title=title,
                journal=journal or "N/A",
                date=date or "N/A",
                doi=doi or "N/A",
                paper_type=paper_type or "N/A",
                keywords=kw_str,
                full_text=full_text,
            )
            max_tokens = 8192
            logger.info(f"Deep analysis for '{title[:60]}' ({len(full_text)} chars from PDF)")

    if mode == "quick":
        if not abstract:
            logger.warning(f"No abstract for paper '{title}', skipping analysis")
            return None
        prompt = QUICK_ANALYSIS_PROMPT.format(
            title=title,
            journal=journal or "N/A",
            date=date or "N/A",
            doi=doi or "N/A",
            paper_type=paper_type or "N/A",
            keywords=kw_str,
            abstract=abstract,
        )
        max_tokens = 4096

    # Try Claude API first
    if is_claude_configured():
        result = await _generate_with_claude(prompt, max_tokens, mode, title)
        if result:
            return result
        logger.warning("Claude API failed, trying Ollama fallback")

    # Fallback to Ollama
    return await _generate_with_ollama(prompt, max_tokens, mode, title)


async def _generate_with_claude(prompt: str, max_tokens: int, mode: str, title: str) -> str | None:
    """Generate analysis using Claude API."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        input_tokens = message.usage.input_tokens
        output_tokens = message.usage.output_tokens

        # Estimate cost
        if "opus" in CLAUDE_MODEL:
            cost = (input_tokens * 15 + output_tokens * 75) / 1_000_000
        elif "sonnet" in CLAUDE_MODEL:
            cost = (input_tokens * 3 + output_tokens * 15) / 1_000_000
        else:
            cost = (input_tokens * 0.8 + output_tokens * 4) / 1_000_000

        logger.info(
            f"{mode.upper()} analysis via Claude ({CLAUDE_MODEL}) for '{title[:60]}': "
            f"{input_tokens}+{output_tokens} tokens, ~${cost:.4f}"
        )

        return response_text if response_text.strip() else None

    except Exception as e:
        logger.error(f"Claude API error for '{title[:60]}': {e}")
        return None


async def _generate_with_ollama(prompt: str, max_tokens: int, mode: str, title: str) -> str | None:
    """Generate analysis using local Ollama (fallback)."""
    try:
        async with httpx.AsyncClient(timeout=900.0) as client:
            res = await client.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": max_tokens,
                    },
                },
            )

            if res.status_code != 200:
                logger.error(f"Ollama error {res.status_code}: {res.text[:200]}")
                return None

            data = res.json()
            response_text = data.get("response", "")
            eval_count = data.get("eval_count", 0)
            duration = data.get("total_duration", 0) / 1e9

            logger.info(
                f"{mode.upper()} analysis via Ollama for '{title[:60]}': "
                f"{eval_count} tokens in {duration:.1f}s"
            )

            return response_text if response_text.strip() else None

    except httpx.TimeoutException:
        logger.error(f"Ollama timeout for paper '{title[:60]}'")
        return None
    except Exception as e:
        logger.error(f"Ollama error for paper '{title[:60]}': {e}")
        return None
