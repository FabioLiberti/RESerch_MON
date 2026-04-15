"""Job execution log for scheduled tasks."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.models.paper import Base


class JobRun(Base):
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(50), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(10), default="running")  # running, ok, error
    result_summary = Column(Text, nullable=True)     # e.g. "94 new papers"
    error_message = Column(Text, nullable=True)
