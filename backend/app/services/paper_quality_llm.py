"""LLM-assisted Paper Quality Assessment (Opus 4.7 with extended thinking).

Admin-only. Reads the paper's local PDF and produces a complete suggested
quality assessment (rubric scores per dimension, structured extras, overall
grade and overall assessment). The result is NEVER persisted automatically.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import settings
from app.models.paper import Paper
from app.services.review_templates import get_template

logger = logging.getLogger(__name__)

CLAUDE_OPUS_MODEL = "claude-opus-4-7"
EXTENDED_THINKING_BUDGET = 12000
MAX_PAPER_CHARS = 250_000

VALID_GRADES = ("excellent", "good", "adequate", "weak", "unreliable")


class LlmReviewError(Exception):
    pass


def _extract_pdf_text(pdf_path: str) -> str:
    try:
        import fitz
    except ImportError as e:
        raise LlmReviewError(f"PyMuPDF not installed: {e}")

    p = Path(pdf_path)
    if not p.exists():
        raise LlmReviewError(f"PDF not found on disk: {pdf_path}")

    chunks: list[str] = []
    try:
        doc = fitz.open(str(p))
        for page in doc:
            txt = page.get_text("text") or ""
            if txt.strip():
                chunks.append(txt)
        doc.close()
    except Exception as e:
        raise LlmReviewError(f"PDF text extraction failed: {e}")

    full = "\n\n".join(chunks).strip()
    if not full:
        raise LlmReviewError("PDF has no extractable text (probably a scanned image).")
    if len(full) > MAX_PAPER_CHARS:
        full = full[:MAX_PAPER_CHARS] + "\n\n[... TRUNCATED ...]"
    return full


def _build_template_schema() -> str:
    template = get_template("paper-quality")
    lines: list[str] = []
    lines.append("RUBRIC DIMENSIONS (each requires an integer score 1-5 and a 2-4 sentence comment):")
    for d in template.dimensions:
        lines.append(f'  - "{d.key}" — {d.label}')
        if d.description:
            lines.append(f"      ({d.description})")
    lines.append("  Score scale: 1=Poor, 2=Fair, 3=Good, 4=Very good, 5=Excellent")
    lines.append("")
    lines.append("STRUCTURED EXTRAS (provide a value for each):")
    for ex in template.extras:
        line = f'  - "{ex.key}" ({ex.type}): {ex.label}'
        lines.append(line)
        if ex.type == "choice" and ex.choices:
            opts = ", ".join([f'"{v}"' for v, _ in ex.choices])
            labels = ", ".join([l for _, l in ex.choices])
            lines.append(f"      ALLOWED VALUES: [{opts}]")
            lines.append(f"      (meanings: {labels})")
        elif ex.type == "boolean":
            lines.append('      ALLOWED VALUES: true | false')
    lines.append("")
    lines.append("OVERALL GRADE (pick exactly one):")
    for v in VALID_GRADES:
        labels = {
            "excellent":  "Excellent — exemplary work, recommended without reservations",
            "good":       "Good — solid contribution with minor issues only",
            "adequate":   "Adequate — acceptable but with notable limitations",
            "weak":       "Weak — significant flaws, use with caution",
            "unreliable": "Unreliable — methodologically unsound or potentially misleading",
        }
        lines.append(f'  - "{v}" — {labels[v]}')
    return "\n".join(lines)


def _build_response_format() -> str:
    template = get_template("paper-quality")
    rubric_items = [
        f'{{"key": "{d.key}", "score": <int 1-5>, "comment": "<2-4 sentences>"}}'
        for d in template.dimensions
    ]
    extras_pairs = []
    for ex in template.extras:
        if ex.type == "boolean":
            placeholder = "<true|false>"
        elif ex.type == "choice":
            placeholder = "<one of allowed values>"
        else:
            placeholder = '"<value>"'
        extras_pairs.append(f'    "{ex.key}": {placeholder}')

    return (
        "{\n"
        '  "rubric_items": [\n    ' + ",\n    ".join(rubric_items) + "\n  ],\n"
        '  "extras": {\n' + ",\n".join(extras_pairs) + "\n  },\n"
        '  "overall_grade": "<one of the grade values>",\n'
        '  "overall_score": <int 1-5>,\n'
        '  "overall_assessment": "<8-15 sentences. A structured paragraph summarizing the paper\'s contribution, its strengths, its weaknesses, and your overall confidence in citing or building on this work.>"\n'
        "}"
    )


def build_prompt(paper: Paper, paper_text: str) -> str:
    schema_desc = _build_template_schema()
    response_shape = _build_response_format()

    return f"""You are a SENIOR ACADEMIC RESEARCHER and methodologist with decades of experience evaluating scientific publications across artificial intelligence, machine learning, and computational sciences. You are about to write a complete PAPER QUALITY ASSESSMENT for an already-published paper that the reader has decided to study or potentially cite. Your goal is to give an honest, evidence-grounded scientific judgement of the paper's quality, rigor, and trustworthiness — not a publish/reject decision.

Context: this is NOT a peer review for a journal. The paper is published. The reader wants to know:
  - How rigorous is the methodology?
  - How original and significant is the contribution?
  - Can I trust the results?
  - Is the work reproducible?
  - Should I cite this paper as a primary reference, supporting reference, or only as background?

GUIDING PRINCIPLES:
1. Ground every score and comment in specific evidence from the paper text. Cite sections, equations, figures, or tables when discussing strengths or weaknesses.
2. Be honest, not generous. A 5/5 means truly excellent; a 3/5 means competent but unremarkable; a 1/5 means a serious flaw.
3. Do not hallucinate. If the paper does not provide enough evidence for a judgement, say so explicitly and choose the more conservative score.
4. The overall_assessment should be a structured paragraph: one sentence summarising the contribution, then strengths, then weaknesses, then a clear recommendation about how to use this paper.
5. Match the formal academic tone expected for a tutor-facing document.

ASSESSMENT TEMPLATE:
{schema_desc}

OUTPUT FORMAT — return STRICTLY a single JSON object matching exactly this shape (no markdown fences, no commentary before or after):

{response_shape}

PAPER METADATA:
  Title: {paper.title}
  Authors: {paper.authors[0].author.name if paper.authors else "(not provided)"}
  Journal: {paper.journal or "(not provided)"}
  DOI: {paper.doi or "(not provided)"}
  Publication date: {paper.publication_date or "(not provided)"}

----- BEGIN PAPER TEXT -----
{paper_text}
----- END PAPER TEXT -----

Now write the complete quality assessment as the JSON object specified above. Use extended thinking to deliberate carefully about each dimension before producing the final JSON.
"""


async def suggest_paper_quality(paper: Paper) -> dict:
    if not settings.anthropic_api_key:
        raise LlmReviewError("ANTHROPIC_API_KEY not configured")
    if not paper.pdf_local_path:
        raise LlmReviewError("Paper has no local PDF")

    text = _extract_pdf_text(paper.pdf_local_path)
    prompt = build_prompt(paper, text)
    template = get_template("paper-quality")

    try:
        from anthropic import AsyncAnthropic
    except ImportError as e:
        raise LlmReviewError(f"anthropic SDK not installed: {e}")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    logger.info(
        f"Paper-quality LLM request: paper_id={paper.id} chars={len(text)} "
        f"thinking_budget={EXTENDED_THINKING_BUDGET}"
    )

    try:
        message = await client.messages.create(
            model=CLAUDE_OPUS_MODEL,
            max_tokens=8192,
            thinking={"type": "enabled", "budget_tokens": EXTENDED_THINKING_BUDGET},
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        raise LlmReviewError(f"Anthropic API call failed: {e}")

    text_chunks: list[str] = []
    thinking_chars = 0
    for block in message.content:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            text_chunks.append(block.text)
        elif block_type == "thinking":
            thinking_chars += len(getattr(block, "thinking", "") or "")

    raw = "\n".join(text_chunks).strip()
    if not raw:
        raise LlmReviewError("Empty response from Claude")

    cleaned = raw
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl + 1:]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        s, e_idx = cleaned.find("{"), cleaned.rfind("}")
        if s != -1 and e_idx > s:
            try:
                parsed = json.loads(cleaned[s:e_idx + 1])
            except json.JSONDecodeError as e2:
                raise LlmReviewError(f"LLM returned invalid JSON: {e2}")
        else:
            raise LlmReviewError(f"LLM returned invalid JSON: {e}")

    # Normalise rubric items
    items_in = parsed.get("rubric_items") or parsed.get("items") or []
    items_by_key = {it["key"]: it for it in items_in if isinstance(it, dict) and it.get("key")}
    norm_items = []
    for d in template.dimensions:
        src = items_by_key.get(d.key, {})
        sc = src.get("score")
        if isinstance(sc, str) and sc.isdigit():
            sc = int(sc)
        if not isinstance(sc, int) or sc < 1 or sc > 5:
            sc = None
        norm_items.append({
            "key": d.key,
            "dimension": d.label,
            "score": sc,
            "comment": (src.get("comment") or "").strip(),
        })

    # Normalise extras
    extras_in = parsed.get("extras") or {}
    norm_extras = {}
    for ex in template.extras:
        v = extras_in.get(ex.key)
        if v is None:
            norm_extras[ex.key] = None
            continue
        if ex.type == "boolean":
            norm_extras[ex.key] = v if isinstance(v, bool) else (str(v).lower() in ("true", "yes", "1"))
        elif ex.type == "choice":
            valid = {val for val, _ in (ex.choices or [])}
            norm_extras[ex.key] = v if v in valid else None
        else:
            norm_extras[ex.key] = v

    grade = parsed.get("overall_grade") or ""
    if grade not in VALID_GRADES:
        grade = ""

    overall_score = parsed.get("overall_score")
    if isinstance(overall_score, str) and overall_score.isdigit():
        overall_score = int(overall_score)
    if not isinstance(overall_score, int) or overall_score < 1 or overall_score > 5:
        overall_score = None

    input_tokens = getattr(message.usage, "input_tokens", 0) or 0
    output_tokens = getattr(message.usage, "output_tokens", 0) or 0
    cost = (input_tokens * 15 + output_tokens * 75) / 1_000_000
    logger.info(
        f"Paper-quality LLM done: paper_id={paper.id} input={input_tokens} output={output_tokens} "
        f"thinking_chars={thinking_chars} cost=~${cost:.4f}"
    )

    return {
        "rubric": {
            "template_id": "paper-quality",
            "items": norm_items,
            "extras": norm_extras,
        },
        "overall_grade": grade,
        "overall_score": overall_score,
        "overall_assessment": (parsed.get("overall_assessment") or "").strip(),
        "_meta": {
            "model": CLAUDE_OPUS_MODEL,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "thinking_chars": thinking_chars,
            "cost_usd": round(cost, 4),
        },
    }
