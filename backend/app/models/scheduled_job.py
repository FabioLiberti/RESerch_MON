"""Scheduled job configuration + execution log models."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from app.models.paper import Base


class ScheduledJob(Base):
    """Persistent job definition — replaces hardcoded scheduler config."""
    __tablename__ = "scheduled_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_key = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "discovery", "citation_refresh"
    label = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    job_type = Column(String(30), nullable=False, default="discovery")  # discovery | citation_refresh
    hour = Column(Integer, default=6)
    minute = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    notify = Column(Boolean, default=True)
    # For discovery jobs: optional topic filter (NULL = all topics)
    topic_filter = Column(String(200), nullable=True)  # topic name, or NULL for all
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JobRun(Base):
    """Execution log entry for a scheduled job."""
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(50), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(10), default="running")  # running, ok, error
    result_summary = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
