"""Extract structured data from analysis text using Claude Haiku (cheap & fast)."""

import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analizza il seguente report di analisi di un paper scientifico ed estrai i dati strutturati in formato JSON.

REGOLE:
- Estrai SOLO dati presenti nel report. NON inventare.
- Se un campo non e' disponibile nel report, usa null.
- Per campi array, usa [] se non ci sono dati.
- I numeri devono essere esatti come nel report.

REGOLE SPECIALI per "method_tags":
- Scomponi il "proposed_method" in 1-4 tag corti standardizzati (max 4 parole ciascuno).
- Usa terminologia accademica standard in italiano o inglese (preferisci inglese per termini consolidati).
- Esempi di buoni tag:
  * "Studio correlazionale trasversale con questionari standardizzati" -> ["cross-sectional study", "standardized questionnaire"]
  * "Architettura FL a tre livelli con Deep RL" -> ["federated learning", "deep reinforcement learning", "three-tier architecture"]
  * "Review narrativa multi-autore" -> ["narrative review", "expert panel"]
  * "Scoping review secondo Arksey & O'Malley" -> ["scoping review"]
  * "Tassonomia del Personalized FL" -> ["taxonomy", "personalized federated learning"]
  * "HCB-CF (Human-Centric Based Collaborative Filtering)" -> ["collaborative filtering", "recommender system"]
- I tag devono essere RIUTILIZZABILI tra paper diversi (cosi' funzionano come filtri).
- Evita tag troppo specifici o lunghi.

REPORT:
{analysis_text}

---

Rispondi SOLO con un JSON valido (nessun testo prima o dopo) con questa struttura:

{{
  "problem_addressed": "descrizione del problema in 1-2 frasi",
  "proposed_method": "nome del metodo proposto",
  "method_tags": ["tag1 normalizzato", "tag2 normalizzato"],
  "fl_techniques": ["tecnica1", "tecnica2"],
  "datasets": ["dataset1", "dataset2"],
  "baselines": ["baseline1", "baseline2"],
  "best_metric_name": "nome metrica (es. accuracy)",
  "best_metric_value": 86.76,
  "best_baseline_name": "nome migliore baseline",
  "best_baseline_value": 84.85,
  "improvement_delta": 1.91,
  "privacy_mechanism": "tipo di privacy (es. differential privacy, secure aggregation, none)",
  "privacy_formal": true,
  "reproducibility_score": 3,
  "novelty_level": "incremental|moderate|paradigmatic",
  "relevance": "Bassa|Media|Alta|Molto Alta",
  "healthcare_applicable": false,
  "healthcare_evidence": "none|direct|indirect|speculative",
  "limitations_declared": ["limitazione 1 dagli autori", "limitazione 2"],
  "limitations_identified": ["limitazione 1 dall'analista", "limitazione 2"],
  "key_findings_summary": "riassunto dei risultati principali in 2-3 frasi",
  "extra": {{
    "number_of_clients": null,
    "communication_rounds": null,
    "architecture": null,
    "year": null
  }}
}}"""


async def extract_structured_data(analysis_text: str) -> dict | None:
    """Extract structured data from analysis text using Claude Haiku."""
    if not settings.anthropic_api_key:
        logger.warning("Anthropic API key not configured, skipping structured extraction")
        return None

    if not analysis_text or len(analysis_text) < 100:
        return None

    # Truncate to save tokens (Haiku is cheap but no need to waste)
    text = analysis_text[:15000] if len(analysis_text) > 15000 else analysis_text

    prompt = EXTRACTION_PROMPT.format(analysis_text=text)

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        response = message.content[0].text.strip()
        input_tokens = message.usage.input_tokens
        output_tokens = message.usage.output_tokens
        cost = (input_tokens * 0.8 + output_tokens * 4) / 1_000_000

        logger.info(f"Structured extraction: {input_tokens}+{output_tokens} tokens, ~${cost:.4f}")

        # Parse JSON — handle possible markdown code blocks
        if response.startswith("```"):
            response = response.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        data = json.loads(response)
        return data

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error in structured extraction: {e}")
        logger.debug(f"Raw response: {response[:200]}")
        return None
    except Exception as e:
        logger.error(f"Structured extraction error: {e}")
        return None
