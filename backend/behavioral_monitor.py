from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, timedelta
from typing import List, Dict
from pydantic import BaseModel
from pathlib import Path
from dotenv import load_dotenv
import os
from models import PhoneBehavior, WorkplaceData, User
from auth import get_current_user
import logging

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Get MongoDB connection
mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.getenv('DB_NAME', 'behavioral_nudge_db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter(prefix="/behavior", tags=["behavior"])
logger = logging.getLogger(__name__)

class BehaviorEvent(BaseModel):
    event_type: str
    metadata: Dict = {}

@router.post("/phone")
async def record_phone_behavior(
    event: BehaviorEvent,
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Record phone behavior events (pickups, app switches, etc.)"""
    try:
        behavior = PhoneBehavior(
            user_id=current_user.id,
            event_type=event.event_type,
            metadata=event.metadata
        )
        
        await db.phone_behaviors.insert_one(behavior.dict())
        
        # Check if we should trigger a nudge based on this behavior
        await check_behavior_triggers(db, current_user.id, event.event_type)
        
        return {"status": "recorded", "timestamp": behavior.timestamp}
    except Exception as e:
        logger.error(f"Error recording phone behavior: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workplace")
async def record_workplace_data(
    event: BehaviorEvent,
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Record workplace tool data (mocked for now)"""
    try:
        workplace_data = WorkplaceData(
            user_id=current_user.id,
            source=event.metadata.get("source", "unknown"),
            event_type=event.event_type,
            metadata=event.metadata
        )
        
        await db.workplace_data.insert_one(workplace_data.dict())
        
        return {"status": "recorded", "timestamp": workplace_data.timestamp}
    except Exception as e:
        logger.error(f"Error recording workplace data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/summary")
async def get_behavior_summary(
    days: int = 7,
    db: AsyncIOMotorDatabase = None,
    current_user: User = Depends(get_current_user)
):
    """Get summary of user's behavioral patterns"""
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Get phone behaviors
        phone_behaviors = await db.phone_behaviors.find({
            "user_id": current_user.id,
            "timestamp": {"$gte": cutoff_date}
        }).to_list(1000)
        
        # Get workplace data
        workplace_data = await db.workplace_data.find({
            "user_id": current_user.id,
            "timestamp": {"$gte": cutoff_date}
        }).to_list(1000)
        
        # Aggregate statistics
        phone_event_counts = {}
        for behavior in phone_behaviors:
            event_type = behavior["event_type"]
            phone_event_counts[event_type] = phone_event_counts.get(event_type, 0) + 1
        
        workplace_event_counts = {}
        for data in workplace_data:
            event_type = data["event_type"]
            workplace_event_counts[event_type] = workplace_event_counts.get(event_type, 0) + 1
        
        return {
            "period_days": days,
            "phone_behaviors": phone_event_counts,
            "workplace_patterns": workplace_event_counts,
            "total_events": len(phone_behaviors) + len(workplace_data)
        }
    except Exception as e:
        logger.error(f"Error getting behavior summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def check_behavior_triggers(db: AsyncIOMotorDatabase, user_id: str, event_type: str):
    """Check if behavior should trigger a nudge"""
    from nudge_engine import create_nudge
    
    # Get recent behaviors to detect patterns
    recent_cutoff = datetime.utcnow() - timedelta(minutes=30)
    recent_behaviors = await db.phone_behaviors.find({
        "user_id": user_id,
        "timestamp": {"$gte": recent_cutoff}
    }).to_list(100)
    
    # Context-switch fatigue: rapid app switches
    if event_type == "app_switch":
        switch_count = sum(1 for b in recent_behaviors if b["event_type"] == "app_switch")
        if switch_count >= 5:
            await create_nudge(db, user_id, "context_switch", {
                "switch_count": switch_count
            })
    
    # Energy drift: repeated pickups
    if event_type == "pickup":
        pickup_count = sum(1 for b in recent_behaviors if b["event_type"] == "pickup")
        if pickup_count >= 8:
            await create_nudge(db, user_id, "energy_drift", {
                "pickup_count": pickup_count
            })
    
    # Late night usage
    if event_type == "late_night":
        await create_nudge(db, user_id, "boundary", {
            "time": datetime.utcnow().isoformat()
        })
