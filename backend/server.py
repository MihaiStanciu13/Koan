from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, Request
from collections import defaultdict
import time
from typing import Optional
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# Load environment first
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ── Sentry crash monitoring ────────────────────────────────────────────────────
# Required env vars on Railway: SENTRY_DSN, ENVIRONMENT (optional, defaults to
# "production"). MONGO_URL and SECRET_KEY are also required (see below).
# If SENTRY_DSN is unset, Sentry initialises in no-op mode — no guard needed.
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[],
    auto_enabling_integrations=False,
    traces_sample_rate=0.2,
    environment=os.getenv("ENVIRONMENT", "production"),
)
# ──────────────────────────────────────────────────────────────────────────────

# Import routers
from auth import router as auth_router, get_current_user, require_active_subscription
from behavioral_monitor import router as behavior_router
from subscription import router as subscription_router
from models import User, Preferences, PreferencesUpdate, Nudge, NudgeResponse, HealthSignalCreate
from nudge_engine import get_pending_nudges, mark_nudge_delivered, mark_nudge_opened, create_nudge
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
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Dependency to get database
async def get_db() -> AsyncIOMotorDatabase:
    return db

async def send_weekly_summary_notifications():
    """Runs every Sunday at 08:00 UTC. Sends a push notification to users whose
    weekly pattern narrative is ready (i.e. not the baseline placeholder)."""
    from push_notifications import send_push_notification

    logger.info("Weekly summary notification job started")
    users = await db.users.find(
        {"subscription_status": {"$in": ["trial", "active"]}}
    ).to_list(None)

    sent = 0
    for user in users:
        user_id = user.get("id")
        if not user_id:
            continue
        try:
            result = await PatternDetector(db).detect_weekly_patterns(user_id)
            narrative = result.get("narrative", "")
            if narrative and "Koan is still building your baseline" not in narrative:
                await send_push_notification(
                    db=db,
                    user_id=user_id,
                    title="Koan",
                    body="Your weekly reflection is ready.",
                    data={"type": "weekly_summary", "navigate": "insights"},
                )
                sent += 1
        except Exception as e:
            logger.error(f"Weekly summary notification failed for user {user_id}: {e}")

    logger.info(f"Weekly summary notifications sent: {sent}/{len(users)} users")


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

scheduler = AsyncIOScheduler()

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting app, connecting to MongoDB at {mongo_url}")
    scheduler.add_job(run_daily_nudge_evaluation, CronTrigger(hour=9, minute=0))
    scheduler.add_job(send_weekly_summary_notifications, CronTrigger(day_of_week="sun", hour=8, minute=0))
    scheduler.start()
    logger.info("Daily nudge scheduler started (runs at 09:00 UTC)")
    logger.info("Weekly summary scheduler started (runs Sundays at 08:00 UTC)")
    yield
    # Shutdown
    scheduler.shutdown()
    client.close()
    logger.info("Shutting down app")

# Create the main app
app = FastAPI(lifespan=lifespan)

# Async rate limiting middleware (replaces slowapi)
_rate_limit_store: dict = defaultdict(list)
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 10
RATE_LIMITED_PATHS = {"/api/auth/signup", "/api/auth/login"}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in RATE_LIMITED_PATHS:
        client_ip = request.headers.get(
            "x-forwarded-for",
            request.client.host if request.client else "unknown"
        ).split(",")[0].strip()

        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

        _rate_limit_store[client_ip] = [
            t for t in _rate_limit_store[client_ip]
            if t > window_start
        ]

        if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."}
            )

        _rate_limit_store[client_ip].append(now)

    return await call_next(request)

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
        {"_id": current_user.id},
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
    code: str,
    state: Optional[str] = None,
):
    """
    Google redirects here after user grants permission.
    Exchanges code for tokens and saves to user record.
    Returns a redirect to a deep link the app can intercept.
    """
    from fastapi.responses import RedirectResponse
    try:
        tokens = await exchange_code_for_tokens(code)
        # State contains the user_id we passed in the auth URL
        if state:
            await db.users.update_one(
                {"_id": state},
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
        {"_id": current_user.id},
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
    user = await db.users.find_one({"_id": current_user.id})
    connected = bool(user and user.get("google_calendar_connected"))
    return {"connected": connected}

@api_router.get("/integrations/calendar/today")
async def get_calendar_today(
    current_user: User = Depends(get_current_user)
):
    """Get today's meeting density for the current user."""
    user = await db.users.find_one({"_id": current_user.id})
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
    code: str,
    state: Optional[str] = None,
):
    from fastapi.responses import RedirectResponse
    try:
        tokens = await ms_exchange_code(code)
        if state:
            await db.users.update_one(
                {"_id": state},
                {"$set": {
                    "microsoft_access_token": tokens["access_token"],
                    "microsoft_refresh_token": tokens["refresh_token"],
                    "microsoft_connected": True,
                }}
            )
        return RedirectResponse(url="koan://microsoft-connected")
    except Exception as e:
        print(f"Microsoft OAuth callback error: {e}")
        return RedirectResponse(url="koan://microsoft-error")


@api_router.delete("/integrations/microsoft/disconnect")
async def disconnect_microsoft(current_user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": current_user.id},
        {"$unset": {
            "microsoft_access_token": "",
            "microsoft_refresh_token": "",
            "microsoft_connected": "",
        }}
    )
    return {"status": "disconnected"}


@api_router.get("/integrations/microsoft/status")
async def get_microsoft_status(current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"_id": current_user.id})
    connected = bool(user and user.get("microsoft_connected"))
    return {"connected": connected}


@api_router.get("/integrations/microsoft/today")
async def get_microsoft_today(current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"_id": current_user.id})
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
    import uuid
    from models import MicroMode
    detector = PatternDetector(db)
    nudge_data = await detector.get_priority_nudge(current_user.id)
    if not nudge_data:
        return {"nudge": None}

    # Create nudge directly with library content (pre-formed message + principle)
    prefs = await db.preferences.find_one({"user_id": current_user.id}) or {}
    nudge_style = prefs.get("nudge_style", "silent")
    nudge_id = str(uuid.uuid4())
    from models import Nudge
    nudge = Nudge(
        id=nudge_id,
        user_id=current_user.id,
        nudge_type=nudge_data["category"],
        message=nudge_data["message"],
        explanation=nudge_data["principle"],
        delivered=False,
        silent=(nudge_style == "silent"),
    )
    await db.nudges.insert_one(nudge.dict())
    return {"nudge": nudge.dict()}

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
