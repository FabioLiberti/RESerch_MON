"""Per-user notes on papers (dev notes, bibliography notes)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.models.paper import Base


class UserNote(Base):
    """Per-user, per-paper, per-type note. Each user has their own note."""
    __tablename__ = "user_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    username = Column(String(50), nullable=False)
    note_type = Column(String(20), nullable=False)  # 'dev_notes' | 'bib_notes'
    content = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
