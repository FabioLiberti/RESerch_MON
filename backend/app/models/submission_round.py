"""SubmissionRound model — tracks each submission/revision cycle of a manuscript.

Each round represents one submission (or re-submission) to a journal/conference,
with an associated document (PDF), a decision, and a date. Rounds are numbered
sequentially: 0 = initial submission, 1 = first revision, 2 = second revision, etc.
The final round with decision='accepted' typically leads to a camera-ready submission.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.models.paper import Base


class SubmissionRound(Base):
    __tablename__ = "submission_rounds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)

    round_number = Column(Integer, nullable=False, default=0)
    label = Column(String(100), nullable=False)  # e.g. "EA Submission", "Revised Paper", "Camera Ready"

    # What type of document was submitted in this round
    document_type = Column(String(30), default="full_paper")  # abstract | extended_abstract | full_paper | camera_ready | other
    document_path = Column(Text, nullable=True)  # PDF file path

    # Submission date
    submitted_at = Column(String(10), nullable=True)  # YYYY-MM-DD

    # Decision received
    decision = Column(String(30), nullable=True)  # pending | accepted | accepted_with_revisions | minor_revisions | major_revisions | rejected
    decision_at = Column(String(10), nullable=True)  # YYYY-MM-DD
    decision_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
