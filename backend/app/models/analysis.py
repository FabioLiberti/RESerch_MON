"""Analysis, FetchLog, and DailyReport models."""

import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, Float
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


class SmartSearchJob(Base):
    __tablename__ = "smart_search_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    keywords_json = Column(Text, nullable=False)
    sources_json = Column(Text, nullable=False)
    max_per_source = Column(Integer, default=10)
    search_mode = Column(String(20), default="keywords")  # keywords, title, author, doi
    filters_json = Column(Text, nullable=True)  # JSON: {year_from, year_to, min_citations, open_access}
    status = Column(String(20), default="pending")  # pending, running, done, failed
    results_json = Column(Text, nullable=True)  # JSON array of search results
    queries_used_json = Column(Text, nullable=True)
    total_found = Column(Integer, default=0)
    already_in_db = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    @property
    def keywords(self) -> list[str]:
        return json.loads(self.keywords_json) if self.keywords_json else []

    @keywords.setter
    def keywords(self, value: list[str]):
        self.keywords_json = json.dumps(value)

    @property
    def sources(self) -> list[str]:
        return json.loads(self.sources_json) if self.sources_json else []

    @sources.setter
    def sources(self, value: list[str]):
        self.sources_json = json.dumps(value)

    @property
    def results(self) -> list[dict]:
        return json.loads(self.results_json) if self.results_json else []

    @results.setter
    def results(self, value: list[dict]):
        self.results_json = json.dumps(value)

    @property
    def queries_used(self) -> dict:
        return json.loads(self.queries_used_json) if self.queries_used_json else {}

    @queries_used.setter
    def queries_used(self, value: dict):
        self.queries_used_json = json.dumps(value)


class AnalysisQueue(Base):
    __tablename__ = "analysis_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    analysis_mode = Column(String(10), default="quick")  # quick or deep
    status = Column(String(20), default="pending")  # pending, running, done, failed
    error_message = Column(Text, nullable=True)
    html_path = Column(Text, nullable=True)
    pdf_path = Column(Text, nullable=True)
    md_path = Column(Text, nullable=True)
    tex_path = Column(Text, nullable=True)
    version = Column(Integer, default=1)
    zotero_synced = Column(Boolean, default=False)
    # Validation fields (review by user)
    validation_status = Column(String(20), nullable=True)  # validated, rejected, needs_revision, pending
    validation_score = Column(Integer, nullable=True)  # 1-5
    validation_notes = Column(Text, nullable=True)
    validation_rubric_json = Column(Text, nullable=True)  # JSON: rubric checklist + per-item notes
    validated_at = Column(DateTime, nullable=True)
    validated_by = Column(String(100), nullable=True)  # username
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    paper = relationship("Paper")


class CitationLink(Base):
    """Cache of citation relationships between papers (from Semantic Scholar)."""
    __tablename__ = "citation_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Paper in our DB that cites or is cited
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    # Direction: 'references' = paper_id cites cited_paper, 'citations' = cited_paper cites paper_id
    direction = Column(String(20), nullable=False)  # 'references' or 'citations'
    # The other paper — may or may not be in our DB
    cited_doi = Column(String(255), nullable=True)
    cited_s2_id = Column(String(50), nullable=True)
    cited_title = Column(Text, nullable=True)
    cited_citations = Column(Integer, default=0)
    # If the cited paper is also in our DB
    cited_paper_id = Column(Integer, ForeignKey("papers.id", ondelete="SET NULL"), nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
