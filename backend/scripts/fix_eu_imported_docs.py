#!/usr/bin/env python3
"""Retroactively fix paper_type / publication_date / external_ids / source_name
for papers that were saved before v2.40.69 via the Option-A "save-as-is" branch
(`created_via='bibliography_import_unresolved'`) and that the EU document
detector now recognises as Regulations / Directives / Decisions.

Usage:
  python scripts/fix_eu_imported_docs.py --dry-run   # show what would change
  python scripts/fix_eu_imported_docs.py --apply     # actually update DB

The script is idempotent: re-running it does nothing once everything is fixed.
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, update

from app.database import async_session
from app.models.paper import Paper, PaperSource
from app.services.bibliography_parser import detect_eu_document

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("fix_eu_docs")


async def fix_papers(apply: bool) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(Paper).where(Paper.created_via == "bibliography_import_unresolved")
        )
        papers = result.scalars().all()

        logger.info(f"Found {len(papers)} candidate papers (created_via=bibliography_import_unresolved)")

        n_eligible = 0
        n_changed = 0
        for p in papers:
            if not p.title:
                continue
            eu = detect_eu_document(p.title)
            if not eu:
                continue

            n_eligible += 1
            changes: list[str] = []

            new_type = eu.get("paper_type")
            if new_type and p.paper_type != new_type:
                changes.append(f"paper_type: {p.paper_type!r} -> {new_type!r}")

            new_date = eu.get("publication_date")
            if new_date and p.publication_date != new_date:
                changes.append(f"publication_date: {p.publication_date!r} -> {new_date!r}")

            celex = eu.get("celex")
            existing_celex = (p.external_ids or {}).get("celex") if p.external_ids else None
            if celex and existing_celex != celex:
                changes.append(f"external_ids.celex: {existing_celex!r} -> {celex!r}")

            if not changes:
                continue

            n_changed += 1
            print(f"\n[paper {p.id}] {p.title[:100]}")
            for c in changes:
                print(f"  - {c}")

            if not apply:
                continue

            # Apply changes
            if new_type:
                p.paper_type = new_type
            if new_date:
                p.publication_date = new_date
            if celex:
                # Merge external_ids (don't clobber existing keys)
                ext = dict(p.external_ids or {})
                ext["celex"] = celex
                p.external_ids = ext

            # Update PaperSource: replace generic "bibliography" source row with "eur-lex"
            if celex:
                ps_result = await db.execute(
                    select(PaperSource).where(PaperSource.paper_id == p.id)
                )
                sources = ps_result.scalars().all()
                # Remove old "bibliography" / title-based source rows
                for s in sources:
                    if s.source_name == "bibliography" and (
                        s.source_id.startswith("title:") if s.source_id else False
                    ):
                        await db.delete(s)
                # Add canonical eur-lex source if not already present
                already = any(
                    s.source_name == "eur-lex" and s.source_id == f"celex:{celex}"
                    for s in sources
                )
                if not already:
                    db.add(PaperSource(
                        paper_id=p.id,
                        source_name="eur-lex",
                        source_id=f"celex:{celex}",
                    ))

        if apply:
            await db.commit()
            logger.info(f"\n✓ Applied changes to {n_changed} of {n_eligible} EU-eligible papers")
        else:
            logger.info(f"\n[DRY RUN] {n_changed} of {n_eligible} EU-eligible papers would be updated")
            logger.info("Run with --apply to commit changes.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="Show what would change, don't write")
    g.add_argument("--apply", action="store_true", help="Apply changes to the DB")
    args = ap.parse_args()

    asyncio.run(fix_papers(apply=args.apply))


if __name__ == "__main__":
    main()
