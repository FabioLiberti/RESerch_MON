"""ReviewJournal model — structured diary of reviews received for a paper.

Used for both:
- my_manuscript papers: reviews received from journal reviewers (2-3 per submission)
- reviewing papers: editorial guidance received from the journal/editor

Each ReviewerEntry represents one reviewer's feedback. Within each entry,
individual observations are stored as a JSON array with severity, status,
section reference, and the user's response/action.
"""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.paper import Base


class ReviewerEntry(Base):
    __tablename__ = "reviewer_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)

    # Who gave this review
    reviewer_label = Column(String(100), nullable=False)  # e.g. "Reviewer 1", "Editor", "Prof. Rossi (colloquio)"
    source_type = Column(String(30), default="other")     # email | pdf_annotated | editorial_letter | scholarone | verbal | other

    # When
    received_at = Column(String(10), nullable=True)  # YYYY-MM-DD (nullable for verbal/undated)

    # Raw text — the full review as received, copied/pasted/transcribed
    raw_text = Column(Text, nullable=True)

    # Optional attachment (e.g. annotated PDF, editorial letter)
    attachment_path = Column(Text, nullable=True)

    # Reviewer's overall rating (e.g. 4 out of 5)
    rating = Column(Integer, nullable=True)      # e.g. 4
    rating_max = Column(Integer, nullable=True)   # e.g. 5 (scale: 1-5, 1-10, etc.)
    rating_label = Column(String(200), nullable=True)  # e.g. "Overall rating for potential contribution to IFKAD"

    # Reviewer's decision (e.g. "Accepted with minor revision")
    decision = Column(String(100), nullable=True)

    # Structured rubric: JSON array of {dimension, score, score_max}
    # e.g. [{"dimension": "Relevance to the proposed topic", "score": 4, "score_max": 5}]
    rubric_json = Column(Text, nullable=True)

    # Structured observations extracted from the raw text
    # JSON array: [{"text": "...", "section_ref": "...", "severity": "major|minor|suggestion|praise",
    #               "status": "to_address|addressed|rejected_justified|not_applicable",
    #               "response": "..."}]
    items_json = Column(Text, default="[]")

    # Notification fields (for tutor_feedback entries)
    addressed_to_json = Column(Text, nullable=True)   # JSON array of usernames: ["admin", "fabio.liberti"]
    note_status = Column(String(20), nullable=True)    # new | read | replied | acknowledged
    read_at = Column(DateTime, nullable=True)
    history_json = Column(Text, nullable=True)         # JSON array of {action, user, timestamp, text?}

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def items(self) -> list[dict]:
        return json.loads(self.items_json) if self.items_json else []

    @items.setter
    def items(self, value: list[dict]):
        self.items_json = json.dumps(value)

    @property
    def addressed_to(self) -> list[str]:
        return json.loads(self.addressed_to_json) if self.addressed_to_json else []

    @addressed_to.setter
    def addressed_to(self, value: list[str]):
        self.addressed_to_json = json.dumps(value) if value else None

    @property
    def history(self) -> list[dict]:
        return json.loads(self.history_json) if self.history_json else []

    @history.setter
    def history(self, value: list[dict]):
        self.history_json = json.dumps(value) if value else None

    @property
    def rubric(self) -> list[dict]:
        return json.loads(self.rubric_json) if self.rubric_json else []

    @rubric.setter
    def rubric(self, value: list[dict]):
        self.rubric_json = json.dumps(value)
