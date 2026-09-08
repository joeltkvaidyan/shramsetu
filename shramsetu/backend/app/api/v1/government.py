"""
Government dashboard API — strict data isolation enforced.
Government officials can:
  - View aggregated worker statistics (no PII)
  - Manage grievances (view, comment, update status)
  - Send push notifications to workers
  - View audit logs (superadmin only)

Government officials CANNOT:
  - Access worker Aadhaar, address, or personal details (except in grievance context)
  - Access worker documents
  - Access worker chat history
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import func, select

from app.api.deps import CurrentGovernmentUser, SessionDep, SuperadminUser
from app.models.audit import AuditLog
from app.models.grievance import Grievance, GrievanceCategory, GrievanceStatus
from app.models.grievance_extras import GrievanceComment, GrievanceStatusLog
from app.models.government import GovernmentUser
from app.models.notification import PushNotification, WorkerNotification, NotificationTarget
from app.models.user import User
from app.schemas.government import (
    DashboardStats,
    GrievanceAssignRequest,
    GrievanceCommentRequest,
    GrievanceStatusUpdateRequest,
    GovernmentPublic,
    NotificationPublic,
    NotificationSendRequest,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/government", tags=["Government Dashboard"])


# ── Dashboard ───────────────────────────────────────────────────────

@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(
    session: SessionDep,
    current_user: CurrentGovernmentUser,
):
    """Aggregated statistics — no worker PII exposed."""
    total_workers = session.exec(select(func.count(User.id))).one()
    active_workers = session.exec(
        select(func.count(User.id)).where(User.is_active == True)
    ).one()
    total_grievances = session.exec(select(func.count(Grievance.id))).one()
    open_grievances = session.exec(
        select(func.count(Grievance.id)).where(
            Grievance.status.in_(["submitted", "under_review"])
        )
    ).one()
    resolved_grievances = session.exec(
        select(func.count(Grievance.id)).where(Grievance.status == "resolved")
    ).one()

    # Grievances by category
    cat_rows = session.exec(
        select(Grievance.category, func.count(Grievance.id)).group_by(Grievance.category)
    ).all()
    grievances_by_category = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in cat_rows}

    # Grievances by status
    status_rows = session.exec(
        select(Grievance.status, func.count(Grievance.id)).group_by(Grievance.status)
    ).all()
    grievances_by_status = {row[0].value if hasattr(row[0], "value") else str(row[0]): row[1] for row in status_rows}

    # Recent filings (last 10, no worker PII)
    recent = session.exec(
        select(Grievance).order_by(Grievance.created_at.desc()).limit(10)
    ).all()
    recent_filings = [
        {
            "id": g.id,
            "complaint_number": g.complaint_number,
            "category": g.category.value if hasattr(g.category, "value") else g.category,
            "subject": g.subject,
            "status": g.status.value if hasattr(g.status, "value") else g.status,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in recent
    ]

    # Workers by state
    state_rows = session.exec(
        select(User.current_state, func.count(User.id))
        .where(User.current_state.is_not(None))
        .group_by(User.current_state)
    ).all()
    workers_by_state = {row[0]: row[1] for row in state_rows if row[0]}

    return DashboardStats(
        total_workers=total_workers,
        active_workers=active_workers,
        total_grievances=total_grievances,
        open_grievances=open_grievances,
        resolved_grievances=resolved_grievances,
        urgent_grievances=0,
        grievances_by_category=grievances_by_category,
        grievances_by_status=grievances_by_status,
        recent_filings=recent_filings,
        workers_by_state=workers_by_state,
    )


# ── Workers (anonymized list — no Aadhaar, no address) ──────────────

@router.get("/workers")
def list_workers(
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    state: Optional[str] = None,
    district: Optional[str] = None,
    occupation: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List workers with anonymized data.
    Government sees: name, worker_id, state, district, occupation, status.
    Government does NOT see: Aadhaar, address, phone, email, emergency contacts.
    """
    query = select(User)

    if state:
        query = query.where(User.current_state == state)
    if district:
        query = query.where(User.current_district == district)
    if occupation:
        query = query.where(User.occupation == occupation)
    if status_filter == "active":
        query = query.where(User.is_active == True)
    elif status_filter == "inactive":
        query = query.where(User.is_active == False)
    if search:
        query = query.where(User.full_name.contains(search))

    workers = session.exec(query.offset(offset).limit(limit)).all()
    total = len(workers)  # Simplified count

    # Anonymize — only expose what government needs
    return {
        "total": total,
        "workers": [
            {
                "id": w.id,
                "worker_id": w.worker_id,
                "full_name": w.full_name,
                "occupation": w.occupation.value if hasattr(w.occupation, "value") else w.occupation,
                "current_state": w.current_state,
                "current_district": w.current_district,
                "is_active": w.is_active,
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in workers
        ],
    }


# ── Grievance management ────────────────────────────────────────────

@router.get("/grievances")
def list_all_grievances(
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List all grievances across all workers — government view."""
    query = select(Grievance)

    if status_filter:
        query = query.where(Grievance.status == status_filter)
    if category:
        query = query.where(Grievance.category == category)
    if state:
        # Join with User to filter by worker state
        query = query.join(User, Grievance.owner_id == User.id).where(User.current_state == state)

    grievances = session.exec(
        query.order_by(Grievance.created_at.desc()).offset(offset).limit(limit)
    ).all()
    total = len(grievances)  # Simplified count

    return {
        "total": total,
        "grievances": [
            {
                "id": g.id,
                "complaint_number": g.complaint_number,
                "category": g.category.value if hasattr(g.category, "value") else g.category,
                "subject": g.subject,
                "description": g.description,
                "status": g.status.value if hasattr(g.status, "value") else g.status,
                "employer_name": g.employer_name,
                "incident_location": g.incident_location,
                "incident_date": g.incident_date.isoformat() if g.incident_date else None,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "updated_at": g.updated_at.isoformat() if g.updated_at else None,
                "resolved_at": g.resolved_at.isoformat() if g.resolved_at else None,
            }
            for g in grievances
        ],
    }


@router.get("/grievances/{grievance_id}")
def get_grievance_detail(
    grievance_id: int,
    session: SessionDep,
    current_user: CurrentGovernmentUser,
):
    """Get full grievance detail including comments and timeline."""
    grievance = session.get(Grievance, grievance_id)
    if not grievance:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")

    # Get worker info (anonymized)
    worker = session.get(User, grievance.owner_id)

    # Get comments
    comments = session.exec(
        select(GrievanceComment).where(GrievanceComment.grievance_id == grievance_id)
    ).all()

    # Get timeline
    timeline = session.exec(
        select(GrievanceStatusLog).where(GrievanceStatusLog.grievance_id == grievance_id)
        .order_by(GrievanceStatusLog.created_at)
    ).all()

    return {
        "id": grievance.id,
        "complaint_number": grievance.complaint_number,
        "category": grievance.category.value if hasattr(grievance.category, "value") else grievance.category,
        "subject": grievance.subject,
        "description": grievance.description,
        "status": grievance.status.value if hasattr(grievance.status, "value") else grievance.status,
        "employer_name": grievance.employer_name,
        "incident_location": grievance.incident_location,
        "incident_date": grievance.incident_date.isoformat() if grievance.incident_date else None,
        "created_at": grievance.created_at.isoformat() if grievance.created_at else None,
        "worker": {
            "worker_id": worker.worker_id if worker else None,
            "full_name": worker.full_name if worker else None,
            "occupation": worker.occupation.value if worker and worker.occupation else None,
            "current_state": worker.current_state if worker else None,
            "current_district": worker.current_district if worker else None,
        },
        "comments": [
            {
                "id": c.id,
                "author_name": c.author_name,
                "author_role": c.author_role,
                "content": c.content,
                "is_internal": c.is_internal if hasattr(c, "is_internal") else False,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comments
        ],
        "timeline": [
            {
                "status": t.status,
                "note": t.note,
                "changed_by": t.changed_by,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in timeline
        ],
    }


@router.post("/grievances/{grievance_id}/comment")
def add_comment(
    grievance_id: int,
    payload: GrievanceCommentRequest,
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    request: Request,
):
    """Add a comment to a grievance (government official)."""
    grievance = session.get(Grievance, grievance_id)
    if not grievance:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")

    comment = GrievanceComment(
        grievance_id=grievance_id,
        author_name=current_user.full_name,
        author_role="government",
        content=payload.content,
        is_internal=payload.is_internal,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)

    log_audit(
        session,
        actor_id=current_user.id,
        actor_role="government",
        actor_identifier=current_user.employee_id,
        action="add_grievance_comment",
        resource_type="grievance",
        resource_id=grievance_id,
        ip_address=request.client.host if request.client else None,
        details={"is_internal": payload.is_internal},
    )

    return {
        "id": comment.id,
        "author_name": comment.author_name,
        "author_role": comment.author_role,
        "content": comment.content,
        "is_internal": comment.is_internal,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.post("/grievances/{grievance_id}/status")
def update_status(
    grievance_id: int,
    payload: GrievanceStatusUpdateRequest,
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    request: Request,
):
    """Update grievance status (government official)."""
    grievance = session.get(Grievance, grievance_id)
    if not grievance:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")

    old_status = grievance.status.value if hasattr(grievance.status, "value") else grievance.status
    grievance.status = payload.status
    grievance.updated_at = datetime.now(timezone.utc)
    if payload.status == "resolved":
        grievance.resolved_at = datetime.now(timezone.utc)

    # Add timeline entry
    log_entry = GrievanceStatusLog(
        grievance_id=grievance_id,
        status=payload.status,
        note=payload.note,
        changed_by=f"{current_user.full_name} ({current_user.employee_id})",
    )
    session.add(log_entry)
    session.commit()

    log_audit(
        session,
        actor_id=current_user.id,
        actor_role="government",
        actor_identifier=current_user.employee_id,
        action="update_grievance_status",
        resource_type="grievance",
        resource_id=grievance_id,
        ip_address=request.client.host if request.client else None,
        details={"old_status": old_status, "new_status": payload.status},
    )

    return {"detail": "Status updated", "old_status": old_status, "new_status": payload.status}


@router.post("/grievances/{grievance_id}/assign")
def assign_grievance(
    grievance_id: int,
    payload: GrievanceAssignRequest,
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    request: Request,
):
    """Assign a grievance to an officer."""
    grievance = session.get(Grievance, grievance_id)
    if not grievance:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")

    log_entry = GrievanceStatusLog(
        grievance_id=grievance_id,
        status="under_review",
        note=f"Assigned to {payload.assignee_name}" + (f" ({payload.assignee_department})" if payload.assignee_department else ""),
        changed_by=f"{current_user.full_name} ({current_user.employee_id})",
    )
    session.add(log_entry)
    session.commit()

    log_audit(
        session,
        actor_id=current_user.id,
        actor_role="government",
        actor_identifier=current_user.employee_id,
        action="assign_grievance",
        resource_type="grievance",
        resource_id=grievance_id,
        ip_address=request.client.host if request.client else None,
        details={"assignee": payload.assignee_name, "department": payload.assignee_department},
    )

    return {"detail": f"Grievance assigned to {payload.assignee_name}"}


# ── Push notifications ──────────────────────────────────────────────

@router.post("/notifications/send", status_code=status.HTTP_201_CREATED)
def send_notification(
    payload: NotificationSendRequest,
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    request: Request,
):
    """Send push notification to workers."""
    # Create notification record
    notification = PushNotification(
        title=payload.title,
        body=payload.body,
        priority=payload.priority,
        target=payload.target,
        target_value=payload.target_value,
        sender_id=current_user.id,
        sender_name=current_user.full_name,
        department=current_user.department.value if current_user.department else "general",
        is_broadcast=payload.is_broadcast,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)

    # Create per-worker notification records based on target
    target_query = select(User).where(User.is_active == True)

    if payload.target == "by_state" and payload.target_value:
        target_query = target_query.where(User.current_state == payload.target_value)
    elif payload.target == "by_district" and payload.target_value:
        target_query = target_query.where(User.current_district == payload.target_value)
    elif payload.target == "by_occupation" and payload.target_value:
        target_query = target_query.where(User.occupation == payload.target_value)
    elif payload.target == "specific_workers" and payload.target_value:
        worker_ids = [int(x.strip()) for x in payload.target_value.split(",") if x.strip().isdigit()]
        target_query = target_query.where(User.id.in_(worker_ids))

    workers = session.exec(target_query).all()
    sent_count = 0

    for worker in workers:
        wn = WorkerNotification(
            notification_id=notification.id,
            worker_id=worker.id,
        )
        session.add(wn)
        sent_count += 1

    session.commit()

    log_audit(
        session,
        actor_id=current_user.id,
        actor_role="government",
        actor_identifier=current_user.employee_id,
        action="send_notification",
        resource_type="notification",
        resource_id=notification.id,
        ip_address=request.client.host if request.client else None,
        details={"target": payload.target, "sent_count": sent_count},
    )

    return {
        "detail": f"Notification sent to {sent_count} workers",
        "notification_id": notification.id,
        "sent_count": sent_count,
    }


@router.get("/notifications")
def list_notifications(
    session: SessionDep,
    current_user: CurrentGovernmentUser,
    limit: int = 50,
    offset: int = 0,
):
    """List all notifications sent by this department."""
    query = select(PushNotification).where(
        PushNotification.department == (current_user.department.value if current_user.department else "general")
    )
    if current_user.is_superadmin:
        query = select(PushNotification)  # superadmin sees all

    notifications = session.exec(
        query.order_by(PushNotification.created_at.desc()).offset(offset).limit(limit)
    ).all()

    return {
        "notifications": [
            NotificationPublic.model_validate(n).model_dump()
            for n in notifications
        ],
    }


# ── Audit logs (superadmin only) ────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    session: SessionDep,
    current_user: SuperadminUser,
    actor_role: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """View audit logs (superadmin only)."""
    query = select(AuditLog)

    if actor_role:
        query = query.where(AuditLog.actor_role == actor_role)
    if action:
        query = query.where(AuditLog.action == action)

    logs = session.exec(
        query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    ).all()

    return {
        "logs": [
            {
                "id": l.id,
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "actor_role": l.actor_role,
                "actor_identifier": l.actor_identifier,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "ip_address": l.ip_address,
                "success": l.success,
                "failure_reason": l.failure_reason,
            }
            for l in logs
        ],
    }
