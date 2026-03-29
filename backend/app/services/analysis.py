"""Synthetic paper analysis service.

Generates structured analysis from paper title and abstract using
rule-based NLP (keyword extraction, methodology detection, FL technique identification).
"""

import logging
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import SyntheticAnalysis
from app.models.paper import Paper

logger = logging.getLogger(__name__)

# FL techniques to detect in abstracts
FL_TECHNIQUES = [
    "FedAvg", "FedProx", "FedSGD", "FedMA", "SCAFFOLD",
    "FedNova", "FedBN", "FedPer", "FedRep", "Ditto",
    "pFedMe", "Per-FedAvg", "FedBABU",
    "differential privacy", "secure aggregation", "homomorphic encryption",
    "model compression", "knowledge distillation", "transfer learning",
    "split learning", "gossip protocol", "decentralized learning",
    "vertical federated", "horizontal federated", "federated transfer",
    "asynchronous federated", "heterogeneous federated",
    "Byzantine-resilient", "communication-efficient",
    "personalized federated", "clustered federated",
]

# Methodology keywords
METHODOLOGY_KEYWORDS = {
    "experimental": ["experiment", "benchmark", "evaluation", "dataset", "baseline", "comparison"],
    "theoretical": ["theorem", "proof", "convergence", "bound", "analysis", "guarantee"],
    "survey": ["survey", "review", "taxonomy", "overview", "comprehensive", "systematic review"],
    "simulation": ["simulation", "synthetic", "simulated", "Monte Carlo"],
    "case study": ["case study", "real-world", "deployment", "clinical trial", "hospital"],
    "framework": ["framework", "architecture", "system design", "platform", "pipeline"],
}

# Key finding patterns
FINDING_PATTERNS = [
    r"(?:we|our|this)\s+(?:show|demonstrate|prove|find|observe|achieve|propose)\s+that\s+(.{20,120})",
    r"(?:results|experiments)\s+(?:show|demonstrate|indicate|suggest|confirm)\s+(?:that\s+)?(.{20,120})",
    r"(?:outperform|surpass|exceed|improve)\w*\s+(.{15,80})",
    r"(?:achieve|obtain|reach)\w*\s+(?:an?\s+)?(?:accuracy|performance|score|result)\s+of\s+(.{10,60})",
]


def detect_fl_techniques(text: str) -> list[str]:
    """Detect FL techniques mentioned in text."""
    text_lower = text.lower()
    found = []
    for technique in FL_TECHNIQUES:
        if technique.lower() in text_lower:
            found.append(technique)
    return sorted(set(found))


def detect_methodology(text: str) -> str:
    """Detect the primary methodology from text."""
    text_lower = text.lower()
    scores: dict[str, int] = {}

    for method, keywords in METHODOLOGY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[method] = score

    if not scores:
        return "not determined"

    return max(scores, key=scores.get)


def extract_key_findings(abstract: str) -> list[str]:
    """Extract key findings from abstract using regex patterns."""
    findings = []
    for pattern in FINDING_PATTERNS:
        matches = re.findall(pattern, abstract, re.IGNORECASE)
        for match in matches:
            clean = match.strip().rstrip(".,;:")
            if len(clean) > 20:
                findings.append(clean)

    # Deduplicate similar findings
    unique = []
    for f in findings:
        if not any(f[:30].lower() in existing.lower() for existing in unique):
            unique.append(f)

    return unique[:5]  # Max 5 findings


def compute_relevance_score(title: str, abstract: str) -> float:
    """Compute relevance score (0.0-1.0) for FL research.

    Higher score = more relevant to federated learning research.
    """
    text = f"{title} {abstract}".lower()
    score = 0.0

    # Core FL terms
    core_terms = ["federated learning", "federated", "privacy-preserving", "distributed learning"]
    for term in core_terms:
        if term in text:
            score += 0.2

    # Healthcare/clinical terms (bonus for target domain)
    health_terms = ["healthcare", "clinical", "medical", "hospital", "patient", "diagnosis", "EHR"]
    for term in health_terms:
        if term.lower() in text:
            score += 0.05

    # EHDS terms
    ehds_terms = ["european health data space", "ehds", "cross-border", "health data governance"]
    for term in ehds_terms:
        if term.lower() in text:
            score += 0.1

    # Technical depth indicators
    if detect_fl_techniques(text):
        score += 0.1

    return min(score, 1.0)


def generate_summary(title: str, abstract: str, fl_techniques: list[str], methodology: str) -> str:
    """Generate a concise 1-2 sentence summary."""
    # Start with methodology context
    method_prefix = {
        "experimental": "This experimental study",
        "theoretical": "This theoretical work",
        "survey": "This survey paper",
        "simulation": "This simulation-based study",
        "case study": "This case study",
        "framework": "This paper proposes a framework that",
        "not determined": "This paper",
    }
    prefix = method_prefix.get(methodology, "This paper")

    # Extract first meaningful sentence from abstract
    sentences = re.split(r"(?<=[.!?])\s+", abstract)
    # Find the most informative sentence (skip intro fluff)
    informative = None
    for sent in sentences:
        if any(kw in sent.lower() for kw in ["propos", "present", "introduc", "develop", "design"]):
            informative = sent
            break
    if not informative and len(sentences) > 1:
        informative = sentences[1]  # Second sentence often has the contribution
    elif not informative:
        informative = sentences[0]

    # Keep it concise
    if len(informative) > 200:
        informative = informative[:200].rsplit(" ", 1)[0] + "..."

    tech_str = ""
    if fl_techniques:
        tech_str = f" Key techniques: {', '.join(fl_techniques[:3])}."

    return f"{prefix} — {informative}{tech_str}"


class AnalysisService:
    """Generates synthetic analyses for papers."""

    async def analyze_paper(self, db: AsyncSession, paper_id: int) -> SyntheticAnalysis | None:
        """Generate or update synthetic analysis for a paper."""
        result = await db.execute(select(Paper).where(Paper.id == paper_id))
        paper = result.scalar_one_or_none()
        if not paper or not paper.abstract:
            return None

        text = f"{paper.title} {paper.abstract}"

        fl_techniques = detect_fl_techniques(text)
        methodology = detect_methodology(text)
        key_findings = extract_key_findings(paper.abstract)
        relevance = compute_relevance_score(paper.title, paper.abstract)
        summary = generate_summary(paper.title, paper.abstract, fl_techniques, methodology)

        # Check if analysis exists
        result = await db.execute(
            select(SyntheticAnalysis).where(SyntheticAnalysis.paper_id == paper_id)
        )
        analysis = result.scalar_one_or_none()

        if analysis:
            analysis.summary = summary
            analysis.methodology = methodology
            analysis.relevance_score = relevance
            analysis.generated_at = datetime.utcnow()
            analysis.key_findings = key_findings
            analysis.fl_techniques = fl_techniques
        else:
            analysis = SyntheticAnalysis(
                paper_id=paper_id,
                summary=summary,
                methodology=methodology,
                relevance_score=relevance,
                generator="rule-based",
            )
            analysis.key_findings = key_findings
            analysis.fl_techniques = fl_techniques
            db.add(analysis)

        await db.flush()
        logger.info(f"Analysis generated for paper {paper_id}: relevance={relevance:.2f}")
        return analysis

    async def analyze_all_papers(self, db: AsyncSession) -> int:
        """Generate analyses for all papers that have abstracts."""
        result = await db.execute(
            select(Paper.id).where(
                Paper.abstract.isnot(None),
                Paper.abstract != "",
            )
        )
        paper_ids = [row[0] for row in result.all()]

        count = 0
        for pid in paper_ids:
            analysis = await self.analyze_paper(db, pid)
            if analysis:
                count += 1

        logger.info(f"Generated {count} analyses for {len(paper_ids)} papers")
        return count
