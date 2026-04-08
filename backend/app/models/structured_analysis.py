"""Structured analysis data extracted from paper analysis reports."""

import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.models.paper import Base


class StructuredAnalysis(Base):
    __tablename__ = "structured_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    analysis_queue_id = Column(Integer, ForeignKey("analysis_queue.id", ondelete="CASCADE"), nullable=True)

    # Core method info
    problem_addressed = Column(Text, nullable=True)
    proposed_method = Column(Text, nullable=True)
    fl_techniques_json = Column(Text, default="[]")
    datasets_json = Column(Text, default="[]")
    baselines_json = Column(Text, default="[]")

    # Performance
    best_metric_name = Column(String(100), nullable=True)
    best_metric_value = Column(Float, nullable=True)
    best_baseline_name = Column(String(200), nullable=True)
    best_baseline_value = Column(Float, nullable=True)
    improvement_delta = Column(Float, nullable=True)

    # Qualitative assessment
    privacy_mechanism = Column(String(100), nullable=True)
    privacy_formal = Column(Boolean, nullable=True)
    reproducibility_score = Column(Integer, nullable=True)  # 1-5
    novelty_level = Column(String(50), nullable=True)  # incremental, moderate, paradigmatic
    relevance = Column(String(20), nullable=True)  # Bassa, Media, Alta, Molto Alta

    # Healthcare
    healthcare_applicable = Column(Boolean, nullable=True)
    healthcare_evidence = Column(String(20), nullable=True)  # direct, indirect, speculative, none

    # Text summaries
    limitations_declared_json = Column(Text, default="[]")
    limitations_identified_json = Column(Text, default="[]")
    key_findings_summary = Column(Text, nullable=True)

    # Extra fields (flexible JSON for future additions)
    extra_json = Column(Text, default="{}")

    created_at = Column(DateTime, default=datetime.utcnow)

    # Properties for JSON fields
    @property
    def fl_techniques(self) -> list[str]:
        return json.loads(self.fl_techniques_json) if self.fl_techniques_json else []

    @fl_techniques.setter
    def fl_techniques(self, value: list[str]):
        self.fl_techniques_json = json.dumps(value)

    @property
    def datasets(self) -> list[str]:
        return json.loads(self.datasets_json) if self.datasets_json else []

    @datasets.setter
    def datasets(self, value: list[str]):
        self.datasets_json = json.dumps(value)

    @property
    def baselines(self) -> list[str]:
        return json.loads(self.baselines_json) if self.baselines_json else []

    @baselines.setter
    def baselines(self, value: list[str]):
        self.baselines_json = json.dumps(value)

    @property
    def limitations_declared(self) -> list[str]:
        return json.loads(self.limitations_declared_json) if self.limitations_declared_json else []

    @limitations_declared.setter
    def limitations_declared(self, value: list[str]):
        self.limitations_declared_json = json.dumps(value)

    @property
    def limitations_identified(self) -> list[str]:
        return json.loads(self.limitations_identified_json) if self.limitations_identified_json else []

    @limitations_identified.setter
    def limitations_identified(self, value: list[str]):
        self.limitations_identified_json = json.dumps(value)

    @property
    def extra(self) -> dict:
        return json.loads(self.extra_json) if self.extra_json else {}

    @extra.setter
    def extra(self, value: dict):
        self.extra_json = json.dumps(value)
