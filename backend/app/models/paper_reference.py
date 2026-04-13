"""PaperReference model — tracks which papers a manuscript cites in its bibliography.

Links a manuscript (my_manuscript or reviewing) to papers in the DB that it references.
Supports context (where in the paper it's cited) and free-text notes.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.models.paper import Base


class PaperReference(Base):
    __tablename__ = "paper_references"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # The manuscript that cites
    manuscript_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)

    # The paper being cited (must exist in DB)
    cited_paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)

    # Where in the manuscript this paper is cited
    context = Column(String(50), nullable=True)  # related_work | methodology | comparison | results | discussion | introduction | other

    # Free-text note about why this paper is cited
    note = Column(Text, nullable=True)  # e.g. "Used as baseline in Table 3"

    created_at = Column(DateTime, default=datetime.utcnow)
