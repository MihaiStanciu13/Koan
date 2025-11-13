from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os
from models import User, SubscriptionStatus
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

router = APIRouter(prefix="/subscription", tags=["subscription"])
logger = logging.getLogger(__name__)

# Mocked Stripe integration
MOCKED_STRIPE_PRICE_ID = "price_mock_monthly_subscription"
MOCKED_MONTHLY_PRICE = 9.99

@router.get("/status")
async def get_subscription_status(
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Get current subscription status"""
    trial_days_remaining = 0
    if current_user.trial_ends:
        days_left = (current_user.trial_ends - datetime.utcnow()).days
        trial_days_remaining = max(0, days_left)
    
    return {
        "status": current_user.subscription_status,
        "trial_ends": current_user.trial_ends,
        "trial_days_remaining": trial_days_remaining,
        "subscription_ends": current_user.subscription_ends,
        "monthly_price": MOCKED_MONTHLY_PRICE
    }

@router.post("/create-checkout")
async def create_checkout_session(
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Create a Stripe checkout session (mocked)"""
    # In production, this would create a real Stripe checkout session
    # For now, we return a mocked checkout URL
    
    return {
        "checkout_url": "https://checkout.stripe.com/mocked-session",
        "session_id": "mock_session_123456",
        "message": "This is a mocked Stripe checkout. In production, this would redirect to Stripe."
    }

@router.post("/activate")
async def activate_subscription(
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Activate subscription (mocked for testing)"""
    # In production, this would be called by Stripe webhook
    # For testing, we'll allow manual activation
    
    subscription_ends = datetime.utcnow() + timedelta(days=30)
    
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {
            "subscription_status": SubscriptionStatus.ACTIVE,
            "subscription_ends": subscription_ends
        }}
    )
    
    return {
        "status": "active",
        "subscription_ends": subscription_ends,
        "message": "Subscription activated successfully (mocked)"
    }

@router.post("/cancel")
async def cancel_subscription(
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Cancel subscription"""
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {
            "subscription_status": SubscriptionStatus.CANCELLED
        }}
    )
    
    return {
        "status": "cancelled",
        "message": "Subscription cancelled. Access will continue until the end of the billing period."
    }

@router.get("/check-trial")
async def check_trial_status(
    db: AsyncIOMotorDatabase,
    current_user: User = Depends(get_current_user)
):
    """Check if trial has expired and update status"""
    if current_user.subscription_status == SubscriptionStatus.TRIAL:
        if current_user.trial_ends and datetime.utcnow() > current_user.trial_ends:
            # Trial expired
            await db.users.update_one(
                {"id": current_user.id},
                {"$set": {"subscription_status": SubscriptionStatus.EXPIRED}}
            )
            return {
                "trial_expired": True,
                "message": "Your trial has ended. Please subscribe to continue."
            }
    
    return {
        "trial_expired": False,
        "subscription_status": current_user.subscription_status
    }
