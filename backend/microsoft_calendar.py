import os
import msal
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
TENANT_ID = os.getenv("MICROSOFT_TENANT_ID")
REDIRECT_URI = os.getenv("MICROSOFT_REDIRECT_URI")
SCOPES = ["Calendars.Read", "User.Read"]
AUTHORITY = f"https://login.microsoftonline.com/common"


def get_auth_url(user_id: str = "") -> str:
    app = msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
    )
    auth_url = app.get_authorization_request_url(
        SCOPES,
        redirect_uri=REDIRECT_URI,
        state=user_id,
    )
    return auth_url


async def exchange_code_for_tokens(code: str) -> dict:
    app = msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
    )
    result = app.acquire_token_by_authorization_code(
        code,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    if "error" in result:
        raise Exception(f"Token exchange failed: {result.get('error_description')}")
    return {
        "access_token": result["access_token"],
        "refresh_token": result.get("refresh_token", ""),
    }


async def get_todays_events(access_token: str) -> list:
    import httpx
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0).isoformat() + "Z"
    end = now.replace(hour=23, minute=59, second=59).isoformat() + "Z"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://graph.microsoft.com/v1.0/me/calendarView",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"startDateTime": start, "endDateTime": end, "$orderby": "start/dateTime"},
            )
            data = response.json()
            return data.get("value", [])
    except Exception as e:
        print(f"Microsoft calendar fetch error: {e}")
        return []


async def get_meeting_density(access_token: str) -> dict:
    events = await get_todays_events(access_token)
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
        start_dt = datetime.fromisoformat(start.rstrip("Z"))
        end_dt = datetime.fromisoformat(end.rstrip("Z"))
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
