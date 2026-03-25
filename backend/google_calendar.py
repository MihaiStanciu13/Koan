"""
Google Calendar Integration
Handles OAuth and fetches calendar events for meeting-based nudges
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import httpx

logger = logging.getLogger(__name__)

GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"


async def fetch_calendar_events(access_token: str, days_ahead: int = 1) -> Dict:
    """
    Fetch calendar events from Google Calendar API.
    
    Args:
        access_token: Google OAuth access token
        days_ahead: Number of days ahead to fetch (default 1 for today + tomorrow)
        
    Returns:
        Dict with meeting_count, back_to_back_pairs, next_meeting_time
    """
    try:
        now = datetime.utcnow()
        time_min = now.isoformat() + 'Z'
        time_max = (now + timedelta(days=days_ahead)).isoformat() + 'Z'
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
        }
        
        params = {
            'timeMin': time_min,
            'timeMax': time_max,
            'singleEvents': True,
            'orderBy': 'startTime',
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API_URL}/calendars/primary/events",
                headers=headers,
                params=params,
                timeout=10.0
            )
            
            if response.status_code != 200:
                logger.error(f"Google Calendar API error: {response.status_code}")
                return {"meeting_count": 0, "back_to_back_pairs": 0, "next_meeting_time": None}
            
            data = response.json()
            events = data.get('items', [])
            
            # Filter for actual meetings (not all-day events, has attendees or conferencing)
            meetings = [
                e for e in events
                if not e.get('start', {}).get('date')  # Not all-day
                and (e.get('attendees') or e.get('conferenceData'))  # Has attendees or video link
            ]
            
            meeting_count = len(meetings)
            back_to_back_pairs = count_back_to_back_meetings(meetings)
            next_meeting_time = get_next_meeting_time(meetings)
            
            return {
                "meeting_count": meeting_count,
                "back_to_back_pairs": back_to_back_pairs,
                "next_meeting_time": next_meeting_time,
            }
            
    except Exception as e:
        logger.error(f"Failed to fetch calendar events: {e}")
        return {"meeting_count": 0, "back_to_back_pairs": 0, "next_meeting_time": None}


def count_back_to_back_meetings(meetings: List[Dict]) -> int:
    """Count pairs of back-to-back meetings (no break between)."""
    if len(meetings) < 2:
        return 0
    
    back_to_back = 0
    for i in range(len(meetings) - 1):
        current_end = meetings[i].get('end', {}).get('dateTime')
        next_start = meetings[i + 1].get('start', {}).get('dateTime')
        
        if current_end and next_start:
            try:
                end_time = datetime.fromisoformat(current_end.replace('Z', '+00:00'))
                start_time = datetime.fromisoformat(next_start.replace('Z', '+00:00'))
                
                # Consider back-to-back if less than 5 minutes between
                gap = (start_time - end_time).total_seconds() / 60
                if gap < 5:
                    back_to_back += 1
            except Exception:
                continue
    
    return back_to_back


def get_next_meeting_time(meetings: List[Dict]) -> Optional[str]:
    """Get the start time of the next meeting."""
    if not meetings:
        return None
    
    now = datetime.utcnow()
    for meeting in meetings:
        start_time_str = meeting.get('start', {}).get('dateTime')
        if start_time_str:
            try:
                start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                if start_time > now:
                    return start_time_str
            except Exception:
                continue
    
    return None


async def refresh_access_token(refresh_token: str, client_id: str, client_secret: str) -> Optional[str]:
    """
    Refresh Google OAuth access token.
    
    Args:
        refresh_token: Google OAuth refresh token
        client_id: Google OAuth client ID
        client_secret: Google OAuth client secret
        
    Returns:
        New access token or None if refresh fails
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token',
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('access_token')
            else:
                logger.error(f"Token refresh failed: {response.status_code}")
                return None
                
    except Exception as e:
        logger.error(f"Failed to refresh access token: {e}")
        return None
