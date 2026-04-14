"""Email notification service for login events."""

import logging
import smtplib
from datetime import datetime
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_login_notification(username: str, ip: str, user_agent: str = ""):
    """Send email notification when a user logs in. Non-blocking: logs errors but never raises."""
    if not settings.smtp_user or not settings.smtp_app_password or not settings.notify_email:
        logger.debug("Email notifications not configured, skipping")
        return

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"[RESerch Monitor] Login: {username}"
    body = (
        f"User login detected on RESerch Monitor\n\n"
        f"User:       {username}\n"
        f"Time:       {now}\n"
        f"IP:         {ip}\n"
        f"User-Agent: {user_agent or 'unknown'}\n"
        f"Server:     {settings.app_env}\n"
    )

    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user
    msg["To"] = settings.notify_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(settings.smtp_user, settings.smtp_app_password)
            server.send_message(msg)
        logger.info(f"Login notification sent for {username} to {settings.notify_email}")
    except Exception as e:
        logger.warning(f"Failed to send login notification: {e}")
