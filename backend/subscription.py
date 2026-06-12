from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os
import httpx
from models import User, SubscriptionStatus
from auth import get_current_user
import logging

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Get MongoDB connection
mongo_url = os.getenv('MONGO_URL')
if not mongo_url:
    raise RuntimeError("MONGO_URL environment variable is not set")
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
    current_user: User = Depends(get_current_user)
):
    """Optimistic UI bridge after a purchase, backed by a server-side RC check.

    The client calls this immediately after RevenueCat confirms the entitlement
    (getCustomerInfo), so the user gets instant access while the RevenueCat
    webhook makes its way to /webhooks/revenuecat. This endpoint is NOT
    authoritative: it does NOT write subscription_status or subscription_ends.
    The webhook is the single source of truth for durable subscription state.

    Before opening the optimistic window, we verify the "premium" entitlement
    server-side via the RevenueCat REST subscribers endpoint (using the SECRET
    key from env — never the public SDK key). This closes the re-POST loophole:
      - RC confirms entitled        -> open the short optimistic window.
      - RC responds, NOT entitled   -> grant nothing.
      - RC error/timeout/no key     -> FAIL OPEN (open the window anyway) so the
                                       purchase UX never hard-depends on RC
                                       availability. Logged. ~3s timeout.
    """
    secret = os.getenv("REVENUECAT_SECRET_API_KEY")
    app_user_id = current_user.revenuecat_app_user_id or current_user.id

    rc_entitled = None  # None = undeterminable (no key / error / timeout) -> fail open
    if secret:
        try:
            async with httpx.AsyncClient(timeout=3.0) as hc:
                resp = await hc.get(
                    f"https://api.revenuecat.com/v1/subscribers/{app_user_id}",
                    headers={"Authorization": f"Bearer {secret}"},
                )
            if resp.status_code == 200:
                ents = ((resp.json().get("subscriber") or {}).get("entitlements") or {})
                prem = ents.get("premium")
                if not prem:
                    rc_entitled = False
                else:
                    exp = prem.get("expires_date")
                    if exp is None:
                        rc_entitled = True  # lifetime
                    else:
                        try:
                            exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00")).replace(tzinfo=None)
                            rc_entitled = exp_dt > datetime.utcnow()  # tz-naive, Mongo convention
                        except Exception:
                            rc_entitled = True
            else:
                logger.warning(f"/activate: RC returned {resp.status_code} for {app_user_id}; failing open")
        except Exception as e:
            logger.warning(f"/activate: RC entitlement check failed ({e}); failing open")
    else:
        logger.warning("/activate: REVENUECAT_SECRET_API_KEY not set; failing open")

    # RC explicitly says no active entitlement -> grant nothing.
    if rc_entitled is False:
        return {
            "status": "not_entitled",
            "message": "No active subscription found for this account.",
        }

    # Verified entitled, or RC undeterminable (fail open): open the optimistic
    # window. Durable ACTIVE only ever comes from the webhook.
    premium_pending_until = datetime.utcnow() + timedelta(minutes=15)  # tz-naive, Mongo convention
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"premium_pending_until": premium_pending_until}},
    )
    return {
        "status": "pending_confirmation",
        "premium_pending_until": premium_pending_until,
        "message": "Access granted while we confirm your subscription.",
    }

@router.post("/cancel")
async def cancel_subscription(
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
    current_user: User = Depends(get_current_user)
):
    """Lazy safety-net for the trial-end transition (the daily cron is the
    source of truth). Canonical check: now > trial_ends. On expiry the user
    moves to trial_lockin_required (paywall locks; data preserved)."""
    if current_user.subscription_status == SubscriptionStatus.TRIAL:
        if current_user.trial_ends and datetime.utcnow() > current_user.trial_ends:
            await db.users.update_one(
                {"id": current_user.id},
                {"$set": {
                    "subscription_status": SubscriptionStatus.TRIAL_LOCKIN_REQUIRED,
                    "status_changed_at": datetime.utcnow(),
                }},
            )
            return {
                "trial_expired": True,
                "subscription_status": SubscriptionStatus.TRIAL_LOCKIN_REQUIRED,
                "message": "Your trial has ended. Continue with Koan to keep going.",
            }

    return {
        "trial_expired": current_user.subscription_status in (
            SubscriptionStatus.TRIAL_LOCKIN_REQUIRED,
            SubscriptionStatus.EXPIRED,
            SubscriptionStatus.ARCHIVED,
        ),
        "subscription_status": current_user.subscription_status,
    }
