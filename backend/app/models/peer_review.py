"""PeerReview model — isolated module for reviewing unpublished papers.

Deliberately kept separate from the Paper model: peer reviews are confidential
pre-publication assessments and must never mix with the public bibliography,
Zotero sync, topic indexing, or dashboard statistics.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.models.paper import Base


class PeerReview(Base):
    __tablename__ = "peer_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # --- Submission metadata (entered by the reviewer) ---
    title = Column(Text, nullable=False)
    authors = Column(Text, nullable=True)           # free-text (comma-separated)
    target_journal = Column(String(255), nullable=True)
    manuscript_id = Column(String(100), nullable=True)   # external submission ID
    deadline = Column(String(10), nullable=True)   # YYYY-MM-DD
    reviewer_role = Column(String(50), nullable=True)    # e.g. "Reviewer 2"

    # --- PDF file ---
    pdf_path = Column(Text, nullable=True)          # local path under data/peer-review/{id}/

    # --- Review content (free text + rubric) ---
    # Rubric stored as JSON: {items: [{dimension, score, comment}], recommendation}
    rubric_json = Column(Text, nullable=True)
    comments_to_authors = Column(Text, nullable=True)
    confidential_comments = Column(Text, nullable=True)
    recommendation = Column(String(30), nullable=True)   # accept | minor_revision | major_revision | reject

    # --- Generated artifacts (cached) ---
    review_pdf_path = Column(Text, nullable=True)
    review_txt_path = Column(Text, nullable=True)

    # --- Lifecycle ---
    status = Column(String(20), default="draft")   # draft | in_progress | submitted | archived
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
