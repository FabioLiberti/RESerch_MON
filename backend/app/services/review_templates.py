"""Review templates registry — journal-specific peer review forms.

Each template defines the rubric dimensions, recommendation options, and any
extra journal-specific structured fields (e.g. scope fit, best paper nomination).

To add a new journal: append a new ReviewTemplate() entry to TEMPLATES.
"""

from dataclasses import dataclass, field
from typing import Literal


FieldType = Literal["score", "choice", "boolean", "text"]


@dataclass
class TemplateField:
    """A single structured field in the review form.

    type=score → numeric 1-5 + free-text comment (a rubric dimension)
    type=choice → one of the provided choices (value, label)
    type=boolean → yes/no
    """
    key: str
    label: str
    type: FieldType = "score"
    description: str = ""
    choices: list[tuple[str, str]] | None = None
    required: bool = False


@dataclass
class ReviewTemplate:
    id: str
    name: str                 # short display name
    journal: str              # full journal name
    description: str
    dimensions: list[TemplateField]          # score-type fields (rubric)
    recommendations: list[tuple[str, str]]   # [(value, label), ...]
    extras: list[TemplateField] = field(default_factory=list)   # choice/boolean extras


# ---------- Generic (current behaviour) ----------

_GENERIC = ReviewTemplate(
    id="generic",
    name="Generic Peer Review",
    journal="Any journal / General-purpose template",
    description="Journal-agnostic six-dimension rubric with standard recommendation set.",
    dimensions=[
        TemplateField("originality", "Originality"),
        TemplateField("significance", "Significance"),
        TemplateField("technical_quality", "Technical quality"),
        TemplateField("clarity", "Clarity of presentation"),
        TemplateField("references", "Adequacy of references"),
        TemplateField("organization", "Organization and language"),
    ],
    recommendations=[
        ("accept", "Accept"),
        ("minor_revision", "Minor Revision"),
        ("major_revision", "Major Revision"),
        ("reject", "Reject"),
    ],
)


# ---------- IEEE Transactions on Artificial Intelligence ----------
# Verbatim transcription of the IEEE ScholarOne reviewer form for IEEE T-AI
# (questions, choices, and recommendation labels match the original form
# exactly so the report can be copy-pasted into the submission system).

_IEEE_TAI = ReviewTemplate(
    id="ieee-tai",
    name="IEEE T-AI",
    journal="IEEE Transactions on Artificial Intelligence",
    description="Official IEEE ScholarOne reviewer form for IEEE Transactions on AI. "
                "Categorical assessments (no 1-5 rubric).",
    dimensions=[],   # IEEE-TAI uses categorical choices, not 1-5 stars
    recommendations=[
        ("accept", "Accept"),
        ("minor_revision", "Minor Revision"),
        ("major_revision", "Major Revision"),
        ("reject_resubmit", "Reject and Resubmit"),
        ("reject", "Reject"),
    ],
    extras=[
        TemplateField(
            "verbosity",
            "How would you describe the verbosity of the manuscript?",
            type="choice",
            choices=[
                ("concise", "Concise"),
                ("somewhat_verbose", "Somewhat verbose"),
                ("very_verbose", "Very verbose"),
            ],
            required=True,
        ),
        TemplateField(
            "technical_writing",
            "How would you describe the quality of technical writing used in this manuscript?",
            type="choice",
            choices=[
                ("error_free", "Error free"),
                ("light_editing", "Require light editing"),
                ("significant_editing", "Require significant editing"),
                ("complete_rewrite", "Require complete rewrite"),
            ],
            required=True,
        ),
        TemplateField(
            "english_quality",
            "How would you describe the quality of English used in this manuscript?",
            type="choice",
            choices=[
                ("error_free", "Error free"),
                ("light_editing", "Require light editing"),
                ("significant_editing", "Require significant editing"),
                ("complete_rewrite", "Require complete rewrite"),
            ],
            required=True,
        ),
        TemplateField(
            "accessible_language",
            "Are the abstract, introduction, and conclusion written in an accessible language to a non-specialist?",
            type="boolean",
            required=True,
        ),
        TemplateField(
            "reproducible",
            "Is the work reproducible?",
            type="boolean",
            required=True,
        ),
        TemplateField(
            "novelty",
            "How novel is the contribution?",
            type="choice",
            choices=[
                ("exceptionally_novel", "Exceptionally novel"),
                ("very_novel", "Very novel"),
                ("somewhat_novel", "Somewhat novel"),
                ("incremental", "Incremental"),
                ("not_novel", "Not novel"),
            ],
            required=True,
        ),
        TemplateField(
            "significance",
            "How significant is the contribution?",
            type="choice",
            choices=[
                ("exceptionally_significant", "Exceptionally significant"),
                ("very_significant", "Very significant"),
                ("somewhat_significant", "Somewhat significant"),
                ("insignificant", "Insignificant"),
            ],
            required=True,
        ),
        TemplateField(
            "best_paper",
            "Should this manuscript be considered for a 'Best Paper' award?",
            type="boolean",
            required=True,
        ),
        TemplateField(
            "suggested_references",
            "Suggested References",
            type="text",
            description="If you are suggesting additional references they must include full bibliographic information plus a DOI. "
                        "Important: please also include any suggested references in your full review for the authors. "
                        "If you are not suggesting any references, type N/A.",
        ),
        TemplateField(
            "self_citation",
            "Are you recommending that the authors add any references to papers on which you are an author?",
            type="boolean",
            description="The answer to this question will not be shared with authors to preserve anonymity.",
            required=True,
        ),
    ],
)


# ---------- Paper Quality Review (published papers) ----------
# Used by the Paper Quality Review module — assesses the scientific quality of
# an already-published paper in the user's bibliography. Distinct from peer
# review (unpublished manuscripts) and from analysis validation (meta-review
# of LLM output). 10 dimensions cover the standard scientific quality criteria.

_PAPER_QUALITY = ReviewTemplate(
    id="paper-quality",
    name="Paper Quality Assessment",
    journal="Personal scientific quality grading",
    description="Reviewer's own scientific quality judgement of a published paper. "
                "10 dimensions on a 1-5 scale plus overall grade and free-text assessment.",
    dimensions=[
        TemplateField(
            "research_question",
            "Research question and motivation",
            description="Is the research question clearly stated, well motivated, and meaningful?",
        ),
        TemplateField(
            "literature_review",
            "Literature review and state of the art",
            description="Does the paper situate itself adequately in the prior literature? Are key references cited?",
        ),
        TemplateField(
            "methodology_rigor",
            "Methodology and rigor",
            description="Are methods sound, appropriate for the question, and described in sufficient detail?",
        ),
        TemplateField(
            "results_validity",
            "Results and analysis validity",
            description="Are the results correctly derived, statistically sound, and adequately presented?",
        ),
        TemplateField(
            "discussion_depth",
            "Discussion and interpretation",
            description="Is the discussion well grounded in the results? Are alternative explanations considered?",
        ),
        TemplateField(
            "limitations",
            "Limitations acknowledgement",
            description="Are the limitations of the study honestly stated and discussed?",
        ),
        TemplateField(
            "reproducibility",
            "Reproducibility",
            description="Are data, code, and procedures available enough to reproduce the work?",
        ),
        TemplateField(
            "originality",
            "Originality of contribution",
            description="How original is the contribution relative to the existing literature?",
        ),
        TemplateField(
            "significance",
            "Significance and impact",
            description="How important is this work? Will it influence the field?",
        ),
        TemplateField(
            "writing_clarity",
            "Writing clarity and organization",
            description="Is the paper clearly written, well organized, and accessible?",
        ),
    ],
    # No "recommendation" in the publish/reject sense — for already-published papers
    # we use an overall quality grade instead, captured separately.
    recommendations=[
        ("excellent",   "Excellent — exemplary work, recommended without reservations"),
        ("good",        "Good — solid contribution with minor issues only"),
        ("adequate",    "Adequate — acceptable but with notable limitations"),
        ("weak",        "Weak — significant flaws, use with caution"),
        ("unreliable",  "Unreliable — methodologically unsound or potentially misleading"),
    ],
    extras=[
        TemplateField(
            "data_availability",
            "Data availability",
            type="choice",
            choices=[
                ("public", "Public repository (cited in paper)"),
                ("on_request", "Available on request"),
                ("partial", "Partially available"),
                ("none", "Not available"),
                ("not_applicable", "Not applicable"),
            ],
        ),
        TemplateField(
            "code_availability",
            "Code availability",
            type="choice",
            choices=[
                ("public", "Public repository (cited in paper)"),
                ("on_request", "Available on request"),
                ("none", "Not available"),
                ("not_applicable", "Not applicable"),
            ],
        ),
        TemplateField(
            "ethics_disclosure",
            "Ethics statement / IRB disclosure",
            type="choice",
            choices=[
                ("clear", "Clearly stated"),
                ("partial", "Partial disclosure"),
                ("missing", "Missing"),
                ("not_applicable", "Not applicable"),
            ],
        ),
        TemplateField(
            "conflict_of_interest",
            "Conflict of interest declared",
            type="boolean",
        ),
        TemplateField(
            "use_in_my_work",
            "Plan to cite or use in my own work",
            type="choice",
            choices=[
                ("primary", "Primary reference"),
                ("supporting", "Supporting reference"),
                ("background", "Background only"),
                ("not_useful", "Not useful for my work"),
            ],
        ),
    ],
)


# Registry — keyed by template_id
TEMPLATES: dict[str, ReviewTemplate] = {
    _GENERIC.id: _GENERIC,
    _IEEE_TAI.id: _IEEE_TAI,
    _PAPER_QUALITY.id: _PAPER_QUALITY,
}


def get_template(template_id: str | None) -> ReviewTemplate:
    """Return a template by id, falling back to the generic template."""
    if not template_id:
        return _GENERIC
    return TEMPLATES.get(template_id, _GENERIC)


def list_templates() -> list[dict]:
    """Return a UI-friendly description of all registered templates."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "journal": t.journal,
            "description": t.description,
            "dimensions": [
                {
                    "key": d.key,
                    "label": d.label,
                    "description": d.description,
                    "type": d.type,
                }
                for d in t.dimensions
            ],
            "recommendations": [{"value": v, "label": l} for v, l in t.recommendations],
            "extras": [
                {
                    "key": e.key,
                    "label": e.label,
                    "type": e.type,
                    "description": e.description,
                    "choices": [{"value": v, "label": l} for v, l in (e.choices or [])],
                }
                for e in t.extras
            ],
        }
        for t in TEMPLATES.values()
    ]


def empty_rubric_for(template_id: str | None) -> dict:
    """Return a blank rubric payload shaped for the given template."""
    t = get_template(template_id)
    return {
        "template_id": t.id,
        "items": [
            {"key": d.key, "dimension": d.label, "score": None, "comment": ""}
            for d in t.dimensions
        ],
        # text-type fields default to "" (so they don't render as Yes/No), others to None
        "extras": {e.key: ("" if e.type == "text" else None) for e in t.extras},
    }
