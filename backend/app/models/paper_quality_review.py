"""PaperQualityReview model — versioned scientific quality assessment of a published paper.

Distinct from:
    - SyntheticAnalysis / AnalysisQueue → those are LLM analyses of a paper
    - PeerReview → that is for unpublished manuscripts being reviewed for journals
    - validation_status on AnalysisQueue → that is meta-validation of the LLM output

This is the reviewer's own scientific judgement of an already-published paper,
typically used for personal bibliography quality grading and to share assessments
with academic tutors. Multiple versions per paper are supported: when the
reviewer reconsiders and updates a substantive judgement, they can fork to a
new version while keeping the previous one in history.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.paper import Base


class PaperQualityReview(Base):
    __tablename__ = "paper_quality_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)

    # --- Versioning ---
    version = Column(Integer, default=1, nullable=False)
    is_current = Column(Boolean, default=True, nullable=False)
    parent_version = Column(Integer, nullable=True)   # version this was forked from

    # --- Template + structured content ---
    template_id = Column(String(50), default="paper-quality", nullable=False)
    rubric_json = Column(Text, nullable=True)            # {items, extras}
    overall_grade = Column(String(20), nullable=True)    # excellent | good | adequate | weak | unreliable
    overall_score = Column(Integer, nullable=True)       # 1-5 reviewer-defined overall
    overall_assessment = Column(Text, nullable=True)     # free-text overall judgement
    private_notes = Column(Text, nullable=True)          # never included in exports

    # --- Generated artifacts (cached, all four formats kept in sync) ---
    review_pdf_path = Column(Text, nullable=True)
    review_tex_path = Column(Text, nullable=True)
    review_md_path  = Column(Text, nullable=True)
    review_txt_path = Column(Text, nullable=True)

    # --- Lifecycle ---
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("Paper")
