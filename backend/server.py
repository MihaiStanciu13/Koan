from fastapi import FastAPI, APIRouter, Depends, HTTPException
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
from models import User, Preferences, PreferencesUpdate, Nudge, NudgeResponse
from nudge_engine import get_pending_nudges, mark_nudge_delivered, mark_nudge_opened, create_nudge
from pattern_detector import detect_weekly_patterns, learn_quiet_periods

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

# Nudge endpoints
@api_router.get("/nudges/pending")
async def get_pending_nudges_endpoint(
    current_user: User = Depends(get_current_user)
):
    """Get pending nudges for the user"""
    nudges = await get_pending_nudges(db, current_user.id)
    return {"nudges": [n.dict() for n in nudges]}

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

# Manual nudge creation (for testing anchor actions)
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
    action: str,
    current_user: User = Depends(get_current_user)
):
    """Record user interaction with adaptive nudge (dismissed, engaged, ignored)"""
    engine = AdaptiveNudgeEngine(db)
    await engine.record_nudge_interaction(current_user.id, nudge_id, action)
    return {"status": "recorded", "action": action}

# Pattern detection endpoints
@api_router.get("/patterns/weekly")
async def get_weekly_patterns(
    current_user: User = Depends(get_current_user)
):
    """Get weekly pattern narrative"""
    patterns = await detect_weekly_patterns(db, current_user.id)
    return patterns

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
