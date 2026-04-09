"""
Push Notification Service using Expo Push API
"""

import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    db,
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None
) -> bool:
    """
    Send a push notification to a user via Expo Push API.
    
    Args:
        db: MongoDB database instance
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body text
        data: Optional additional data to send with notification
        
    Returns:
        bool: True if notification was sent successfully, False otherwise
    """
    try:
        # Get user's push token
        user = await db.users.find_one({"_id": user_id})
        if not user or not user.get("push_token"):
            logger.warning(f"No push token found for user {user_id}")
            return False
        
        push_token = user["push_token"]
        
        # Prepare notification payload
        message = {
            "to": push_token,
            "title": title,
            "body": body,
            "sound": None,  # Silent by default for Koan
            "priority": "default",
            "badge": 0,
        }
        
        if data:
            message["data"] = data
        
        # Send to Expo Push API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("data", {}).get("status") == "ok":
                    logger.info(f"Push notification sent successfully to user {user_id}")
                    return True
                else:
                    error = result.get("data", {}).get("message", "Unknown error")
                    logger.error(f"Expo push notification failed for user {user_id}: {error}")
                    return False
            else:
                logger.error(f"Expo push API returned status {response.status_code}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send push notification to user {user_id}: {e}")
        return False


async def send_nudge_push(db, user_id: str, nudge_message: str, nudge_id: str = "") -> bool:
    """
    Send a nudge as a push notification.

    Args:
        db: MongoDB database instance
        user_id: User ID
        nudge_message: The nudge text to send
        nudge_id: Optional nudge ID included in the data payload so the
                  frontend tap handler can mark the nudge as opened.
                  If empty string, the nudgeId key is omitted (graceful fallback).

    Returns:
        bool: Success status
    """
    data: dict = {"type": "nudge"}
    if nudge_id:
        data["nudgeId"] = nudge_id
    return await send_push_notification(
        db=db,
        user_id=user_id,
        title="Koan",
        body=nudge_message,
        data=data,
    )
