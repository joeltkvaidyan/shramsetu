"""
Push notification service using Firebase Cloud Messaging (FCM).
Sends push notifications for grievance status changes, scheme deadlines, etc.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("shramsetu.notifications")

# Firebase FCM v1 API base URL
FCM_V1_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"


async def _get_access_token() -> Optional[str]:
    """Get Firebase access token using service account credentials."""
    # In production, use firebase-admin SDK or Google OAuth2
    # For now, use the server key directly for legacy FCM API
    if settings.FCM_SERVER_KEY:
        return settings.FCM_SERVER_KEY
    return None


async def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    notification_type: str = "general",
) -> bool:
    """Send a push notification to a device.
    
    Args:
        token: FCM device token
        title: Notification title
        body: Notification body
        data: Optional data payload
        notification_type: Type of notification (grievance_update, scheme_alert, etc.)
    
    Returns:
        True if sent successfully, False otherwise
    """
    if not settings.FCM_SERVER_KEY and not settings.FCM_PROJECT_ID:
        logger.warning("FCM not configured — push notification skipped")
        return False

    try:
        # Use legacy FCM API for simplicity (works with server key)
        headers = {
            "Authorization": f"key={settings.FCM_SERVER_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "to": token,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": {
                "type": notification_type,
                **(data or {}),
            },
            "priority": "high",
            "notification_channel_id": notification_type,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://fcm.googleapis.com/fcm/send",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            result = response.json()

            if result.get("success") == 1:
                logger.info("Push notification sent to %s", token[:20])
                return True
            else:
                logger.warning("FCM delivery failed: %s", result)
                return False

    except Exception as e:
        logger.error("Push notification error: %s", e)
        return False


async def send_grievance_update(
    token: str,
    grievance_number: str,
    status: str,
    worker_name: str,
) -> bool:
    """Send notification for grievance status change."""
    status_messages = {
        "under_review": "Your grievance is now under review",
        "investigating": "Your grievance is being investigated",
        "resolved": "Your grievance has been resolved!",
        "escalated": "Your grievance has been escalated to higher authority",
    }

    title = f"Grievance {grievance_number} Update"
    body = status_messages.get(status, f"Status changed to {status}")

    return await send_push_notification(
        token=token,
        title=title,
        body=body,
        data={
            "grievance_number": grievance_number,
            "status": status,
            "worker_name": worker_name,
        },
        notification_type="grievance_update",
    )


async def send_scheme_alert(
    token: str,
    scheme_name: str,
    deadline: str,
    description: str,
) -> bool:
    """Send notification for upcoming scheme deadline."""
    title = f"⏰ {scheme_name} Deadline"
    body = f"Apply before {deadline}: {description}"

    return await send_push_notification(
        token=token,
        title=title,
        body=body,
        data={
            "scheme_name": scheme_name,
            "deadline": deadline,
        },
        notification_type="scheme_alert",
    )

# ────── Authority notification (email / console) ──────
# Filed grievances are forwarded to the relevant government authority
# (Labour Department, and Police for criminal-natured categories). Defaults
# to logging so the whole flow is testable with zero external accounts.
# Set SMTP_* in .env to send real email.

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.models.grievance import Grievance
from app.models.user import User

AUTHORITY_EMAILS = {
    "labour": lambda: settings.LABOUR_DEPARTMENT_EMAIL,
    "police": lambda: settings.POLICE_DEPARTMENT_EMAIL,
}
AUTHORITY_LABELS = {"labour": "Labour Department", "police": "Police Department"}


class EmailProvider:
    def send(self, to_email: str, subject: str, body: str) -> bool:
        """Returns True if the send succeeded (or was accepted for delivery)."""


class ConsoleEmailProvider(EmailProvider):
    """Default free provider: logs the email instead of sending it."""

    def send(self, to_email: str, subject: str, body: str) -> bool:
        logger.info("[DEV EMAIL to %s] Subject: %s\n%s", to_email, subject, body)
        return True


class SMTPEmailProvider(EmailProvider):
    """Real provider - works with any SMTP mailbox (e.g. Gmail + App Password)."""

    def send(self, to_email: str, subject: str, body: str) -> bool:
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.SMTP_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USERNAME:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())
            return True
        except Exception:
            logger.exception("Failed to send email to %s via SMTP", to_email)
            return False


def get_email_provider() -> EmailProvider:
    if settings.SMTP_HOST:
        return SMTPEmailProvider()
    return ConsoleEmailProvider()


def _compose_email(grievance: Grievance, worker: User) -> tuple[str, str]:
    cat = grievance.category.value.replace('_', ' ').title()
    subject = f"[ShramSetu] New Grievance {grievance.complaint_number} - {cat}"
    lines = [
        "A new grievance has been filed on the ShramSetu platform and requires review.",
        "",
        f"Complaint Number: {grievance.complaint_number}",
        f"Category: {cat}",
        f"Subject: {grievance.subject}",
        "",
        "Description:",
        f"{grievance.description}",
        "",
        f"Filed by: {worker.full_name} (Worker ID: {worker.worker_id})",
        f"Mobile: {worker.mobile_number}",
        f"Current location: {worker.current_village_or_city or '-'}, {worker.current_district or '-'}, {worker.current_state or '-'}",
    ]
    lines += [
        f"Employer named: {grievance.employer_name or '-'}",
        f"Incident location: {grievance.incident_location or '-'}",
    ]
    if grievance.incident_date:
        lines.append(f"Incident date: {grievance.incident_date.strftime('%Y-%m-%d')}")
    lines.append("")
    lines.append("This is an automated notification from ShramSetu. Please follow up through")
    lines.append("your standard case-handling process using the complaint number above.")
    body = chr(10).join(lines)
    return subject, body


def notify_authorities(grievance: Grievance, worker: User) -> list[str]:
    """Sends the grievance to whichever authorities its category maps to.
    Returns the list of authority labels successfully notified (used to log
    a transparent status-log entry the worker can see)."""
    if not settings.NOTIFY_AUTHORITIES_ENABLED:
        return []

    authority_keys = settings.GRIEVANCE_AUTHORITY_ROUTING.get(grievance.category.value, ["labour"])
    provider = get_email_provider()
    subject, body = _compose_email(grievance, worker)

    notified: list[str] = []
    for key in authority_keys:
        email_fn = AUTHORITY_EMAILS.get(key)
        if not email_fn:
            continue
        to_email = email_fn()
        if provider.send(to_email, subject, body):
            notified.append(AUTHORITY_LABELS.get(key, key))
    return notified
