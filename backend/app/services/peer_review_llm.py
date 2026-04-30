"""LLM-assisted peer review (Claude Opus 4.7 with extended thinking).

Generates a complete *suggested* peer review for a manuscript, structured
according to the active review template (rubric, extras, recommendation,
comments to authors, confidential comments). The result is NEVER persisted
automatically — the human reviewer must explicitly save after editing.

Admin-only feature. High-cost call (~$0.40-1.00 per review).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.models.peer_review import PeerReview
from app.services.review_templates import ReviewTemplate, get_template

logger = logging.getLogger(__name__)

CLAUDE_OPUS_MODEL = "claude-opus-4-7"

# Extended thinking budget (in tokens) — large enough for genuinely deliberate
# reasoning over a full manuscript without being wasteful.
EXTENDED_THINKING_BUDGET = 12000

# Maximum manuscript text fed to the model (chars). Opus 4.7 1M context easily
# handles this; the truncation guards against absurdly large or corrupted PDFs.
MAX_MANUSCRIPT_CHARS = 250_000


class LlmReviewError(Exception):
    pass


# ---------- PDF text extraction ----------

def _extract_pdf_text(pdf_path: str) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise LlmReviewError(f"PyMuPDF not installed: {e}")

    p = Path(pdf_path)
    if not p.exists():
        raise LlmReviewError(f"PDF file not found on disk: {pdf_path}")

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
        raise LlmReviewError("PDF appears to contain no extractable text (likely a scanned image).")

    if len(full) > MAX_MANUSCRIPT_CHARS:
        full = full[:MAX_MANUSCRIPT_CHARS] + "\n\n[... TRUNCATED — manuscript longer than the input window ...]"

    return full


# ---------- Prompt construction ----------

def _build_template_schema(template: ReviewTemplate) -> str:
    """Render the template structure as a JSON schema description for the LLM."""
    lines: list[str] = []
    lines.append(f'TEMPLATE: "{template.id}" — {template.name} ({template.journal})')
    lines.append(f"DESCRIPTION: {template.description}")
    lines.append("")

    if template.dimensions:
        lines.append("RUBRIC DIMENSIONS (each requires an integer score 1-5 and a free-text comment):")
        for d in template.dimensions:
            lines.append(f'  - "{d.key}" — {d.label}')
            if d.description:
                lines.append(f"      ({d.description})")
        lines.append("  Score scale: 1=Poor, 2=Fair, 3=Good, 4=Very good, 5=Excellent")
        lines.append("")

    if template.extras:
        lines.append("STRUCTURED ASSESSMENT FIELDS (you MUST provide a value for each):")
        for ex in template.extras:
            line = f'  - "{ex.key}" ({ex.type}): {ex.label}'
            if ex.description:
                line += f"\n      {ex.description}"
            lines.append(line)
            if ex.type == "choice" and ex.choices:
                opts = ", ".join([f'"{v}"' for v, _ in ex.choices])
                labels = ", ".join([l for _, l in ex.choices])
                lines.append(f"      ALLOWED VALUES: [{opts}]")
                lines.append(f"      (meanings: {labels})")
            elif ex.type == "boolean":
                lines.append('      ALLOWED VALUES: true | false')
            elif ex.type == "text":
                lines.append('      FORMAT: free text. Use "N/A" if not applicable.')
        lines.append("")

    lines.append("RECOMMENDATION (pick exactly one):")
    for v, l in template.recommendations:
        lines.append(f'  - "{v}" — {l}')
    lines.append("")

    return "\n".join(lines)


def _build_response_format(template: ReviewTemplate) -> str:
    """Build the exact JSON shape the model must return."""
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
        elif ex.type == "text":
            placeholder = '"<free text or N/A>"'
        else:
            placeholder = '"<value>"'
        extras_pairs.append(f'    "{ex.key}": {placeholder}')

    schema = "{\n"
    if rubric_items:
        schema += '  "rubric_items": [\n    ' + ",\n    ".join(rubric_items) + "\n  ],\n"
    else:
        schema += '  "rubric_items": [],\n'
    schema += "  \"extras\": {\n" + ",\n".join(extras_pairs) + "\n  },\n" if extras_pairs else "  \"extras\": {},\n"
    schema += '  "recommendation": "<one of the recommendation values>",\n'
    schema += '  "comments_to_authors": "<5-15 sentences. Concrete, constructive, citing specific sections/pages of the manuscript. Visible to authors.>",\n'
    schema += '  "confidential_comments": "<3-8 sentences. Private notes for the editor. NOT shared with authors. Cover novelty, fit, ethical concerns, or anything you would not say in front of the authors.>"\n'
    schema += "}"
    return schema


def build_prompt(pr: PeerReview, manuscript_text: str) -> str:
    template = get_template(pr.template_id)
    schema_desc = _build_template_schema(template)
    response_shape = _build_response_format(template)

    return f"""You are a SENIOR PEER REVIEWER for {template.journal}, with decades of experience reviewing for the leading journals in artificial intelligence and machine learning. You have served on multiple program committees and editorial boards. Your reviews are known for being rigorous, constructive, technically deep, and grounded strictly in the evidence presented in the manuscript.

You are about to write a complete peer review for the manuscript reproduced below. The review must follow the OFFICIAL REVIEWER FORM of {template.name}, faithfully populating every required field. Your output is a *suggested* review that a human reviewer will read, edit, and submit — therefore it must be of the highest scientific quality, no shortcuts.

GUIDING PRINCIPLES:
1. Ground every claim, score, and comment in specific evidence from the manuscript text. When discussing weaknesses, point to sections, equations, figures, or tables.
2. Be honest, not generous. A 5/5 score must mean truly excellent work; a 3/5 means competent but unremarkable.
3. Constructive criticism: every weakness should come with an actionable suggestion when possible.
4. No hallucinations. If the manuscript does not provide sufficient evidence for a judgement, say so explicitly in the comment, and choose the more conservative value.
5. Match the expected scientific tone of the journal: precise, formal, respectful, jargon-aware.
6. Comments to authors must be in ENGLISH, written in third person, and roughly 5-15 sentences. Use a structured opening (one-paragraph summary of the contribution as you understand it), followed by Strengths, Weaknesses, and Specific Suggestions.
7. Confidential comments to editor: 3-8 sentences. Cover whether the work fits the journal's scope, the significance compared to recent literature, your overall confidence in the review, and any concerns you would not raise in front of the authors.

REVIEW FORM SCHEMA:
{schema_desc}

OUTPUT FORMAT — return STRICTLY a single JSON object matching exactly this shape (no markdown fences, no commentary before or after):

{response_shape}

MANUSCRIPT METADATA:
  Title: {pr.title}
  Authors: {pr.authors or "(not provided)"}
  Target journal: {pr.target_journal or template.journal}
  Manuscript ID: {pr.manuscript_id or "(not assigned)"}

----- BEGIN MANUSCRIPT TEXT -----
{manuscript_text}
----- END MANUSCRIPT TEXT -----

Now write the complete peer review as the JSON object specified above. Use extended thinking to deliberate carefully about each field before producing the final JSON.
"""


# ---------- LLM call ----------

async def suggest_peer_review(pr: PeerReview) -> dict:
    """Run Claude Opus 4.7 with extended thinking to produce a suggested review.

    Returns a dict with the suggested fields, ready to be merged into the
    PeerReview state on the frontend (no DB writes here).
    """
    if not settings.anthropic_api_key:
        raise LlmReviewError("ANTHROPIC_API_KEY not configured")
    if not pr.pdf_path:
        raise LlmReviewError("Manuscript PDF not uploaded yet")

    manuscript_text = _extract_pdf_text(pr.pdf_path)
    prompt = build_prompt(pr, manuscript_text)
    template = get_template(pr.template_id)

    try:
        from anthropic import AsyncAnthropic
    except ImportError as e:
        raise LlmReviewError(f"anthropic SDK not installed: {e}")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    logger.info(
        f"LLM peer review request: pr_id={pr.id} template={pr.template_id} "
        f"manuscript_chars={len(manuscript_text)} thinking_budget={EXTENDED_THINKING_BUDGET}"
    )

    try:
        message = await client.messages.create(
            model=CLAUDE_OPUS_MODEL,
            max_tokens=8192,
            thinking={
                "type": "enabled",
                "budget_tokens": EXTENDED_THINKING_BUDGET,
            },
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        raise LlmReviewError(f"Anthropic API call failed: {e}")

    # Extract text blocks; thinking blocks are kept only for logging
    text_chunks: list[str] = []
    thinking_chars = 0
    for block in message.content:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            text_chunks.append(block.text)
        elif block_type == "thinking":
            thinking_chars += len(getattr(block, "thinking", "") or "")

    raw_text = "\n".join(text_chunks).strip()
    if not raw_text:
        raise LlmReviewError("Empty response from Claude (only thinking blocks?)")

    # Parse JSON. Be tolerant of leading/trailing markdown fences.
    cleaned = raw_text
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
        # One retry: try to find the first { and the last }
        s, e_idx = cleaned.find("{"), cleaned.rfind("}")
        if s != -1 and e_idx != -1 and e_idx > s:
            try:
                parsed = json.loads(cleaned[s:e_idx + 1])
            except json.JSONDecodeError as e2:
                raise LlmReviewError(f"LLM returned invalid JSON: {e2}\nRaw: {cleaned[:500]}")
        else:
            raise LlmReviewError(f"LLM returned invalid JSON: {e}\nRaw: {cleaned[:500]}")

    # Normalise: build the rubric payload shaped exactly as the template expects.
    items_in = parsed.get("rubric_items") or parsed.get("items") or []
    items_by_key = {}
    for it in items_in:
        if isinstance(it, dict) and it.get("key"):
            items_by_key[it["key"]] = it

    norm_items = []
    for d in template.dimensions:
        src = items_by_key.get(d.key, {})
        score = src.get("score")
        if isinstance(score, str) and score.isdigit():
            score = int(score)
        if not isinstance(score, int) or score < 1 or score > 5:
            score = None
        norm_items.append({
            "key": d.key,
            "dimension": d.label,
            "score": score,
            "comment": (src.get("comment") or "").strip(),
        })

    extras_in = parsed.get("extras") or {}
    norm_extras = {}
    for ex in template.extras:
        v = extras_in.get(ex.key)
        if v is None:
            norm_extras[ex.key] = None if ex.type != "text" else ""
            continue
        if ex.type == "boolean":
            if isinstance(v, bool):
                norm_extras[ex.key] = v
            else:
                norm_extras[ex.key] = str(v).lower() in ("true", "yes", "1")
        elif ex.type == "choice":
            valid = {val for val, _ in (ex.choices or [])}
            norm_extras[ex.key] = v if v in valid else None
        elif ex.type == "text":
            norm_extras[ex.key] = str(v)
        else:
            norm_extras[ex.key] = v

    rec = parsed.get("recommendation") or ""
    valid_rec = {v for v, _ in template.recommendations}
    if rec not in valid_rec:
        rec = ""

    # Cost calculation (Opus 4.7: $15/M input, $75/M output, thinking counted as input)
    input_tokens = getattr(message.usage, "input_tokens", 0) or 0
    output_tokens = getattr(message.usage, "output_tokens", 0) or 0
    cost = (input_tokens * 15 + output_tokens * 75) / 1_000_000

    logger.info(
        f"LLM peer review done: pr_id={pr.id} input={input_tokens} output={output_tokens} "
        f"thinking_chars={thinking_chars} cost=~${cost:.4f}"
    )

    return {
        "rubric": {
            "template_id": template.id,
            "items": norm_items,
            "extras": norm_extras,
        },
        "recommendation": rec,
        "comments_to_authors": (parsed.get("comments_to_authors") or "").strip(),
        "confidential_comments": (parsed.get("confidential_comments") or "").strip(),
        "_meta": {
            "model": CLAUDE_OPUS_MODEL,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "thinking_chars": thinking_chars,
            "cost_usd": round(cost, 4),
        },
    }
