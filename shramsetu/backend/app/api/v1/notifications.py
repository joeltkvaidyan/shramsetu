"""
Push notification endpoints for FCM token registration and management.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Push Notifications"])


class RegisterTokenRequest(BaseModel):
    token: str
    platform: str = "web"  # web, android, ios


class SendNotificationRequest(BaseModel):
    user_id: int
    title: str
    body: str
    notification_type: str = "general"
    data: Optional[dict] = None


# In-memory store for FCM tokens (in production, store in database)
_fcm_tokens: dict[int, list[str]] = {}


@router.post("/register")
async def register_fcm_token(
    req: RegisterTokenRequest,
    current_user: CurrentUser,
):
    """Register a device for push notifications."""
    user_id = current_user.id
    if user_id not in _fcm_tokens:
        _fcm_tokens[user_id] = []

    if req.token not in _fcm_tokens[user_id]:
        _fcm_tokens[user_id].append(req.token)

    return {"status": "registered", "device_count": len(_fcm_tokens[user_id])}


@router.delete("/unregister")
async def unregister_fcm_token(
    token: str,
    current_user: CurrentUser,
):
    """Unregister a device from push notifications."""
    user_id = current_user.id
    if user_id in _fcm_tokens:
        _fcm_tokens[user_id] = [t for t in _fcm_tokens[user_id] if t != token]
    return {"status": "unregistered"}


@router.get("/tokens")
async def get_user_tokens(current_user: CurrentUser):
    """Get all registered FCM tokens for the current user."""
    tokens = _fcm_tokens.get(current_user.id, [])
    return {"tokens": tokens, "count": len(tokens)}


@router.post("/send")
async def send_notification_to_user(
    req: SendNotificationRequest,
    current_user: CurrentUser,
):
    """Send a push notification to a specific user (admin only in production)."""
    user_tokens = _fcm_tokens.get(req.user_id, [])
    if not user_tokens:
        return {"status": "no_devices", "sent": 0}

    sent = 0
    for token in user_tokens:
        success = await notification_service.send_push_notification(
            token=token,
            title=req.title,
            body=req.body,
            data=req.data,
            notification_type=req.notification_type,
        )
        if success:
            sent += 1

    return {"status": "sent", "sent": sent, "total": len(user_tokens)}
