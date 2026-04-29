"""PeerReviewLog — activity log of a peer review we are conducting.

Distinct from `ReviewerEntry` (which logs incoming reviews on a paper).
Each PeerReviewLog row is a single milestone in the lifecycle of a peer
review: creation, manuscript upload, edits, LLM suggestion, attachment
added, snapshot taken, submission, edit-unlock, archive, etc.

`occurred_at` is editable (e.g. backdating a submission marked late);
`created_at` is immutable.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.models.paper import Base


# Canonical event type vocabulary. Free-form description goes in `description`.
EVENT_TYPES = (
    "created",
    "metadata_updated",
    "pdf_uploaded",
    "comments_edited",
    "rubric_edited",
    "recommendation_changed",
    "llm_suggestion_applied",
    "attachment_added",
    "attachment_removed",
    "bundle_snapshot_saved",
    "submitted",
    "edit_unlocked",
    "archived",
    "deleted",
    "receipt_generated",
    "manual_note",
)


class PeerReviewLog(Base):
    __tablename__ = "peer_review_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    peer_review_id = Column(
        Integer,
        ForeignKey("peer_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Canonical event identifier from EVENT_TYPES
    event_type = Column(String(50), nullable=False)

    # Free-text human description (e.g. "Submitted to ScholarOne. Recommendation: minor_revision.")
    description = Column(Text, nullable=True)

    # Optional structured payload (JSON string): before/after states, hash, file refs, etc.
    payload_json = Column(Text, nullable=True)

    # Who triggered this event (username) — nullable for system-generated entries
    actor_username = Column(String(100), nullable=True)

    # When the event happened in real time. Editable so a reviewer who marks a
    # submission late can backdate it to the actual submission moment.
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Immutable system timestamp of when the row was inserted.
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
