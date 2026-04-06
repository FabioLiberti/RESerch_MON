"""LLM-based paper analysis using local Ollama (Gemma4:e4b)."""

import logging
from datetime import datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:e4b"

ANALYSIS_PROMPT_TEMPLATE = """Sei un ricercatore esperto in Federated Learning e Intelligenza Artificiale. Analizza il seguente paper scientifico e genera un report dettagliato IN ITALIANO. I titoli delle sezioni devono essere in inglese, ma tutto il testo dell'analisi deve essere in italiano.

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

Genera il report con queste sezioni (titoli in inglese, contenuto in italiano):

1. **Summary** — Sintesi del paper in 3-4 frasi chiare e concise
2. **Research Context** — Contesto della ricerca, problema affrontato e gap nella letteratura
3. **Methodology** — Approccio metodologico dettagliato e tecniche utilizzate
4. **Key Findings** — Risultati principali con tutti i dati quantitativi disponibili
5. **FL Techniques** — Tecniche di Federated Learning identificate, il loro ruolo specifico e come interagiscono
6. **Relevance Assessment** — Valutazione della rilevanza per la ricerca FL: indica Alta, Media o Bassa con motivazione dettagliata
7. **Limitations & Future Work** — Limitazioni dello studio e direzioni future di ricerca
8. **Healthcare Applicability** — Potenziale applicabilità in ambito sanitario e nel contesto dell'European Health Data Space (EHDS), con esempi concreti
9. **Keyword Research** — Per ciascuna delle seguenti keyword, spiega brevemente come il paper si relaziona a quel concetto e quale contributo offre: {keywords}

Rispondi SOLO con il report strutturato, senza preamboli o commenti aggiuntivi."""


async def check_ollama_available() -> bool:
    """Check if Ollama is running and the model is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get("http://localhost:11434/api/tags")
            if res.status_code == 200:
                models = [m["name"] for m in res.json().get("models", [])]
                return any(MODEL_NAME.split(":")[0] in m for m in models)
    except Exception:
        pass
    return False


async def generate_paper_analysis(
    title: str,
    abstract: str,
    journal: str | None = None,
    date: str | None = None,
    doi: str | None = None,
    paper_type: str | None = None,
    keywords: list[str] | None = None,
) -> str | None:
    """Generate analysis for a single paper using Gemma4 via Ollama.

    Returns the raw markdown text of the analysis, or None on failure.
    """
    if not abstract:
        logger.warning(f"No abstract for paper '{title}', skipping analysis")
        return None

    kw_str = ", ".join(keywords) if keywords else "N/A"

    prompt = ANALYSIS_PROMPT_TEMPLATE.format(
        title=title,
        journal=journal or "N/A",
        date=date or "N/A",
        doi=doi or "N/A",
        paper_type=paper_type or "N/A",
        keywords=kw_str,
        abstract=abstract,
    )

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            res = await client.post(
                OLLAMA_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 4096,
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
                f"Analysis generated for '{title[:60]}': "
                f"{eval_count} tokens in {duration:.1f}s"
            )

            return response_text if response_text.strip() else None

    except httpx.TimeoutException:
        logger.error(f"Ollama timeout for paper '{title[:60]}'")
        return None
    except Exception as e:
        logger.error(f"Ollama error for paper '{title[:60]}': {e}")
        return None
