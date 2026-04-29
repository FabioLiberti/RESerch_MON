# DEVPLAN — Multi-Round Peer Review Support

**Created**: 2026-04-29
**Status**: design accepted, implementation deferred to phase 2
**Trigger**: when IEEE T-AI (or any other journal) returns a revised manuscript
asking for re-review (typically 2-3 months after the original submission).
**Owner**: Fabio Liberti (FL)
**Related**: v2.40.43–v2.40.46 peer-review attachments + lifecycle + URL alignment.

---

## 1. Why multi-round

In real peer-review processes, a paper goes through 1-3 rounds:

```
Round 1: Manuscript v1 → reviewer review (e.g., Minor Revision)
         ↓
Author response: Manuscript v2 + cover letter explaining revisions
         ↓
Round 2: Reviewer re-reviews → final recommendation (Accept / further revision)
         ↓
[Optional Round 3]
```

Each round needs its own:
- Rubric assessment (10 IEEE T-AI categorical answers)
- Comments to authors (round-specific)
- Confidential comments to editor
- Recommendation
- Submission timestamp + Submission Receipt (each submission is an independent
  attestation event)
- Attachments (revised manuscript, author response letter, supplementary, etc.)

The current schema (one `peer_reviews` row per paper) cannot represent this
without overwriting the round-1 record. Hence this DEVPLAN.

---

## 2. Data model

### 2.1 Schema changes (additive, non-breaking)

```sql
ALTER TABLE peer_reviews ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE peer_reviews ADD COLUMN parent_review_id INTEGER
    REFERENCES peer_reviews(id) ON DELETE SET NULL;
CREATE INDEX ix_peer_reviews_paper_round ON peer_reviews(paper_id, round_number);
```

- `round_number`: 1, 2, 3, … sequential per `paper_id`. Default 1 → existing rows
  remain valid as round 1.
- `parent_review_id`: FK to the previous round's row. Round 1 has it null.
  Used for traversal (e.g., "show all rounds of this paper") and audit.

### 2.2 What is per-round vs shared

| Field | Per-round | Shared (paper-level) |
|---|---|---|
| `rubric_json` | ✓ | |
| `comments_to_authors` | ✓ | |
| `confidential_comments` | ✓ | |
| `recommendation` | ✓ | |
| `submitted_at` | ✓ | |
| `pdf_path` (the manuscript) | ✓ — round N has its own PDF (revised) | |
| Attachments (incl. Receipt) | ✓ — per-round folder | |
| `private_notes` | ✓ | |
| `status` | ✓ | |
| `title`, `authors`, `target_journal` | (copied at round start, editable) | (logically shared) |
| `template_id`, `reviewer_role` | (inherited at round start) | |
| Activity Log | per-round entries, but rendered as a unified timeline across rounds | |

**Storage layout**:

```
data/peer-review/
    {round1_id}/
        paper.pdf                 # manuscript v1
        attachments/
            Review_TAI-...-r1.pdf
            CommentsToAuthors_...-r1.pdf
            CommentsToEditor_...-r1.pdf
            SubmissionReceipt_...-r1.pdf
    {round2_id}/
        paper.pdf                 # manuscript v2 (revised)
        attachments/
            AuthorResponseLetter_...-r2.pdf
            Review_TAI-...-r2.pdf
            CommentsToAuthors_...-r2.pdf
            CommentsToEditor_...-r2.pdf
            SubmissionReceipt_...-r2.pdf
```

Each round has its own folder (because it has its own peer_review.id). This
is the natural extension of the current model — no shared-folder routing
gymnastics required.

---

## 3. API design

### 3.1 New endpoints

```
POST /peer-review/{paper_id}/start-round
    body: {parent_review_id?: int}
    Creates a new peer_review row with:
        - same paper_id
        - round_number = max(existing rounds for paper_id) + 1
        - parent_review_id = body.parent_review_id (defaults to latest round)
        - status = "draft"
        - rubric_json = empty for the inherited template
        - title, target_journal, manuscript_id, template_id, reviewer_role
          copied from the parent round
    Returns the new peer_review (incl. its internal id).

GET /peer-review/by-paper/{paper_id}
    Returns the rounds list:
        {
          paper_id: 1040,
          rounds: [
            {round_number: 1, peer_review_id: 1, status: "submitted",
             recommendation: "minor_revision", submitted_at: "2026-04-29..."},
            {round_number: 2, peer_review_id: 9, status: "in_progress",
             recommendation: null, submitted_at: null}
          ],
          latest: {round_number: 2, peer_review_id: 9, ...}
        }
    The frontend uses this to render the round selector and routes by
    round_number to /peer-review/{paper_id}/round/{n}.
```

### 3.2 Existing endpoints

All existing endpoints keep using `peer_review.id` internally — round 2 is just
another peer_review row with its own `id`, so the existing CRUD/lifecycle/log
endpoints work unchanged on per-round data.

The Submission Receipt's hash MUST include `round_number` in the canonical
payload to ensure round 1 and round 2 produce different hashes even when
content is otherwise similar (rare but possible).

---

## 4. UI design

### 4.1 URL pattern

After phase-1 alignment (v2.40.46), URL is `/peer-review/{paper_id}`. With
multi-round, extend to:

- `/peer-review/{paper_id}` → redirects to the latest round
- `/peer-review/{paper_id}/round/{n}` → specific round

### 4.2 Round selector

Top of the peer-review page, a horizontal strip:

```
┌─────────────────────────────────────────────────────────┐
│ Round 1 ✓ Submitted 2026-04-29 · Minor Revision         │ ← clickable
│ Round 2   In progress                          [active] │ ← clickable, current
│                                       [+ Start Round 3] │ ← button (admin only)
└─────────────────────────────────────────────────────────┘
```

Clicking a round switches the form/attachments/log view. The active round is
highlighted.

### 4.3 Round-aware components

- **Form fields**: bound to current round's data. Locked when current round's
  status is `submitted` or `archived` (existing logic).
- **Attachments section**: shows attachments of current round only. Uploads go
  into current round's folder.
- **Activity Log**: shows entries for **all** rounds in chronological order,
  with a small round badge ("R1", "R2") next to each event for clarity.

### 4.4 "Start Round N" rules

- Visible only when previous round's `status == "submitted"`
- Clicking opens a small dialog:
  - Confirms intent
  - Optional: lets user upload the revised manuscript PDF immediately
  - Optional: lets user upload the author response letter as the first
    attachment
- After creation, page navigates to `/peer-review/{paper_id}/round/{N}`

---

## 5. Implementation order

| Step | Work | Effort |
|---|---|---|
| 1 | DB migration (ADD COLUMN round_number + parent_review_id + index) | 10 min |
| 2 | Backend: new endpoints `start-round` + `by-paper` (extended) | 30 min |
| 3 | Backend: include round_number in Submission Receipt hash payload | 10 min |
| 4 | Frontend: round selector strip on peer-review page | 30 min |
| 5 | Frontend: routing `[paperId]/round/[n]` (Next.js dynamic nested) | 20 min |
| 6 | Frontend: pass current round's peer_review_id to all child components | 15 min |
| 7 | Frontend: Activity Log displays round badge per entry | 10 min |
| 8 | Test scenarios: start round 2, submit round 2, view round 1 read-only | 15 min |
| **Total** | | **~2h** |

---

## 6. Edge cases and decisions

### 6.1 Editing a submitted round
Existing "Edit (unlock)" remains valid. Unlocking a previous round does not
affect later rounds — they continue to live as separate records.

### 6.2 Deleting a round
- Round N can be deleted only if no later rounds exist (N+1, N+2 referencing it
  as parent). Otherwise: orphaned children. Backend rejects with 409.
- Soft-archive is preferred over hard-delete.

### 6.3 Manuscript PDF inheritance
- When starting Round N, the `paper.pdf` of Round N starts empty (the user must
  upload the revised manuscript)
- For convenience, an "Inherit from Round N-1" button could pre-populate the
  PDF, but it's almost always wrong (Round N gets a revised manuscript).
- Decision: **do not inherit**. Force explicit upload of v2.

### 6.4 Cross-round comparison
A future enhancement (NOT in scope of phase 2): a "Compare Round 1 vs Round 2"
view showing side-by-side rubric and recommendation evolution. Useful but not
essential — defer until requested.

### 6.5 Receipt hash includes round_number
Current hash payload (v2.40.45):
```
{manuscript_id, title, template_id, rubric, comments_to_authors,
 confidential_comments, recommendation}
```

Phase-2 update:
```
{manuscript_id, title, template_id, round_number, rubric, comments_to_authors,
 confidential_comments, recommendation}
```

This ensures round 1 and round 2 with otherwise identical content produce
distinct hashes (audit traceability).

---

## 7. Migration notes for existing data

When this DEVPLAN is executed:
- All existing `peer_reviews` rows already have `round_number = 1` (default).
- No backfill of `parent_review_id` needed.
- Data is preserved unchanged; phase-2 is purely additive.

---

## 8. Triggers / when to execute

Execute this DEVPLAN when **either** condition is met:
- IEEE T-AI returns the revised TAI-2026-Mar-A-00547 asking for re-review (most
  likely scenario in 2-3 months)
- A second journal review assignment arrives that is known to involve multiple
  rounds (some venues are explicit about it in the assignment letter)

Until then, the single-round model (current state after v2.40.46) is sufficient.

---

## 9. Cross-references

- [peer_review.py](backend/app/api/peer_review.py) — single-round CRUD + lifecycle
- [peer_review_log.py](backend/app/models/peer_review_log.py) — audit log model
- [peer_review_receipt.py](backend/app/services/peer_review_receipt.py) — Submission Receipt generator
- [PeerReviewAttachments.tsx](frontend/src/components/PeerReviewAttachments.tsx) — attachments UI
- [PeerReviewActivityLog.tsx](frontend/src/components/PeerReviewActivityLog.tsx) — timeline UI
- v2.40.43 attachments
- v2.40.44 inline view + bundle snapshot
- v2.40.45 lifecycle (submit/unlock/archive) + Submission Receipt
- v2.40.46 (next) URL alignment + 5 manual log categories
