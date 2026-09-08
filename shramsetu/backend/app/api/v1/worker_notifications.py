"""Worker-facing notification endpoints — lets workers see notifications sent by government."""
from typing import List

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models.notification import PushNotification, WorkerNotification

router = APIRouter(prefix="/notifications", tags=["Worker Notifications"])


@router.get("/my")
def get_my_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    unread_only: bool = False,
    limit: int = 50,
):
    """Get notifications for the current worker."""
    # First try to find WorkerNotification records for this worker
    query = (
        select(WorkerNotification)
        .where(WorkerNotification.worker_id == current_user.id)
        .order_by(WorkerNotification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        query = query.where(WorkerNotification.is_read == False)

    worker_notifs = session.exec(query).all()

    results = []
    for wn in worker_notifs:
        notification = session.get(PushNotification, wn.notification_id)
        if notification:
            results.append({
                "id": notification.id,
                "worker_notification_id": wn.id,
                "title": notification.title,
                "body": notification.body,
                "priority": notification.priority.value if hasattr(notification.priority, "value") else notification.priority,
                "sender_name": notification.sender_name,
                "department": notification.department,
                "is_broadcast": notification.is_broadcast,
                "is_read": wn.is_read,
                "read_at": wn.read_at.isoformat() if wn.read_at else None,
                "created_at": notification.created_at.isoformat() if notification.created_at else None,
            })

    # Also include broadcast notifications targeted at all workers
    # that don't have a WorkerNotification record yet
    all_broadcast = session.exec(
        select(PushNotification)
        .where(PushNotification.target == "all")
        .order_by(PushNotification.created_at.desc())
        .limit(limit)
    ).all()

    existing_notif_ids = {r["id"] for r in results}
    for n in all_broadcast:
        if n.id not in existing_notif_ids:
            results.append({
                "id": n.id,
                "worker_notification_id": None,
                "title": n.title,
                "body": n.body,
                "priority": n.priority.value if hasattr(n.priority, "value") else n.priority,
                "sender_name": n.sender_name,
                "department": n.department,
                "is_broadcast": n.is_broadcast,
                "is_read": False,
                "read_at": None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            })

    # Sort by created_at descending
    results.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"notifications": results[:limit]}


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    session: SessionDep,
    current_user: CurrentUser,
):
    """Mark a notification as read for the current worker."""
    from datetime import datetime, timezone

    wn = session.exec(
        select(WorkerNotification).where(
            WorkerNotification.notification_id == notification_id,
            WorkerNotification.worker_id == current_user.id,
        )
    ).first()

    if wn:
        wn.is_read = True
        wn.read_at = datetime.now(timezone.utc)
        session.add(wn)
        session.commit()
    # If no WorkerNotification record exists, create one (for broadcasts)
    else:
        wn = WorkerNotification(
            notification_id=notification_id,
            worker_id=current_user.id,
            is_read=True,
            read_at=datetime.now(timezone.utc),
        )
        session.add(wn)
        session.commit()

    return {"status": "ok"}


@router.get("/unread-count")
def unread_count(
    session: SessionDep,
    current_user: CurrentUser,
):
    """Get count of unread notifications."""
    from sqlmodel import func

    # Count unread WorkerNotification records
    count = session.exec(
        select(func.count(WorkerNotification.id)).where(
            WorkerNotification.worker_id == current_user.id,
            WorkerNotification.is_read == False,
        )
    ).one()

    # Also count broadcast notifications that haven't been read
    read_notifs = session.exec(
        select(WorkerNotification.notification_id).where(
            WorkerNotification.worker_id == current_user.id,
            WorkerNotification.is_read == True,
        )
    ).all()

    broadcast_count = session.exec(
        select(func.count(PushNotification.id)).where(
            PushNotification.target == "all",
        )
    ).one()

    total_unread = count + max(0, broadcast_count - len(read_notifs))

    return {"unread_count": total_unread}
