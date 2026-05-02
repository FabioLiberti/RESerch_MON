# Paper Versioning — Same Work, Different Versions

**Status**: Proposal — not implemented yet
**Created**: 2026-05-02 (after retro-fix of papers 23247/23258 — true duplicates, NOT versions)
**Trigger**: User request (`fxlybs@gmail.com`) — preserve consultability of every imported version of an EU regulation / WHO guideline / etc., even when the same act is referenced from multiple manuscript bibliographies at different times.

---

## Problem

After v2.40.69 the bibliography import correctly catalogs EU acts (regulation / directive / decision) with CELEX as a strong dedup key. Current behavior on re-import of an act whose CELEX already exists in DB:

- The save-as-is branch performs CELEX-based dedup → **skips** creation of a new Paper row, returns the existing `paper_id` for label assignment.

This is fine when the user is re-importing the same exact PDF/text. **It breaks** when:

1. EU publishes a **consolidated version** of the act (CELEX prefix changes from `3YYYY...` to `0YYYY...`, but it's "the same regulation, updated"). Treated as different CELEX → 2 papers, no link between them.
2. The user imports the **same regulation cited differently** in two manuscripts at different times — say manuscript M1 references EHDS 2025 with one wording, M2 with a slightly different excerpt. With CELEX dedup both manuscripts end up pointing to the SAME `paper_id`. But the user may want to preserve the AS-CITED form (the bibliography excerpt) per manuscript for traceability.
3. A **revised version** of the act is published (rare for EU regs, common for WHO/OECD reports). New title, new date, but same conceptual work.

Current data shows the dedup is also fragile inside a single batch (race condition in the loop produced duplicates 23247/23258 from one import) — that bug was patched implicitly by CELEX-first dedup in v2.40.69 but the structural question remains.

---

## Goals

1. When re-importing an act that already exists, **always preserve the new entry** alongside the old one — no silent merge, no skip.
2. **Group siblings** so the user can see "all known versions of this work" from any single paper detail page.
3. **Preserve manuscript bibliography linkage**: each `PaperReference` row keeps its specific `cited_paper_id` — never get re-pointed silently. Manuscript bibliographies stay frozen as captured.
4. **Surface the relationship** in the UI without forcing the user to choose a "primary" version.

---

## Non-goals (out of scope for this DEVPLAN)

- Detecting two-arXiv-versions-of-the-same-paper (academic versioning) — different mechanics.
- Auto-pulling consolidated text from EUR-Lex API — separate enrichment task.
- Migrating historical duplicates retroactively — a separate one-shot script when needed.

---

## Design

### Schema

Two minimal additions to `Paper` (no new table — keeps SQLite migration trivial):

```python
class Paper(Base):
    ...
    # Group key for same-work sibling discovery. For EU acts, set to the
    # bare CELEX number (`32025R0327`). For WHO/OECD reports, set to a
    # normalized title hash. NULL for standalone academic papers.
    work_group_key = Column(String(64), nullable=True, index=True)

    # Free-text version label set at import time (e.g. "original",
    # "consolidated 2024-06-01", "amended via Reg 2024/2847").
    # Optional — many siblings will leave it NULL and rely on
    # publication_date + source for differentiation.
    version_label = Column(String(120), nullable=True)
```

Migration on prod: `ALTER TABLE papers ADD COLUMN work_group_key VARCHAR(64)` + index, `ALTER TABLE papers ADD COLUMN version_label VARCHAR(120)`. Per project memory feedback (sqlite_migration), explicit DDL on prod is required — `Base.metadata.create_all` will not add columns.

### Save-flow change

In `backend/app/api/bibliography.py` save-as-is branch:

- **Before**: if CELEX matches existing paper → return existing `paper_id`, skip creation.
- **After**:
  - Always create a new Paper row.
  - Set `work_group_key = item.celex` when present; otherwise `work_group_key = "title:" + normalize_title(item.title)[:120]`.
  - If a sibling exists with the same `work_group_key`, log it (informational, not a block).

For the regular (S2-resolved) branch where DOI is present, behavior unchanged: DOI dedup still applies (academic papers with the same DOI are genuinely the same record, no version semantics).

### UI

On `/papers/[id]` paper detail page, add a side card **"Other versions of this work"** (shown only when `work_group_key` is set AND siblings exist):

- Query: `SELECT id, title, publication_date, version_label, source FROM papers WHERE work_group_key = ? AND id != ? ORDER BY publication_date DESC`
- Render each sibling as a clickable row with date + version_label + source tag (e.g. "EUR-Lex: original" vs "EUR-Lex: consolidated 2024").
- For EU acts, additionally show the EUR-Lex link of each sibling for direct navigation.

### Discovery / search

No change required. Search continues to surface all papers individually. Future enhancement: a filter "Group by work" toggle that collapses siblings under the most recent version.

### CELEX consolidated detection (optional)

If the parser sees a CELEX that begins with `0` (e.g. `02016R0679`), recognize it as the **consolidated** version of the corresponding original (`32016R0679`):

- Set `work_group_key = "32016R0679"` (the original's CELEX) for both.
- Set `version_label = "consolidated"` on the `0...` import.

This is the single most common versioning scenario for EU regs.

---

## Implementation order

1. **Schema migration** on prod: `ALTER TABLE papers ADD COLUMN work_group_key VARCHAR(64)` + index + `version_label`.
2. **Backend save-flow patch**: stop CELEX-skip, always create + set `work_group_key`.
3. **Backfill**: one-shot script to populate `work_group_key` on existing papers (use CELEX from `external_ids`, fallback normalized title).
4. **Frontend "Other versions" card** on paper detail page.
5. **Optional**: CELEX consolidated detection in `bibliography_parser.py`.

Estimated effort: 1 small focused session (~2-3 hours).

---

## Open decisions (for later)

- Should `work_group_key` be exposed in the discovery list view (badge "v2 of N"), or only on detail page? — Default: detail-only first, evaluate after a few uses.
- For non-EU non-CELEX docs (WHO, OECD reports), should we auto-group by normalized title or require an explicit user "link as version" action? — Recommendation: auto-group by normalized title with high threshold (90%+), let user disconnect from sibling group manually if false positive.
- When deleting a paper that's part of a version group, do we cascade or warn? — Recommendation: warn, never cascade.

---

## Reference incident

- Papers 23247 and 23258 (both `Regulation (EU) 2025/327` — EHDS) were created 18 seconds apart in the same import batch on 2026-05-02. They were true duplicates (race condition in v2.40.68 save loop), not versions. Resolved 2026-05-02 by retro-fix metadata (v2.40.69) + manual merge (kept 23258 with `ICSIS 2026` label, deleted 23247). This DEVPLAN exists because of the user follow-up: "in case they HAD been different versions, what should we do?".
