import os
from datetime import datetime, timedelta
from typing import Optional
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def create_oauth_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    return flow


def get_auth_url(user_id: str = "") -> str:
    flow = create_oauth_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=user_id
    )
    return auth_url


async def exchange_code_for_tokens(code: str) -> dict:
    flow = create_oauth_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials
    return {
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
    }


def build_calendar_service(access_token: str, refresh_token: str):
    credentials = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
    )
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    return build("calendar", "v3", credentials=credentials)


async def get_todays_events(access_token: str, refresh_token: str) -> list:
    try:
        service = build_calendar_service(access_token, refresh_token)
        now = datetime.utcnow()
        start = now.replace(hour=0, minute=0, second=0).isoformat() + "Z"
        end = now.replace(hour=23, minute=59, second=59).isoformat() + "Z"
        result = service.events().list(
            calendarId="primary",
            timeMin=start,
            timeMax=end,
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        return result.get("items", [])
    except Exception as e:
        print(f"Calendar fetch error: {e}")
        return []


async def get_meeting_density(access_token: str, refresh_token: str) -> dict:
    """Analyse today's calendar for meeting load and free time."""
    events = await get_todays_events(access_token, refresh_token)
    if not events:
        return {"meeting_count": 0, "meeting_minutes": 0, "free_minutes": 480, "back_to_back": False}

    meeting_count = 0
    meeting_minutes = 0
    back_to_back = False
    prev_end = None

    for event in events:
        start = event.get("start", {}).get("dateTime")
        end = event.get("end", {}).get("dateTime")
        if not start or not end:
            continue
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
        duration = (end_dt - start_dt).seconds // 60
        meeting_count += 1
        meeting_minutes += duration
        if prev_end and (start_dt - prev_end).seconds < 600:
            back_to_back = True
        prev_end = end_dt

    return {
        "meeting_count": meeting_count,
        "meeting_minutes": meeting_minutes,
        "free_minutes": max(0, 480 - meeting_minutes),
        "back_to_back": back_to_back,
    }


# Backwards-compatible shim — server.py calls fetch_calendar_events(access_token)
async def fetch_calendar_events(access_token: str, refresh_token: str = "") -> dict:
    """Legacy entry point used by server.py calendar endpoints."""
    return await get_meeting_density(access_token, refresh_token)
