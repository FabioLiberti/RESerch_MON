"""Review Journal API — CRUD for reviewer entries and observations per paper.

Each paper can have multiple ReviewerEntry records (one per reviewer).
Each entry has a raw_text (free-form) and structured items (observations).
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.review_journal import ReviewerEntry
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class ObservationItem(BaseModel):
    text: str
    section_ref: str | None = None
    severity: str = "minor"  # major | minor | suggestion | praise
    status: str = "to_address"  # to_address | addressed | rejected_justified | not_applicable
    response: str | None = None


class RubricDimension(BaseModel):
    dimension: str
    score: int | None = None
    score_max: int = 5


class CreateReviewerEntryRequest(BaseModel):
    reviewer_label: str
    source_type: str = "other"
    received_at: str | None = None
    raw_text: str | None = None
    rating: int | None = None
    rating_max: int | None = None
    rating_label: str | None = None
    decision: str | None = None
    rubric: list[RubricDimension] | None = None
    items: list[ObservationItem] = []
    addressed_to: list[str] | None = None  # usernames to notify


class UpdateReviewerEntryRequest(BaseModel):
    reviewer_label: str | None = None
    source_type: str | None = None
    received_at: str | None = None
    raw_text: str | None = None
    rating: int | None = None
    rating_max: int | None = None
    rating_label: str | None = None
    decision: str | None = None
    rubric: list[RubricDimension] | None = None
    items: list[ObservationItem] | None = None


# --- Helpers ---

def _serialize(entry: ReviewerEntry) -> dict:
    return {
        "id": entry.id,
        "paper_id": entry.paper_id,
        "reviewer_label": entry.reviewer_label,
        "source_type": entry.source_type,
        "received_at": entry.received_at,
        "raw_text": entry.raw_text,
        "attachment_path": entry.attachment_path,
        "has_attachment": bool(entry.attachment_path and Path(entry.attachment_path).exists()),
        "rating": entry.rating,
        "rating_max": entry.rating_max,
        "rating_label": entry.rating_label,
        "decision": entry.decision,
        "rubric": entry.rubric,
        "items": entry.items,
        "addressed_to": entry.addressed_to,
        "note_status": entry.note_status,
        "read_at": entry.read_at.isoformat() if entry.read_at else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


def _storage_dir(paper_id: int) -> Path:
    d = Path(settings.reports_path) / "review-journal" / str(paper_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# --- Endpoints ---

@router.get("/users-list")
async def get_users_list(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active users (username + role) for addressee selection."""
    from sqlalchemy import select as sel
    result = await db.execute(sel(User).where(User.is_active == True))  # noqa: E712
    users = result.scalars().all()
    return [{"username": u.username, "role": u.role} for u in users if u.username != user.username]

@router.get("/{paper_id}")
async def list_entries(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all reviewer entries for a paper, with progress stats."""
    result = await db.execute(
        select(ReviewerEntry)
        .where(ReviewerEntry.paper_id == paper_id)
        .order_by(ReviewerEntry.created_at.asc())
    )
    entries = result.scalars().all()

    # Compute aggregate progress across all entries
    total_items = 0
    addressed = 0
    for e in entries:
        for item in e.items:
            total_items += 1
            if item.get("status") in ("addressed", "rejected_justified", "not_applicable"):
                addressed += 1

    return {
        "paper_id": paper_id,
        "entries": [_serialize(e) for e in entries],
        "total_observations": total_items,
        "addressed": addressed,
        "progress_pct": round(addressed / total_items * 100) if total_items > 0 else 0,
    }


@router.post("/{paper_id}")
async def create_entry(
    paper_id: int,
    body: CreateReviewerEntryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new reviewer entry for a paper."""
    # Viewer can only create tutor_feedback entries
    if user.role != "admin" and body.source_type != "tutor_feedback":
        raise HTTPException(status_code=403, detail="Viewers can only add tutor feedback notes")

    entry = ReviewerEntry(
        paper_id=paper_id,
        reviewer_label=body.reviewer_label,
        source_type=body.source_type,
        received_at=body.received_at,
        raw_text=body.raw_text,
        rating=body.rating,
        rating_max=body.rating_max,
        rating_label=body.rating_label,
        decision=body.decision,
    )
    if body.rubric is not None:
        entry.rubric = [r.model_dump() for r in body.rubric]
    entry.items = [item.model_dump() for item in body.items]

    # Tutor feedback: set notification fields
    if body.source_type == "tutor_feedback":
        entry.addressed_to = body.addressed_to or []
        entry.note_status = "new"
        # Send email to addressed users
        _send_tutor_note_email(user.username, paper_id, body.raw_text or "", body.addressed_to or [], db)

    db.add(entry)
    await db.flush()
    await db.commit()
    await db.refresh(entry)
    logger.info(f"Review journal entry created: paper={paper_id}, reviewer={body.reviewer_label}")
    return _serialize(entry)


@router.put("/entry/{entry_id}")
async def update_entry(
    entry_id: int,
    body: UpdateReviewerEntryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a reviewer entry (label, raw_text, items, etc.)."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Viewer can only edit their own tutor_feedback entries
    if user.role != "admin" and entry.source_type != "tutor_feedback":
        raise HTTPException(status_code=403, detail="Viewers can only edit tutor feedback notes")

    if body.reviewer_label is not None:
        entry.reviewer_label = body.reviewer_label
    if body.source_type is not None:
        entry.source_type = body.source_type
    if body.received_at is not None:
        entry.received_at = body.received_at
    if body.raw_text is not None:
        entry.raw_text = body.raw_text
    if body.rating is not None:
        entry.rating = body.rating
    if body.rating_max is not None:
        entry.rating_max = body.rating_max
    if body.rating_label is not None:
        entry.rating_label = body.rating_label
    if body.decision is not None:
        entry.decision = body.decision
    if body.rubric is not None:
        entry.rubric = [r.model_dump() for r in body.rubric]
    if body.items is not None:
        entry.items = [item.model_dump() for item in body.items]

    await db.flush()
    await db.commit()
    return _serialize(entry)


@router.delete("/entry/{entry_id}")
async def delete_entry(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Viewer can only delete their own tutor_feedback entries
    if user.role != "admin" and entry.source_type != "tutor_feedback":
        raise HTTPException(status_code=403, detail="Viewers can only delete tutor feedback notes")

    await db.delete(entry)
    await db.commit()
    return {"deleted": entry_id}


@router.post("/entry/{entry_id}/attachment")
async def upload_attachment(
    entry_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an attachment (e.g. annotated PDF, editorial letter) to a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    storage = _storage_dir(entry.paper_id)
    safe_name = f"reviewer_{entry_id}_{file.filename or 'attachment.pdf'}"
    out_path = storage / safe_name
    content = await file.read()
    out_path.write_bytes(content)
    entry.attachment_path = str(out_path)
    await db.commit()
    return {"path": str(out_path), "size_kb": round(len(content) / 1024)}


@router.get("/entry/{entry_id}/attachment")
async def get_attachment(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the attachment for a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry or not entry.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    file_path = Path(entry.attachment_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found on disk")

    # Serve PDFs inline (opens in browser), other files as download
    suffix = file_path.suffix.lower()
    media_types = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
                   ".jpeg": "image/jpeg", ".txt": "text/plain", ".md": "text/markdown"}
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=media_type,
    )


# --- Note status change ---

class NoteStatusRequest(BaseModel):
    status: str  # read | replied | acknowledged
    response_text: str | None = None  # for "replied" status


@router.put("/entry/{entry_id}/status")
async def update_note_status(
    entry_id: int,
    body: NoteStatusRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the notification status of a tutor note entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.source_type != "tutor_feedback":
        raise HTTPException(status_code=400, detail="Status only applies to tutor feedback entries")

    old_status = entry.note_status
    entry.note_status = body.status

    if body.status == "read" and not entry.read_at:
        from datetime import datetime
        entry.read_at = datetime.utcnow()

    # If replying, add the response as an observation
    if body.status == "replied" and body.response_text:
        items = entry.items
        items.append({
            "text": body.response_text,
            "section_ref": None,
            "severity": "suggestion",
            "status": "addressed",
            "response": f"Reply from {user.username}",
        })
        entry.items = items

    await db.commit()
    logger.info(f"Note status updated: entry={entry_id}, {old_status} -> {body.status} by {user.username}")

    # Send notification email
    _send_status_change_email(entry, user.username, old_status, body.status, body.response_text)

    return _serialize(entry)


# --- Email helpers ---

def _send_tutor_note_email(from_user: str, paper_id: int, note_text: str, addressed_to: list[str], db):
    """Send email to addressed users when a tutor note is created."""
    import threading
    try:
        from app.config import settings
        if not settings.smtp_user or not settings.smtp_app_password:
            return

        import smtplib
        from email.mime.text import MIMEText

        # Fetch email addresses for addressed users
        import sqlite3
        conn = sqlite3.connect(str(Path(settings.database_url.replace("sqlite+aiosqlite:///", ""))))
        recipients = []
        for username in addressed_to:
            row = conn.execute("SELECT email FROM users WHERE username = ? AND is_active = 1", (username,)).fetchone()
            if row and row[0]:
                recipients.append(row[0])
        # Also notify admin email
        if settings.notify_email and settings.notify_email not in recipients:
            recipients.append(settings.notify_email)
        conn.close()

        if not recipients:
            return

        from datetime import datetime
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"📝 [RESerch Monitor] New Tutor Note from {from_user}"
        body = (
            f"New Tutor Note\n\n"
            f"From:       {from_user}\n"
            f"Paper ID:   {paper_id}\n"
            f"Time:       {now}\n"
            f"Addressed:  {', '.join(addressed_to) if addressed_to else 'all'}\n"
            f"\n--- Note ---\n{note_text or '(no text)'}\n\n"
            f"View: https://resmon.fabioliberti.com/my-manuscripts/{paper_id}\n"
        )

        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user

        def send():
            try:
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
                    server.login(settings.smtp_user, settings.smtp_app_password)
                    for rcpt in recipients:
                        msg.replace_header("To", rcpt) if "To" in msg else msg.__setitem__("To", rcpt)
                        server.send_message(msg)
            except Exception as e:
                logger.warning(f"Tutor note email failed: {e}")

        threading.Thread(target=send, daemon=True).start()
    except Exception as e:
        logger.warning(f"Tutor note email setup failed: {e}")


def _send_status_change_email(entry: ReviewerEntry, changed_by: str, old_status: str | None, new_status: str, response_text: str | None = None):
    """Send email when note status changes."""
    import threading
    try:
        from app.config import settings
        if not settings.smtp_user or not settings.smtp_app_password:
            return

        import smtplib
        from email.mime.text import MIMEText
        import sqlite3

        # Notify the note author + addressed users
        conn = sqlite3.connect(str(Path(settings.database_url.replace("sqlite+aiosqlite:///", ""))))
        recipients = set()

        # Author of the note
        # reviewer_label is the author name — find their email
        row = conn.execute("SELECT email FROM users WHERE username = ? AND is_active = 1", (entry.reviewer_label,)).fetchone()
        if row and row[0]:
            recipients.add(row[0])

        # Addressed users
        for username in entry.addressed_to:
            row = conn.execute("SELECT email FROM users WHERE username = ? AND is_active = 1", (username,)).fetchone()
            if row and row[0]:
                recipients.add(row[0])

        # Admin
        if settings.notify_email:
            recipients.add(settings.notify_email)
        conn.close()

        if not recipients:
            return

        from datetime import datetime
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        status_labels = {"read": "Read", "replied": "Replied", "acknowledged": "Acknowledged"}
        icon = {"read": "👁", "replied": "💬", "acknowledged": "✅"}.get(new_status, "📌")

        subject = f"{icon} [RESerch Monitor] Note {status_labels.get(new_status, new_status)} by {changed_by}"
        body = (
            f"Note Status Update\n\n"
            f"Changed by: {changed_by}\n"
            f"Status:     {old_status or 'new'} → {new_status}\n"
            f"Time:       {now}\n"
            f"Note by:    {entry.reviewer_label}\n"
            f"Paper ID:   {entry.paper_id}\n"
        )
        if response_text:
            body += f"\n--- Reply ---\n{response_text}\n"
        body += f"\nView: https://resmon.fabioliberti.com/my-manuscripts/{entry.paper_id}\n"

        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user

        def send():
            try:
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
                    server.login(settings.smtp_user, settings.smtp_app_password)
                    for rcpt in recipients:
                        del msg["To"]
                        msg["To"] = rcpt
                        server.send_message(msg)
            except Exception as e:
                logger.warning(f"Status change email failed: {e}")

        threading.Thread(target=send, daemon=True).start()
    except Exception as e:
        logger.warning(f"Status change email setup failed: {e}")
