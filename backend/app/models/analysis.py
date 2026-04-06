"""Analysis, FetchLog, and DailyReport models."""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Float
from sqlalchemy.orm import relationship

from app.models.paper import Base


class SyntheticAnalysis(Base):
    __tablename__ = "synthetic_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), unique=True, nullable=False)
    summary = Column(Text, nullable=True)
    key_findings_json = Column(Text, default="[]")
    methodology = Column(Text, nullable=True)
    relevance_score = Column(Float, default=0.0)
    fl_techniques_json = Column(Text, default="[]")
    generated_at = Column(DateTime, default=datetime.utcnow)
    generator = Column(String(50), default="rule-based")

    paper = relationship("Paper", back_populates="analysis")

    @property
    def key_findings(self) -> list[str]:
        return json.loads(self.key_findings_json) if self.key_findings_json else []

    @key_findings.setter
    def key_findings(self, value: list[str]):
        self.key_findings_json = json.dumps(value)

    @property
    def fl_techniques(self) -> list[str]:
        return json.loads(self.fl_techniques_json) if self.fl_techniques_json else []

    @fl_techniques.setter
    def fl_techniques(self, value: list[str]):
        self.fl_techniques_json = json.dumps(value)


class FetchLog(Base):
    __tablename__ = "fetch_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_name = Column(String(50), nullable=False)
    query_topic = Column(String(200), nullable=True)
    query_text = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    papers_found = Column(Integer, default=0)
    papers_new = Column(Integer, default=0)
    errors = Column(Text, nullable=True)
    status = Column(String(20), default="running")  # running, success, partial, failed


class DailyReport(Base):
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_date = Column(String(10), unique=True, nullable=False)  # YYYY-MM-DD
    total_papers = Column(Integer, default=0)
    new_papers = Column(Integer, default=0)
    papers_by_source_json = Column(Text, default="{}")
    papers_by_topic_json = Column(Text, default="{}")
    html_path = Column(Text, nullable=True)
    pdf_path = Column(Text, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)

    @property
    def papers_by_source(self) -> dict:
        return json.loads(self.papers_by_source_json) if self.papers_by_source_json else {}

    @property
    def papers_by_topic(self) -> dict:
        return json.loads(self.papers_by_topic_json) if self.papers_by_topic_json else {}


class AnalysisQueue(Base):
    __tablename__ = "analysis_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="pending")  # pending, running, done, failed
    error_message = Column(Text, nullable=True)
    html_path = Column(Text, nullable=True)
    pdf_path = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    paper = relationship("Paper")
