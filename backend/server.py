from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# Load environment first
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import routers
from auth import router as auth_router, get_current_user
from behavioral_monitor import router as behavior_router
from subscription import router as subscription_router
from models import User, Preferences, PreferencesUpdate, Nudge, NudgeResponse, HealthSignalCreate
from nudge_engine import get_pending_nudges, mark_nudge_delivered, mark_nudge_opened, create_nudge, check_health_signal_triggers
from pattern_detector import PatternDetector, detect_weekly_patterns, learn_quiet_periods

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.getenv('DB_NAME', 'behavioral_nudge_db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Dependency to get database
async def get_db() -> AsyncIOMotorDatabase:
    return db

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting app, connecting to MongoDB at {mongo_url}")
    yield
    # Shutdown
    client.close()
    logger.info("Shutting down app")

# Create the main app
app = FastAPI(lifespan=lifespan)

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
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
from google_calendar import fetch_calendar_events

@api_router.post("/integrations/calendar/connect")
async def connect_google_calendar(
    tokens: dict,
    current_user: User = Depends(get_current_user)
):
    """Save Google Calendar OAuth tokens"""
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="access_token is required")
    
    update_data = {"google_calendar_token": access_token}
    if refresh_token:
        update_data["google_calendar_refresh_token"] = refresh_token
    
    await db.users.update_one(
        {"_id": current_user.id},
        {"$set": update_data}
    )
    
    return {"status": "connected"}

@api_router.get("/integrations/calendar/events")
async def get_calendar_events(
    current_user: User = Depends(get_current_user)
):
    """Fetch calendar events for meeting-based nudges"""
    user = await db.users.find_one({"_id": current_user.id})
    
    if not user or not user.get("google_calendar_token"):
        raise HTTPException(status_code=404, detail="Google Calendar not connected")
    
    access_token = user["google_calendar_token"]
    events_data = await fetch_calendar_events(access_token)
    
    return events_data

@api_router.delete("/integrations/calendar/disconnect")
async def disconnect_google_calendar(
    current_user: User = Depends(get_current_user)
):
    """Disconnect Google Calendar"""
    await db.users.update_one(
        {"_id": current_user.id},
        {"$unset": {"google_calendar_token": "", "google_calendar_refresh_token": ""}}
    )
    
    return {"status": "disconnected"}

# Nudge endpoints
@api_router.get("/nudges/pending")
async def get_pending_nudges_endpoint(
    current_user: User = Depends(get_current_user)
):
    """Get pending nudges for the user"""
    nudges = await get_pending_nudges(db, current_user.id)
    return {"nudges": [n.dict() for n in nudges]}

@api_router.get("/nudges/count")
async def get_nudge_count(current_user: User = Depends(get_current_user)):
    """Get total count of nudges sent to user"""
    count = await db.nudges.count_documents({"user_id": current_user.id})
    return {"count": count}

# Pattern-based nudge — GET, so no conflict with POST parameterised routes,
# but kept here alongside other static nudge routes for clarity
@api_router.get("/nudges/pattern-nudge")
async def get_pattern_nudge(
    current_user: User = Depends(get_current_user)
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

# Static route MUST come before parameterised routes of the same method
@api_router.post("/nudges/trigger-anchor")
async def trigger_anchor_nudge(
    current_user: User = Depends(get_current_user)
):
    """Manually trigger an anchor action nudge"""
    prefs = await db.preferences.find_one({"user_id": current_user.id})
    anchor_action = prefs.get("anchor_action", "close one loop") if prefs else "close one loop"

    nudge = await create_nudge(db, current_user.id, "anchor_action", {
        "anchor_action": anchor_action
    })

    if nudge:
        return {"status": "created", "nudge": nudge.dict()}
    return {"status": "failed", "message": "Could not create nudge"}

@api_router.post("/nudges/{nudge_id}/delivered")
async def mark_delivered(
    nudge_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a nudge as delivered"""
    await mark_nudge_delivered(db, nudge_id)
    return {"status": "delivered"}

@api_router.post("/nudges/{nudge_id}/opened")
async def mark_opened(
    nudge_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a nudge as opened"""
    await mark_nudge_opened(db, nudge_id)
    return {"status": "opened"}

@api_router.post("/nudges/{nudge_id}/action")
async def record_nudge_action(
    nudge_id: str,
    response: NudgeResponse,
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
):
    """Evaluate a signal and potentially create an adaptive nudge"""
    engine = AdaptiveNudgeEngine(db)
    
    signal = Signal(
        signal_type=SignalType(signal_request.signal_type),
        strength=signal_request.strength,
        timestamp=dt.utcnow(),
        metadata=signal_request.metadata
    )
    
    nudge = await engine.evaluate_signal(current_user.id, signal)
    
    if nudge:
        return {"status": "nudge_created", "nudge": nudge}
    return {"status": "no_nudge", "message": "Signal did not meet threshold"}

@api_router.get("/adaptive-nudges/fallback")
async def check_fallback_nudge_endpoint(
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
):
    """Record user interaction with adaptive nudge (dismissed, engaged, ignored)"""
    engine = AdaptiveNudgeEngine(db)
    await engine.record_nudge_interaction(current_user.id, nudge_id, action)
    return {"status": "recorded", "action": action}

@api_router.get("/adaptive-nudges/milestones")
async def check_milestones_endpoint(
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
@api_router.post("/health/signals")
async def record_health_signal(
    signal: HealthSignalCreate,
    current_user: User = Depends(get_current_user)
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
    days: int = 7,
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
