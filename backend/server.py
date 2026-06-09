from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, Request
import httpx
from starlette.types import ASGIApp, Receive, Scope, Send
from collections import defaultdict
import time
from typing import Optional
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import certifi
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# Load environment first
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import routers
from auth import router as auth_router, get_current_user, require_active_subscription
from behavioral_monitor import router as behavior_router
from subscription import router as subscription_router
from models import User, Preferences, PreferencesUpdate, Nudge, NudgeResponse, HealthSignalCreate
from nudge_engine import get_pending_nudges, mark_nudge_delivered, mark_nudge_opened, create_nudge, deliver_nudge
from nudge_orchestrator import NudgeOrchestrator
from pattern_detector import PatternDetector, detect_weekly_patterns, learn_quiet_periods

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.getenv('MONGO_URL')
if not mongo_url:
    raise RuntimeError("MONGO_URL environment variable is not set")
db_name = os.getenv('DB_NAME', 'behavioral_nudge_db')
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[db_name]

# Dependency to get database
async def get_db() -> AsyncIOMotorDatabase:
    return db

async def send_sunday_koan_push():
    """Hourly job. Delivers each user the Sunday classical koan as a single push
    at 08:00 in their local time (preferences.tz_offset, default UTC), at most
    once per ISO week. This is the only Today-card push of the week — weekday
    observations stay pull-only. Replaces the former weekly-summary push
    (recap deferred to v1.1). Fires even in Whisper mode (the one weekly content
    surface Whisper users opted into)."""
    from koan_library import koan_for_week

    users = await db.users.find(
        {"subscription_status": {"$in": ["trial", "active"]}}
    ).to_list(None)

    sent = 0
    for user in users:
        user_id = user.get("id")
        if not user_id:
            continue
        try:
            prefs = await db.preferences.find_one({"user_id": user_id}) or {}
            tz_offset = int(prefs.get("tz_offset", 0) or 0)
            local_now = datetime.utcnow() + timedelta(minutes=tz_offset)
            # Fire only at the user's local Sunday 08:xx hour.
            if local_now.weekday() != 6 or local_now.hour != 8:
                continue
            iso_year, iso_week, _ = local_now.isocalendar()
            week_key = f"{iso_year}-{iso_week:02d}"
            if prefs.get("last_koan_push_week") == week_key:
                continue  # already pushed this week

            koan = koan_for_week(user_id, iso_week)
            # bypass_gates so Whisper still receives it; write=False because the
            # koan is rendered from the deterministic library, not stored.
            await deliver_nudge(
                db, user_id,
                {"nudge_type": "wisdom", "message": koan["text"]},
                channel="push", bypass_gates=True, write=False,
            )
            await db.preferences.update_one(
                {"user_id": user_id}, {"$set": {"last_koan_push_week": week_key}}
            )
            sent += 1
        except Exception as e:
            logger.error(f"Sunday koan push failed for user {user_id}: {e}")

    logger.info(f"Sunday koan push: {sent} koans sent this hour")


async def run_daily_nudge_evaluation():
    """Runs once per day at 9am UTC. Delegates all nudge decisions to NudgeOrchestrator."""
    logger.info("Daily nudge evaluation started")
    users = await db.users.find(
        {"subscription_status": {"$in": ["trial", "active"]}}
    ).to_list(None)

    total_nudges = 0
    users_with_nudges = 0

    for user in users:
        user_id = user.get("id")
        if not user_id:
            continue
        try:
            nudge = await NudgeOrchestrator(db).orchestrate(user_id)
            if nudge:
                users_with_nudges += 1
                total_nudges += 1
        except Exception as e:
            logger.error(f"Daily nudge evaluation failed for user {user_id}: {e}")

    logger.info(f"Daily nudge evaluation complete: {total_nudges} nudges for {users_with_nudges}/{len(users)} users")


# ─────────────────────────────────────────────────────────────────────────────
# Subscription lifecycle (Phase 1e-1): RevenueCat webhook, reconciliation cron,
# trial-end cron, and 90-day soft-archive.
# ─────────────────────────────────────────────────────────────────────────────

def _ms_to_dt(ms):
    """RevenueCat expiration_at_ms (epoch millis) -> naive UTC datetime, or None."""
    if not ms:
        return None
    try:
        return datetime.utcfromtimestamp(int(ms) / 1000.0)
    except (ValueError, TypeError):
        return None


def _naive_utc(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt


async def _set_status(user_id: str, status: str, **extra):
    """Set subscription_status and stamp status_changed_at (drives the 90-day timer)."""
    payload = {"subscription_status": status, "status_changed_at": datetime.utcnow()}
    payload.update(extra)
    await db.users.update_one({"id": user_id}, {"$set": payload})


async def _archive_user(user_id: str, prev_status: str):
    """Soft-archive: data is preserved; the user is excluded from active queries
    and restored automatically on next sign-in (see auth.get_current_user)."""
    await db.users.update_one({"id": user_id}, {"$set": {
        "subscription_status": SubscriptionStatus_value("ARCHIVED"),
        "archived": True,
        "archived_at": datetime.utcnow(),
        "pre_archive_status": prev_status,
        "status_changed_at": datetime.utcnow(),
    }})


def SubscriptionStatus_value(name: str) -> str:
    from models import SubscriptionStatus
    return getattr(SubscriptionStatus, name).value


async def _apply_revenuecat_event(user: dict, event: dict) -> dict:
    """Return the user-document update for a RevenueCat event. Pure-ish: builds
    the $set dict; the caller writes it."""
    etype = event.get("type")
    update: dict = {}
    exp = _ms_to_dt(event.get("expiration_at_ms"))
    product = event.get("product_id")

    if etype in ("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"):
        update["subscription_status"] = SubscriptionStatus_value("ACTIVE")
        update["status_changed_at"] = datetime.utcnow()
        update["cancelled_at"] = None
        if exp:
            update["subscription_ends"] = exp
        if product:
            update["product_id"] = product
    elif etype == "NON_RENEWING_PURCHASE":
        # Lifetime (koan_lifetime): active, no expiry.
        update["subscription_status"] = SubscriptionStatus_value("ACTIVE")
        update["status_changed_at"] = datetime.utcnow()
        update["subscription_ends"] = None
        if product:
            update["product_id"] = product
    elif etype == "CANCELLATION":
        # Auto-renew off, but access continues until subscription_ends. Just flag.
        update["cancelled_at"] = datetime.utcnow()
    elif etype == "EXPIRATION":
        update["subscription_status"] = SubscriptionStatus_value("EXPIRED")
        update["status_changed_at"] = datetime.utcnow()
    elif etype == "BILLING_ISSUE":
        # Keep access for the grace period; record only.
        logger.warning(f"RevenueCat BILLING_ISSUE for user {user.get('id')}")
    elif etype in ("TRANSFER", "SUBSCRIBER_ALIAS"):
        # Identity changed — keep the RC app_user_id mapping current.
        new_app_id = event.get("app_user_id")
        if new_app_id:
            update["revenuecat_app_user_id"] = new_app_id
    return update


async def revenuecat_webhook(request: Request):
    """POST /webhooks/revenuecat — authoritative subscription sync from RevenueCat.

    Auth: the shared secret in the Authorization header must match
    REVENUECAT_WEBHOOK_AUTH_HEADER. Idempotent via event_id dedup in the
    webhook_events collection.
    """
    expected = os.getenv("REVENUECAT_WEBHOOK_AUTH_HEADER")
    provided = request.headers.get("authorization") or request.headers.get("Authorization")
    if not expected or provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = body.get("event") or {}
    event_id = event.get("id")
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    original_app_user_id = event.get("original_app_user_id")

    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event id/type")

    # Idempotency — skip already-processed events.
    if await db.webhook_events.find_one({"event_id": event_id}):
        return {"status": "duplicate", "event_id": event_id}

    # Resolve the user by RC app_user_id (== user.id unless transferred/aliased).
    candidates = [x for x in (app_user_id, original_app_user_id) if x]
    user = None
    if candidates:
        user = await db.users.find_one({"id": {"$in": candidates}}) \
            or await db.users.find_one({"revenuecat_app_user_id": {"$in": candidates}})

    user_id = user.get("id") if user else None
    if user:
        update = await _apply_revenuecat_event(user, event)
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
            logger.info(f"RevenueCat {event_type} applied to user {user_id}: {list(update.keys())}")
    else:
        logger.warning(f"RevenueCat {event_type}: no user for app_user_id={app_user_id}")

    # Audit trail (also serves as the dedup record).
    await db.webhook_events.insert_one({
        "event_id": event_id,
        "event_type": event_type,
        "user_id": user_id,
        "raw_payload": body,
        "processed_at": datetime.utcnow(),
    })
    return {"status": "ok", "event_id": event_id, "user_found": bool(user)}


async def trial_lifecycle_cron():
    """Daily (06:00 UTC). Source of truth for trial/expiry/archive transitions,
    and schedules trial-ending reminder pushes (mode/quiet-hours via deliver_nudge)."""
    now = datetime.utcnow()

    # 1) trial -> trial_lockin_required (+ reminders)
    for u in await db.users.find({"subscription_status": "trial"}).to_list(None):
        uid, te = u.get("id"), _naive_utc(u.get("trial_ends"))
        if not uid or not te:
            continue
        if now > te:
            await _set_status(uid, "trial_lockin_required")
            continue
        days_left = (te - now).days
        reminders = {
            7: "One week left in your trial.",
            2: "Your trial ends in 2 days. Continue with Koan to keep going.",
            1: "Your trial ends tomorrow.",
        }
        if days_left in reminders:
            try:
                # channel="push", write=False (transactional, not a feed nudge).
                # Respects quiet hours; Whisper still suppresses the push (the
                # in-app lock-in paywall is the unconditional surface).
                await deliver_nudge(
                    db, uid,
                    {"nudge_type": "trial_reminder", "message": reminders[days_left]},
                    channel="push", write=False, enforce_frequency=False,
                )
            except Exception as e:
                logger.error(f"Trial reminder failed for {uid}: {e}")

    # 2) trial_lockin_required -> expired (day 28 = trial_ends + 14) or archived (90d in lock-in)
    for u in await db.users.find({"subscription_status": "trial_lockin_required"}).to_list(None):
        uid = u.get("id")
        te, sc = _naive_utc(u.get("trial_ends")), _naive_utc(u.get("status_changed_at"))
        if not uid:
            continue
        if te and now > te + timedelta(days=14):
            await _set_status(uid, "expired")
        elif sc and now > sc + timedelta(days=90):
            await _archive_user(uid, "trial_lockin_required")

    # 3) expired -> archived (90 days after entering expired)
    for u in await db.users.find({"subscription_status": "expired"}).to_list(None):
        uid, sc = u.get("id"), _naive_utc(u.get("status_changed_at"))
        if uid and sc and now > sc + timedelta(days=90):
            await _archive_user(uid, "expired")

    logger.info("Trial lifecycle cron complete")


async def revenuecat_sync_cron():
    """Daily reconciliation backup for missed webhooks. Compares RevenueCat's
    entitlement state with our stored status for active/cancelled/expired users."""
    secret = os.getenv("REVENUECAT_SECRET_API_KEY")
    if not secret:
        logger.info("RC sync skipped: REVENUECAT_SECRET_API_KEY not set")
        return

    users = await db.users.find(
        {"subscription_status": {"$in": ["active", "cancelled", "expired"]}}
    ).to_list(None)

    changed = 0
    async with httpx.AsyncClient(timeout=20.0) as client:
        for u in users:
            uid = u.get("id")
            app_id = u.get("revenuecat_app_user_id") or uid
            ours = u.get("subscription_status")
            if not uid:
                continue
            try:
                r = await client.get(
                    f"https://api.revenuecat.com/v1/subscribers/{app_id}",
                    headers={"Authorization": f"Bearer {secret}"},
                )
                if r.status_code != 200:
                    continue
                ents = ((r.json().get("subscriber") or {}).get("entitlements") or {})
                prem = ents.get("premium")
                rc_active = False
                if prem:
                    exp = prem.get("expires_date")
                    if exp is None:
                        rc_active = True  # lifetime
                    else:
                        try:
                            from datetime import timezone as _tz
                            exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
                            rc_active = exp_dt > datetime.now(_tz.utc)
                        except Exception:
                            rc_active = True
                if not rc_active and ours in ("active", "cancelled"):
                    await _set_status(uid, "expired")
                    changed += 1
                    logger.info(f"RC sync: {uid} {ours} -> expired")
                elif rc_active and ours == "expired":
                    await _set_status(uid, "active")
                    changed += 1
                    logger.info(f"RC sync: {uid} expired -> active")
            except Exception as e:
                logger.error(f"RC sync failed for {uid}: {e}")
    logger.info(f"RC sync complete: {changed} status changes")


scheduler = AsyncIOScheduler()

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting app, connecting to MongoDB at {mongo_url}")

    scheduler.add_job(run_daily_nudge_evaluation, CronTrigger(hour=9, minute=0))
    # Hourly so the Sunday koan push can fire at 08:00 in each user's local time.
    scheduler.add_job(send_sunday_koan_push, CronTrigger(minute=0))
    # Trial/expiry/archive transitions + trial-ending reminders.
    scheduler.add_job(trial_lifecycle_cron, CronTrigger(hour=6, minute=0))
    # Backup reconciliation for missed RevenueCat webhooks.
    scheduler.add_job(revenuecat_sync_cron, CronTrigger(hour=7, minute=0))
    scheduler.start()
    logger.info("Daily nudge scheduler started (runs at 09:00 UTC)")
    logger.info("Sunday koan push scheduler started (hourly; fires at local Sunday 08:00)")
    logger.info("Trial lifecycle cron started (runs at 06:00 UTC)")
    logger.info("RevenueCat sync cron started (runs at 07:00 UTC)")
    yield
    # Shutdown
    scheduler.shutdown()
    client.close()
    logger.info("Shutting down app")

# Create the main app
app = FastAPI(lifespan=lifespan)

# RevenueCat webhook — registered on the app root (NOT under /api), matching the
# dashboard URL https://koan-production.up.railway.app/webhooks/revenuecat
app.add_api_route("/webhooks/revenuecat", revenuecat_webhook, methods=["POST"])

# Pure ASGI rate limiting middleware — no BaseHTTPMiddleware, no thread context
_rate_store: dict = defaultdict(list)
_WINDOW = 60
_MAX = 10
_LIMITED = {"/api/auth/signup", "/api/auth/login"}

class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") in _LIMITED:
            headers = dict(scope.get("headers", []))
            forwarded = headers.get(b"x-forwarded-for", b"").decode()
            client = scope.get("client")
            ip = forwarded.split(",")[0].strip() if forwarded else (client[0] if client else "unknown")

            now = time.time()
            _rate_store[ip] = [t for t in _rate_store[ip] if t > now - _WINDOW]

            if len(_rate_store[ip]) >= _MAX:
                response = b'{"detail":"Too many requests. Please try again later."}'
                await send({"type": "http.response.start", "status": 429, "headers": [[b"content-type", b"application/json"]]})
                await send({"type": "http.response.body", "body": response})
                return

            _rate_store[ip].append(now)

        await self.app(scope, receive, send)

app.add_middleware(RateLimitMiddleware)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Modify auth router to accept db parameter
async def get_db_for_auth():
    return db

# Include sub-routers
api_router.include_router(auth_router)
api_router.include_router(behavior_router)
api_router.include_router(subscription_router)

# Preferences endpoints
@api_router.get("/preferences")
async def get_preferences(
    current_user: User = Depends(require_active_subscription)
):
    """Get user preferences"""
    prefs = await db.preferences.find_one({"user_id": current_user.id})
    if not prefs:
        # Create default preferences
        from models import MicroMode
        default_prefs = Preferences(user_id=current_user.id, micro_mode=MicroMode.STANDARD)
        await db.preferences.insert_one(default_prefs.dict())
        return default_prefs.dict()

    # Lazy migration: collapse removed micro_modes (focus/meeting) to standard,
    # rewriting the stored value so it never resurfaces.
    if prefs.get("micro_mode") in ("focus", "meeting"):
        await db.preferences.update_one(
            {"user_id": current_user.id}, {"$set": {"micro_mode": "standard"}}
        )
        prefs["micro_mode"] = "standard"

    # Remove MongoDB _id field for JSON serialization
    if '_id' in prefs:
        del prefs['_id']
    return prefs

@api_router.patch("/preferences")
async def update_preferences(
    updates: PreferencesUpdate,
    current_user: User = Depends(require_active_subscription)
):
    """Update user preferences"""
    update_dict = {k: v for k, v in updates.dict().items() if v is not None}
    
    await db.preferences.update_one(
        {"user_id": current_user.id},
        {"$set": update_dict}
    )
    
    return {"status": "updated", "updates": update_dict}

# Push notification token endpoint
@api_router.patch("/user/push-token")
async def update_push_token(
    push_token: dict,
    current_user: User = Depends(get_current_user)
):
    """Save Expo push notification token for the user"""
    token = push_token.get("push_token")
    if not token:
        raise HTTPException(status_code=400, detail="push_token is required")
    
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"push_token": token}}
    )
    
    return {"status": "updated", "push_token": token}

# Google Calendar Integration endpoints
from google_calendar import get_auth_url, exchange_code_for_tokens, get_meeting_density

@api_router.get("/integrations/calendar/auth-url")
async def get_calendar_auth_url(
    current_user: User = Depends(get_current_user)
):
    """Returns the Google OAuth URL for the frontend to open."""
    url = get_auth_url(user_id=current_user.id)
    return {"auth_url": url}

@api_router.get("/integrations/calendar/callback")
async def calendar_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """
    Google redirects here after user grants permission.
    Exchanges code for tokens and saves to user record.
    Returns a redirect to a deep link the app can intercept.
    """
    from fastapi.responses import RedirectResponse
    if error or not code:
        return RedirectResponse(url="koan://calendar-cancelled")
    try:
        tokens = await exchange_code_for_tokens(code)
        # State contains the user_id we passed in the auth URL
        if state:
            await db.users.update_one(
                {"id": state},
                {"$set": {
                    "google_calendar_token": tokens["access_token"],
                    "google_calendar_refresh_token": tokens["refresh_token"],
                    "google_calendar_connected": True,
                }}
            )
        return RedirectResponse(url="koan://calendar-connected")
    except Exception as e:
        print(f"OAuth callback error: {e}")
        return RedirectResponse(url="koan://calendar-error")

@api_router.delete("/integrations/calendar/disconnect")
async def disconnect_calendar(
    current_user: User = Depends(get_current_user)
):
    """Disconnect Google Calendar."""
    await db.users.update_one(
        {"id": current_user.id},
        {"$unset": {
            "google_calendar_token": "",
            "google_calendar_refresh_token": "",
            "google_calendar_connected": "",
        }}
    )
    return {"status": "disconnected"}

@api_router.get("/integrations/calendar/status")
async def get_calendar_status(
    current_user: User = Depends(get_current_user)
):
    """Check whether Google Calendar is connected."""
    user = await db.users.find_one({"id": current_user.id})
    connected = bool(user and user.get("google_calendar_connected"))
    return {"connected": connected}

@api_router.get("/integrations/calendar/today")
async def get_calendar_today(
    current_user: User = Depends(get_current_user)
):
    """Get today's meeting density for the current user."""
    user = await db.users.find_one({"id": current_user.id})
    if not user or not user.get("google_calendar_token"):
        return {"connected": False}
    density = await get_meeting_density(
        user["google_calendar_token"],
        user.get("google_calendar_refresh_token", "")
    )
    return {"connected": True, **density}

# Microsoft 365 Calendar Integration endpoints
from microsoft_calendar import (
    get_auth_url as ms_get_auth_url,
    exchange_code_for_tokens as ms_exchange_code,
    get_meeting_density as ms_get_meeting_density,
)

@api_router.get("/integrations/microsoft/auth-url")
async def get_microsoft_auth_url(current_user: User = Depends(get_current_user)):
    url = ms_get_auth_url(user_id=current_user.id)
    return {"auth_url": url}


@api_router.get("/integrations/microsoft/callback")
async def microsoft_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    from fastapi.responses import RedirectResponse
    if error or not code:
        return RedirectResponse(url="koan://microsoft-cancelled")
    try:
        tokens = await ms_exchange_code(code)
        if state:
            await db.users.update_one(
                {"id": state},
                {"$set": {
                    "microsoft_access_token": tokens["access_token"],
                    "microsoft_refresh_token": tokens["refresh_token"],
                    "microsoft_connected": True,
                }}
            )
            await db.preferences.update_one(
                {"user_id": state},
                {"$addToSet": {"connected_tools": "microsoft365"}},
            )
        return RedirectResponse(url="koan://microsoft-connected")
    except Exception as e:
        print(f"Microsoft OAuth callback error: {e}")
        return RedirectResponse(url="koan://microsoft-error")


@api_router.delete("/integrations/microsoft/disconnect")
async def disconnect_microsoft(current_user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user.id},
        {"$unset": {
            "microsoft_access_token": "",
            "microsoft_refresh_token": "",
            "microsoft_connected": "",
        }}
    )
    return {"status": "disconnected"}


@api_router.get("/integrations/microsoft/status")
async def get_microsoft_status(current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user.id})
    connected = bool(user and user.get("microsoft_connected"))
    return {"connected": connected}


@api_router.get("/integrations/microsoft/today")
async def get_microsoft_today(current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user.id})
    if not user or not user.get("microsoft_access_token"):
        return {"connected": False}
    density = await ms_get_meeting_density(user["microsoft_access_token"])
    return {"connected": True, **density}


# Nudge endpoints
@api_router.get("/nudges/pending")
async def get_pending_nudges_endpoint(
    current_user: User = Depends(require_active_subscription)
):
    """Get pending nudges for the user"""
    nudges = await get_pending_nudges(db, current_user.id)
    return {"nudges": [n.dict() for n in nudges]}

@api_router.get("/nudges/count")
async def get_nudge_count(current_user: User = Depends(require_active_subscription)):
    """Get total count of nudges sent to user"""
    count = await db.nudges.count_documents({"user_id": current_user.id})
    return {"count": count}

# Pattern-based nudge — GET, so no conflict with POST parameterised routes,
# but kept here alongside other static nudge routes for clarity
@api_router.get("/nudges/pattern-nudge")
async def get_pattern_nudge(
    current_user: User = Depends(require_active_subscription)
):
    """Get the highest priority nudge based on current patterns."""
    from datetime import datetime as _dt, timedelta as _td
    detector = PatternDetector(db)

    # Exclude the observation already featured on today's home "Today" card so
    # the feed never duplicates it.
    featured = await db.nudges.find_one(
        {"user_id": current_user.id, "featured_at": {"$gte": _dt.utcnow() - _td(hours=24)}},
        sort=[("featured_at", -1)],
    )
    exclude = {featured["trigger_id"]} if featured and featured.get("trigger_id") else set()

    nudge_data = await detector.get_priority_nudge(current_user.id, exclude_trigger_ids=exclude)
    if not nudge_data:
        return {"nudge": None}

    # Single delivery gate: applies mode (Whisper), frequency, and quiet-hours,
    # then writes + pushes. Returns None when gated out.
    delivered = await deliver_nudge(
        db, current_user.id,
        {
            "nudge_type": nudge_data["category"],
            "message": nudge_data["message"],
            "explanation": nudge_data["principle"],
            "trigger_id": nudge_data["trigger_id"],
        },
        channel="both",
    )
    return {"nudge": delivered}


# Home "Today" card — Sundays: a classical koan; weekdays: the single most
# pattern-significant observation (or nothing). The weekday observation is
# marked featured_at so it is excluded from the main nudge feed for the day.
@api_router.get("/nudges/today-card")
async def get_today_card(
    tz_offset: int = 0,  # minutes east of UTC, supplied by the client
    current_user: User = Depends(require_active_subscription)
):
    from datetime import datetime as _dt, timedelta as _td
    from koan_library import koan_for_week

    local_now = _dt.utcnow() + _td(minutes=tz_offset)

    # Record the client's timezone offset so the Sunday-koan cron and quiet-hours
    # can reason in the user's local time.
    await db.preferences.update_one(
        {"user_id": current_user.id}, {"$set": {"tz_offset": tz_offset}}
    )

    # Sunday: deterministic per-user, per-ISO-week classical koan.
    if local_now.weekday() == 6:
        iso_week = local_now.isocalendar()[1]
        koan = koan_for_week(current_user.id, iso_week)
        return {
            "type": "classical_koan",
            "text": koan["text"],
            "attribution": koan["attribution"],
        }

    # Weekday: feature the highest-priority observation, once per local day.
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_start_utc = local_midnight - _td(minutes=tz_offset)
    existing = await db.nudges.find_one(
        {"user_id": current_user.id, "featured_at": {"$gte": day_start_utc}},
        sort=[("featured_at", -1)],
    )
    if existing:
        return {
            "type": "observation",
            "text": existing["message"],
            "category": existing.get("nudge_type"),
            "trigger": existing.get("trigger_id"),
        }

    detector = PatternDetector(db)
    nudge_data = await detector.get_priority_nudge(current_user.id)
    if not nudge_data:
        return {"type": None}

    # Store as a featured in-app card via the single gate. channel="in_app"
    # means no push; enforce_frequency=False because the card is already
    # once-per-day by the idempotency check above. Whisper mode suppresses it
    # (deliver_nudge returns None) so no weekday card shows.
    delivered = await deliver_nudge(
        db, current_user.id,
        {
            "nudge_type": nudge_data["category"],
            "message": nudge_data["message"],
            "explanation": nudge_data.get("principle", ""),
            "trigger_id": nudge_data["trigger_id"],
            "featured_at": _dt.utcnow(),
        },
        channel="in_app",
        enforce_frequency=False,
    )
    if not delivered:
        return {"type": None}

    return {
        "type": "observation",
        "text": nudge_data["message"],
        "category": nudge_data["category"],
        "trigger": nudge_data["trigger_id"],
    }

@api_router.post("/nudges/{nudge_id}/delivered")
async def mark_delivered(
    nudge_id: str,
    current_user: User = Depends(require_active_subscription)
):
    """Mark a nudge as delivered"""
    await mark_nudge_delivered(db, nudge_id)
    return {"status": "delivered"}

@api_router.post("/nudges/{nudge_id}/opened")
async def mark_opened(
    nudge_id: str,
    current_user: User = Depends(require_active_subscription)
):
    """Mark a nudge as opened"""
    await mark_nudge_opened(db, nudge_id)
    return {"status": "opened"}

@api_router.post("/nudges/{nudge_id}/action")
async def record_nudge_action(
    nudge_id: str,
    response: NudgeResponse,
    current_user: User = Depends(require_active_subscription)
):
    """Record user action on a nudge"""
    await db.nudges.update_one(
        {"id": nudge_id},
        {"$set": {"action_taken": response.action}}
    )
    return {"status": "recorded"}

# Adaptive Nudge Engine endpoints
from adaptive_nudge_engine import AdaptiveNudgeEngine, Signal, SignalType
from pydantic import BaseModel
from datetime import datetime as dt

class SignalRequest(BaseModel):
    signal_type: str
    strength: float
    metadata: dict = {}

@api_router.post("/adaptive-nudges/evaluate")
async def evaluate_signal_endpoint(
    signal_request: SignalRequest,
    current_user: User = Depends(require_active_subscription)
):
    """Evaluate a real-time signal via the NudgeOrchestrator."""
    signal = Signal(
        signal_type=SignalType(signal_request.signal_type),
        strength=signal_request.strength,
        timestamp=dt.utcnow(),
        metadata=signal_request.metadata,
    )

    nudge = await NudgeOrchestrator(db).orchestrate(current_user.id, realtime_signal=signal)

    if nudge:
        return {"status": "nudge_created", "nudge": nudge}
    return {"status": "no_nudge", "message": "Signal did not meet threshold"}

@api_router.get("/adaptive-nudges/fallback")
async def check_fallback_nudge_endpoint(
    current_user: User = Depends(require_active_subscription)
):
    """Check if fallback nudge should be sent (no nudges in 36 hours)"""
    engine = AdaptiveNudgeEngine(db)
    nudge = await engine.check_fallback_nudge(current_user.id)

    if nudge:
        return {"status": "nudge_created", "nudge": nudge}
    return {"status": "no_fallback_needed"}

@api_router.post("/adaptive-nudges/{nudge_id}/interaction")
async def record_interaction(
    nudge_id: str,
    action: str = Query(...),
    current_user: User = Depends(require_active_subscription)
):
    """Record user interaction with adaptive nudge (dismissed, engaged, ignored)"""
    engine = AdaptiveNudgeEngine(db)
    await engine.record_nudge_interaction(current_user.id, nudge_id, action)
    return {"status": "recorded", "action": action}

@api_router.get("/adaptive-nudges/milestones")
async def check_milestones_endpoint(
    current_user: User = Depends(require_active_subscription)
):
    """Check user milestones and trigger milestone nudges"""
    # Get user behavior summary
    behavior_summary = await db["behavior_events"].aggregate([
        {"$match": {"user_id": current_user.id}},
        {"$group": {
            "_id": None,
            "total_events": {"$sum": 1},
            "days_active": {"$addToSet": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}}
        }}
    ]).to_list(length=1)
    
    if not behavior_summary:
        return {"milestones": []}
    
    total_events = behavior_summary[0].get("total_events", 0)
    days_active = len(behavior_summary[0].get("days_active", []))
    
    milestones = []
    
    # Milestone 1: First week (7 days active)
    if days_active >= 7:
        milestones.append({
            "type": "first_week",
            "message": "One week of mindful awareness. You're building something lasting.",
            "achieved": True
        })
    
    # Milestone 2: 50 behavior events
    if total_events >= 50:
        milestones.append({
            "type": "fifty_events",
            "message": "Fifty moments of awareness. Your patterns are becoming clear.",
            "achieved": True
        })
    
    # Milestone 3: Two weeks (14 days active)
    if days_active >= 14:
        milestones.append({
            "type": "two_weeks",
            "message": "Two weeks of practice. Notice how your awareness has deepened.",
            "achieved": True
        })
    
    # Milestone 4: 100 behavior events
    if total_events >= 100:
        milestones.append({
            "type": "hundred_events",
            "message": "One hundred moments of mindfulness. You're developing true awareness.",
            "achieved": True
        })
    
    # Milestone 5: One month (30 days active)
    if days_active >= 30:
        milestones.append({
            "type": "one_month",
            "message": "One month of consistent practice. Your mindful habits are taking root.",
            "achieved": True
        })
    
    return {"milestones": milestones}

@api_router.get("/adaptive-nudges/personalized")
async def get_personalized_nudges_endpoint(
    current_user: User = Depends(require_active_subscription)
):
    """Get personalized nudges based on user patterns and preferences"""
    # Get user preferences
    prefs = await db["preferences"].find_one({"user_id": current_user.id})
    
    # Get recent behavior patterns
    recent_events = await db["behavior_events"].find(
        {"user_id": current_user.id},
        sort=[("timestamp", -1)],
        limit=50
    ).to_list(length=50)
    
    personalized_nudges = []
    
    # Analyze patterns and create personalized nudges
    if recent_events:
        # Check for excessive phone pickups pattern
        pickup_events = [e for e in recent_events if e.get("event_type") == "phone_pickup"]
        if len(pickup_events) > 10:
            personalized_nudges.append({
                "type": "pickup_awareness",
                "message": "Notice the impulse before reaching for your phone.",
                "priority": "high"
            })
        
        # Check for late night usage
        late_night_events = [e for e in recent_events if e.get("timestamp", dt.utcnow()).hour >= 22]
        if len(late_night_events) > 5:
            personalized_nudges.append({
                "type": "evening_boundary",
                "message": "Consider setting an evening boundary for deeper rest.",
                "priority": "medium"
            })
    
    # Add anchor action reminder if configured
    if prefs and prefs.get("anchor_actions"):
        enabled_actions = [a for a in prefs["anchor_actions"] if a.get("enabled")]
        if enabled_actions:
            personalized_nudges.append({
                "type": "anchor_reminder",
                "message": f"Remember your anchor: {enabled_actions[0].get('text', 'close one loop')}",
                "priority": "low"
            })
    
    return {"personalized_nudges": personalized_nudges}

# Health signal endpoints
# FastAPI's default 1MB request body limit applies to this endpoint.
# Field-level validation on HealthSignalCreate rejects obviously invalid values
# before they reach the database.
@api_router.post("/health/signals")
async def record_health_signal(
    signal: HealthSignalCreate,
    current_user: User = Depends(require_active_subscription)
):
    """Receive daily health signal snapshot from the mobile app"""
    from datetime import datetime as dt
    doc = signal.dict()
    doc["user_id"] = current_user.id
    doc["recorded_at"] = dt.utcnow()
    await db.health_signals.update_one(
        {"user_id": current_user.id, "date": signal.date},
        {"$set": doc},
        upsert=True
    )
    # Evaluate patterns and create a nudge if warranted
    detector = PatternDetector(db)
    await detector.get_priority_nudge(current_user.id)
    return {"status": "ok"}

@api_router.get("/health/signals")
async def get_health_signals(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(require_active_subscription)
):
    """Get recent health signals for the current user"""
    from datetime import datetime as dt, timedelta
    cutoff = (dt.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    signals = await db.health_signals.find(
        {"user_id": current_user.id, "date": {"$gte": cutoff}},
        sort=[("date", -1)]
    ).to_list(days)
    for s in signals:
        s["_id"] = str(s["_id"])
    return {"signals": signals}

# Pattern detection endpoints
@api_router.get("/patterns/weekly")
async def get_weekly_patterns(
    current_user: User = Depends(require_active_subscription)
):
    """Get weekly pattern narrative"""
    detector = PatternDetector(db)
    result = await detector.detect_weekly_patterns(current_user.id)
    return result

@api_router.post("/patterns/learn-quiet-periods")
async def trigger_quiet_period_learning(
    current_user: User = Depends(get_current_user)
):
    """Manually trigger quiet period learning"""
    await learn_quiet_periods(db, current_user.id)
    return {"status": "learning_complete"}

# Nudge pipeline debug endpoint (dry-run, no delivery)
@api_router.get("/nudges/debug")
async def debug_nudge_pipeline(
    current_user: User = Depends(get_current_user),
):
    """
    Dry-run the full orchestrator pipeline for the authenticated user.
    Returns pipeline state without sending anything.
    Protected by auth only (not subscription gate) for testing ease.
    """
    orchestrator = NudgeOrchestrator(db)

    can_deliver = await orchestrator.can_deliver(current_user.id)

    last_nudge = await db.nudges.find_one(
        {"user_id": current_user.id, "delivered": True},
        sort=[("created_at", -1)],
    )
    last_nudge_sent = last_nudge.get("created_at") if last_nudge else None

    candidates = await orchestrator.collect_candidates(current_user.id)

    scores: dict = {}
    for candidate in candidates:
        score = await orchestrator.score_candidate(candidate, current_user.id)
        scores[candidate["trigger_id"]] = round(score, 3)

    _THRESHOLD = 0.6
    scored_above = [
        (c, scores[c["trigger_id"]])
        for c in candidates
        if scores[c["trigger_id"]] >= _THRESHOLD
    ]
    scored_above.sort(key=lambda x: x[1], reverse=True)
    would_send = scored_above[0][0]["trigger_id"] if scored_above else None

    return {
        "can_deliver": can_deliver,
        "last_nudge_sent": last_nudge_sent,
        "candidates": candidates,
        "scores": scores,
        "would_send": would_send,
    }


# Admin: per-user API usage summary (authenticated user only)
@api_router.get("/admin/usage-summary")
async def get_usage_summary(
    current_user: User = Depends(get_current_user),
):
    """
    Returns a 30-day Anthropic API usage summary for the authenticated user.
    Scoped to the requesting user — no cross-user data access.
    """
    from datetime import datetime as dt, timedelta
    period_days = 30
    cutoff = dt.utcnow() - timedelta(days=period_days)

    docs = await db.api_usage.find(
        {"user_id": current_user.id, "timestamp": {"$gte": cutoff}}
    ).to_list(None)

    total_calls = len(docs)
    total_tokens = sum(d.get("total_tokens", 0) for d in docs)
    nudge_calls = sum(1 for d in docs if d.get("endpoint") == "nudge_generate")
    narrative_calls = sum(1 for d in docs if d.get("endpoint") == "weekly_narrative")
    # Haiku input rate approximation: $1 per million tokens
    estimated_cost_usd = round(total_tokens * 0.000001, 6)

    return {
        "user_id": current_user.id,
        "period_days": period_days,
        "total_calls": total_calls,
        "total_tokens": total_tokens,
        "nudge_calls": nudge_calls,
        "narrative_calls": narrative_calls,
        "estimated_cost_usd": estimated_cost_usd,
    }


# Health check
@api_router.get("/")
async def root():
    return {"message": "Behavioral Nudge API", "status": "running"}

@api_router.get("/health")
async def health_check():
    try:
        # Check MongoDB connection
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=503, detail="Service unavailable")

# Include the router in the main app
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[
        "exp://",
        "https://expo.dev",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
