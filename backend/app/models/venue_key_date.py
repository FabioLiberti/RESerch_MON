"""VenueKeyDate model — conference/journal key milestones for a manuscript.

Tracks the official calendar published by a venue (IFKAD, FLICS, ICSIS, ...):
submission deadlines, notifications, registration cut-offs, conference dates.

Each row is paper-scoped. Optional FKs let a key date link to the
SubmissionRound it triggered (e.g. "Extended Abstract Deadline" → Round 0)
or to the ReviewerEntry where the related notification was recorded.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Boolean

from app.models.paper import Base


class VenueKeyDate(Base):
    __tablename__ = "venue_key_dates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False, index=True)

    # Human-readable label (from preset dropdown or custom)
    label = Column(String(120), nullable=False)

    # Primary date (YYYY-MM-DD)
    date = Column(String(10), nullable=False)

    # Completion flag — user marks milestone as done
    is_done = Column(Boolean, default=False, nullable=False)

    # Optional free-text notes (e.g. "extended to March 10")
    notes = Column(Text, nullable=True)

    # Optional URL to the venue's key-dates page
    source_url = Column(Text, nullable=True)

    # Manual ordering override (default: by date asc)
    order_index = Column(Integer, default=0, nullable=False)

    # Optional links (ON DELETE SET NULL — preserve key date if linked entity removed)
    linked_round_id = Column(Integer, ForeignKey("submission_rounds.id", ondelete="SET NULL"), nullable=True)
    linked_journal_entry_id = Column(Integer, ForeignKey("reviewer_entries.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
