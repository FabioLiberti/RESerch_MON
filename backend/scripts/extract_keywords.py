#!/usr/bin/env python3
"""Extract keywords from all papers using abstract analysis + compendium tags."""

import asyncio
import json
import logging
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session, engine
from app.models.paper import Base, Paper, PaperSource
from app.models.analysis import SyntheticAnalysis
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("extract_keywords")

# Domain-specific keyword vocabulary for FL research
FL_KEYWORD_VOCAB = [
    # Core FL
    "federated learning", "federated averaging", "FedAvg", "FedProx", "FedSGD",
    "SCAFFOLD", "FedNova", "FedBN", "FedPer", "FedRep",
    "federated optimization", "model aggregation", "client selection",
    "communication efficiency", "communication-efficient",
    # Privacy
    "differential privacy", "secure aggregation", "homomorphic encryption",
    "privacy-preserving", "data privacy", "privacy budget", "epsilon",
    "secure multi-party computation", "trusted execution",
    # Data heterogeneity
    "non-IID", "non-iid", "data heterogeneity", "label skew", "feature skew",
    "quantity skew", "statistical heterogeneity", "class imbalance",
    # Systems
    "edge computing", "edge devices", "IoT", "resource-constrained",
    "model compression", "knowledge distillation", "split learning",
    "asynchronous", "decentralized", "peer-to-peer",
    "vertical federated", "horizontal federated", "cross-silo", "cross-device",
    # Healthcare
    "healthcare", "clinical", "medical imaging", "electronic health records", "EHR",
    "hospital", "patient", "diagnosis", "pathology", "radiology",
    "FHIR", "HL7", "EHDS", "European Health Data Space",
    "clinical trial", "multi-institutional", "biomedical",
    # ML/DL
    "deep learning", "neural network", "convolutional", "transformer",
    "transfer learning", "personalization", "fine-tuning",
    "reinforcement learning", "generative", "GAN",
    "natural language processing", "NLP", "computer vision",
    # Security
    "Byzantine", "adversarial", "robust", "poisoning", "backdoor",
    "model inversion", "gradient leakage",
    # Other
    "blockchain", "incentive mechanism", "convergence",
    "benchmark", "survey", "taxonomy", "framework",
    "scalability", "heterogeneous", "personalized",
]

# Compile patterns for faster matching
FL_PATTERNS = [(kw, re.compile(re.escape(kw), re.IGNORECASE)) for kw in FL_KEYWORD_VOCAB]


def extract_keywords_from_text(title: str, abstract: str | None) -> list[str]:
    """Extract keywords from title and abstract using domain vocabulary matching."""
    text = f"{title} {abstract or ''}"
    found = []

    for keyword, pattern in FL_PATTERNS:
        if pattern.search(text):
            # Normalize to lowercase canonical form
            found.append(keyword.lower())

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for kw in found:
        normalized = kw.strip()
        if normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)

    return unique


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Load compendium tags from original JSON
    compendium_tags = {}
    papers_json = Path(__file__).parent.parent.parent / "_fedcompendiumXL_CC" / "public" / "data" / "papers.json"
    if papers_json.exists():
        with open(papers_json) as f:
            for p in json.load(f):
                pid = p.get("id", "")
                tags = p.get("tags", []) + p.get("category", [])
                compendium_tags[pid] = [t.lower().replace("-", " ") for t in tags]
        logger.info(f"Loaded compendium tags for {len(compendium_tags)} papers")

    updated = 0
    all_keywords = Counter()

    async with async_session() as db:
        # Get all papers with sources and analysis
        result = await db.execute(
            select(Paper).options(
                selectinload(Paper.sources),
                selectinload(Paper.analysis),
            )
        )
        papers = result.unique().scalars().all()
        logger.info(f"Processing {len(papers)} papers...")

        for paper in papers:
            keywords = set()

            # 1. Extract from title + abstract
            text_kws = extract_keywords_from_text(paper.title, paper.abstract)
            keywords.update(text_kws)

            # 2. Add compendium tags if available
            for src in paper.sources:
                if src.source_name == "compendium" and src.source_id in compendium_tags:
                    keywords.update(compendium_tags[src.source_id])

            # 3. Add FL techniques from analysis
            if paper.analysis and paper.analysis.fl_techniques:
                keywords.update(t.lower() for t in paper.analysis.fl_techniques)

            # 4. Add methodology from analysis
            if paper.analysis and paper.analysis.methodology and paper.analysis.methodology != "not determined":
                keywords.add(paper.analysis.methodology)

            final_keywords = sorted(keywords)
            if final_keywords:
                paper.keywords = final_keywords
                updated += 1
                for kw in final_keywords:
                    all_keywords[kw] += 1

        await db.commit()

    await engine.dispose()

    logger.info(f"\nDone: {updated}/{len(papers)} papers updated with keywords")
    logger.info(f"\nTop 30 keywords:")
    for kw, count in all_keywords.most_common(30):
        logger.info(f"  {kw}: {count} papers")


if __name__ == "__main__":
    asyncio.run(main())
