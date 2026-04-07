"""Label and Note models for paper annotation."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.paper import Base


class Label(Base):
    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(7), nullable=False, default="#6366f1")  # hex color
    created_at = Column(DateTime, default=datetime.utcnow)

    papers = relationship("PaperLabel", back_populates="label", cascade="all, delete-orphan")


class PaperLabel(Base):
    __tablename__ = "paper_labels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    label_id = Column(Integer, ForeignKey("labels.id", ondelete="CASCADE"), nullable=False)

    paper = relationship("Paper")
    label = relationship("Label", back_populates="papers")


class PaperNote(Base):
    __tablename__ = "paper_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), unique=True, nullable=False)
    text = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("Paper")
