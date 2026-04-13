"""PeerReview model — module for reviewing papers.

Optionally linked to a Paper record via `paper_id`. When linked, the peer
review's manuscript metadata (title, authors, journal) comes from the Paper
record and the paper detail page shows an "Open Review Form" button. When
not linked (legacy mode), the peer review carries its own standalone metadata.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.paper import Base


class PeerReview(Base):
    __tablename__ = "peer_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # --- Link to Paper (optional for backward compatibility with existing PRs) ---
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True, index=True)
    paper = relationship("Paper", foreign_keys=[paper_id])

    # --- Submission metadata (entered by the reviewer) ---
    title = Column(Text, nullable=False)
    authors = Column(Text, nullable=True)           # free-text (comma-separated)
    target_journal = Column(String(255), nullable=True)
    manuscript_id = Column(String(100), nullable=True)   # external submission ID
    deadline = Column(String(10), nullable=True)   # YYYY-MM-DD
    reviewer_role = Column(String(50), nullable=True)    # e.g. "Reviewer 2"

    # Which review template drives the rubric / recommendations / extras
    template_id = Column(String(50), default="generic", nullable=False)

    # --- PDF file ---
    pdf_path = Column(Text, nullable=True)          # local path under data/peer-review/{id}/

    # --- Review content (free text + rubric) ---
    # Rubric stored as JSON: {items: [{dimension, score, comment}], recommendation}
    rubric_json = Column(Text, nullable=True)
    comments_to_authors = Column(Text, nullable=True)
    confidential_comments = Column(Text, nullable=True)
    recommendation = Column(String(30), nullable=True)   # accept | minor_revision | major_revision | reject

    # --- Reviewer's private working notes (NEVER included in the review output) ---
    private_notes = Column(Text, nullable=True)

    # --- Generated artifacts (cached, all four formats kept in sync) ---
    review_pdf_path = Column(Text, nullable=True)
    review_txt_path = Column(Text, nullable=True)
    review_md_path  = Column(Text, nullable=True)
    review_tex_path = Column(Text, nullable=True)

    # --- Lifecycle ---
    status = Column(String(20), default="draft")   # draft | in_progress | submitted | archived
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
