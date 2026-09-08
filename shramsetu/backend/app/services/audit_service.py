"""
Audit logging service — immutable trail of every sensitive operation.
Logs to database for compliance and incident response.
"""
import json
import logging
from typing import Optional

from app.models.audit import AuditLog

logger = logging.getLogger("shramsetu.audit")


def log_audit(
    session,
    actor_id: Optional[int],
    actor_role: str,
    actor_identifier: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict] = None,
    success: bool = True,
    failure_reason: Optional[str] = None,
):
    """Append an audit log entry. Never fails — logging errors are swallowed."""
    try:
        entry = AuditLog(
            actor_id=actor_id,
            actor_role=actor_role,
            actor_identifier=actor_identifier,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            ip_address=ip_address,
            user_agent=user_agent,
            details=json.dumps(details) if details else None,
            success=success,
            failure_reason=failure_reason,
        )
        session.add(entry)
        session.commit()
        logger.info(
            "[AUDIT] %s %s %s -> %s (success=%s)",
            actor_role, actor_identifier, action, resource_type, success,
        )
    except Exception:
        logger.exception("Failed to write audit log")
