from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import uuid
import certifi
import httpx
from models import UserCreate, UserLogin, User, SubscriptionStatus, Preferences, MicroMode, _utcnow

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Get MongoDB connection
mongo_url = os.getenv('MONGO_URL')
if not mongo_url:
    raise RuntimeError("MONGO_URL environment variable is not set")
db_name = os.getenv('DB_NAME', 'behavioral_nudge_db')
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[db_name]

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set")
ALGORITHM = "HS256"
# ACCESS_TOKEN_EXPIRE_DAYS — set this env var in Railway (recommended: 7 for mobile apps)
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = _utcnow() + expires_delta
    else:
        expire = _utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    # Auto-unarchive a returning user: data was never deleted, so "restoration"
    # is just clearing the flag and restoring their pre-archive status (they land
    # on the paywall and can resubscribe).
    if user.get("archived"):
        restored = user.get("pre_archive_status") or SubscriptionStatus.EXPIRED.value
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"subscription_status": restored, "archived": False,
                      "archived_at": None, "status_changed_at": _utcnow()}},
        )
        user["subscription_status"] = restored
        user["archived"] = False
        user["archived_at"] = None

    return User(**user)


def _has_optimistic_premium(current_user: User, now) -> bool:
    """True during the short optimistic window opened by /subscription/activate,
    before the RevenueCat webhook confirms ACTIVE. Auto-expires (15-min TTL set
    on the flag); never produces durable premium on its own. Naive-UTC compare."""
    pending = getattr(current_user, "premium_pending_until", None)
    return pending is not None and now <= pending


async def require_active_subscription(current_user: User = Depends(get_current_user)):
    """Single canonical access gate.

    Source of truth for the trial is the stored `trial_ends` date (now > trial_ends).
    The previous days_elapsed-vs-30 branch is removed.

    Premium access is granted when EITHER subscription_status == ACTIVE
    (webhook-authoritative, durable) OR premium_pending_until is in the future
    (optimistic bridge after a verified purchase, auto-expiring).

    All datetimes here are naive UTC (the Mongo convention): stored fields come
    back naive from motor, and `now` is _utcnow().
    """
    status = current_user.subscription_status
    now = _utcnow()

    if status == SubscriptionStatus.ACTIVE or _has_optimistic_premium(current_user, now):
        return current_user

    if status == SubscriptionStatus.TRIAL:
        trial_ends = current_user.trial_ends
        # No end date (legacy) or still within the window -> allow.
        if trial_ends is None or now <= trial_ends:
            return current_user
        raise HTTPException(status_code=402, detail="Your trial has ended. Continue with Koan to keep going.")

    if status == SubscriptionStatus.CANCELLED:
        # Grace period: access continues until the paid period ends.
        sub_ends = current_user.subscription_ends
        if sub_ends and now <= sub_ends:
            return current_user
        raise HTTPException(status_code=402, detail="Your subscription has ended. Resubscribe to continue.")

    # trial_lockin_required, expired, archived (archived is auto-cleared above) -> blocked.
    raise HTTPException(status_code=402, detail="Subscribe to continue.")

def validate_password(password: str) -> tuple[bool, str]:
    """Validate password meets security requirements"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    if not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/" for c in password):
        return False, "Password must contain at least one special character"
    return True, "Password is valid"

@router.post("/signup")
async def signup(user_data: UserCreate):
    # Validate password
    is_valid, message = validate_password(user_data.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    user_id = str(uuid.uuid4())
    trial_start = _utcnow()
    trial_ends = trial_start + timedelta(days=14)

    user = User(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        hashed_password=hash_password(user_data.password),
        subscription_status=SubscriptionStatus.TRIAL,
        trial_start=trial_start,
        trial_ends=trial_ends
    )
    
    await db.users.insert_one(user.dict())
    
    # Create default preferences
    from models import Preferences, MicroMode
    preferences = Preferences(user_id=user_id, micro_mode=MicroMode.STANDARD)
    await db.preferences.insert_one(preferences.dict())
    
    # Create access token
    access_token = create_access_token(data={"sub": user_id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "subscription_status": user.subscription_status,
            "trial_ends": user.trial_ends
        }
    }

@router.post("/login")
async def login(user_data: UserLogin):
    # Find user
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    # Create access token
    access_token = create_access_token(data={"sub": user["id"]})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "subscription_status": user["subscription_status"],
            "trial_ends": user.get("trial_ends")
        }
    }

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "subscription_status": current_user.subscription_status,
        "trial_ends": current_user.trial_ends
    }

@router.delete("/account")
async def purge_user_data(database, user_id: str) -> dict:
    """Hard-delete a user and all their owned data. Single source of truth for
    both account deletion and the archived-data hard-delete cron, so the
    collection list never diverges. Idempotent; returns per-collection counts."""
    counts = {"users": (await database.users.delete_one({"id": user_id})).deleted_count}
    for coll in ("preferences", "behavior_events", "nudges",
                 "health_signals", "phone_behaviors", "api_usage"):
        counts[coll] = (await database[coll].delete_many({"user_id": user_id})).deleted_count
    return counts


async def delete_account(current_user: User = Depends(get_current_user)):
    await purge_user_data(db, current_user.id)
    return {"message": "Account deleted"}


# ── Google SSO ────────────────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    access_token: str

@router.post("/google")
async def google_auth(data: GoogleAuthRequest):
    """Exchange a Google OAuth access token for a Koan JWT.

    The frontend sends the access_token obtained from expo-auth-session.
    We verify it with Google's userinfo endpoint, then find-or-create the user.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            params={"access_token": data.access_token},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google access token")

    google_user = resp.json()
    google_id = google_user.get("id")
    email = google_user.get("email")
    name = google_user.get("name") or google_user.get("given_name") or "Koan User"

    if not google_id or not email:
        raise HTTPException(status_code=401, detail="Google token missing required fields")

    # Find existing user by google_id first, then by email
    user = await db.users.find_one({"google_id": google_id})
    if not user:
        user = await db.users.find_one({"email": email})

    if user:
        # Link google_id if this is the first Google login for an existing account
        if not user.get("google_id"):
            await db.users.update_one({"id": user["id"]}, {"$set": {"google_id": google_id}})
    else:
        # Create new user
        user_id = str(uuid.uuid4())
        trial_start = _utcnow()
        trial_ends = trial_start + timedelta(days=14)
        new_user = User(
            id=user_id,
            email=email,
            name=name,
            hashed_password="",
            google_id=google_id,
            subscription_status=SubscriptionStatus.TRIAL,
            trial_start=trial_start,
            trial_ends=trial_ends,
        )
        await db.users.insert_one(new_user.dict())
        await db.preferences.insert_one(
            Preferences(user_id=user_id, micro_mode=MicroMode.STANDARD).dict()
        )
        user = new_user.dict()

    access_token = create_access_token(data={"sub": user["id"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "subscription_status": user["subscription_status"],
            "trial_ends": user.get("trial_ends"),
        },
    }


# ── Apple SSO ─────────────────────────────────────────────────────────────────
# Apple team ID and bundle ID are read from environment variables.
# TODO: Set APPLE_TEAM_ID and APPLE_BUNDLE_ID in Railway once the developer account is active.

class AppleAuthRequest(BaseModel):
    identity_token: str
    given_name: Optional[str] = None
    family_name: Optional[str] = None


def resolve_apple_name(given_name: Optional[str], family_name: Optional[str], email: Optional[str]) -> str:
    if given_name or family_name:
        full = f"{(given_name or '').strip()} {(family_name or '').strip()}".strip()
        if full:
            return full
    local = email.split('@')[0] if email else 'there'
    if local.endswith('.privaterelay'):
        local = local.replace('.privaterelay', '')
    return local.capitalize() or 'there'


@router.post("/apple")
async def apple_auth(data: AppleAuthRequest):
    """Exchange an Apple identity token for a Koan JWT.

    The frontend sends the identityToken from expo-apple-authentication.
    We verify it against Apple's public JWKS, then find-or-create the user.
    """
    # Fetch Apple's public keys
    async with httpx.AsyncClient() as client:
        jwks_resp = await client.get("https://appleid.apple.com/auth/keys")

    if jwks_resp.status_code != 200:
        raise HTTPException(status_code=503, detail="Could not fetch Apple public keys")

    jwks = jwks_resp.json()

    # Peek at the token header to select the right key
    try:
        header = jwt.get_unverified_header(data.identity_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed Apple identity token")

    kid = header.get("kid")
    apple_key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not apple_key:
        raise HTTPException(status_code=401, detail="Apple public key not found for token kid")

    # Bundle ID used as the JWT audience — set APPLE_BUNDLE_ID in Railway
    apple_bundle_id = os.getenv("APPLE_BUNDLE_ID", "com.koan.app")

    try:
        claims = jwt.decode(
            data.identity_token,
            apple_key,
            algorithms=["RS256"],
            audience=apple_bundle_id,
            issuer="https://appleid.apple.com",
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Apple token verification failed: {e}")

    apple_id = claims.get("sub")
    email = claims.get("email")

    if not apple_id:
        raise HTTPException(status_code=401, detail="Apple token missing sub claim")

    # Find existing user by apple_id first, then by email
    user = await db.users.find_one({"apple_id": apple_id})
    if not user and email:
        user = await db.users.find_one({"email": email})

    if user:
        if not user.get("apple_id"):
            await db.users.update_one({"id": user["id"]}, {"$set": {"apple_id": apple_id}})
    else:
        user_id = str(uuid.uuid4())
        trial_start = _utcnow()
        trial_ends = trial_start + timedelta(days=14)
        # Apple may withhold email on repeat sign-ins; use a private relay placeholder
        user_email = email or f"apple.{apple_id}@privaterelay.appleid.com"
        resolved_name = resolve_apple_name(data.given_name, data.family_name, user_email)
        new_user = User(
            id=user_id,
            email=user_email,
            name=resolved_name,
            hashed_password="",
            apple_id=apple_id,
            subscription_status=SubscriptionStatus.TRIAL,
            trial_start=trial_start,
            trial_ends=trial_ends,
        )
        await db.users.insert_one(new_user.dict())
        await db.preferences.insert_one(
            Preferences(user_id=user_id, micro_mode=MicroMode.STANDARD).dict()
        )
        user = new_user.dict()

    access_token = create_access_token(data={"sub": user["id"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "subscription_status": user["subscription_status"],
            "trial_ends": user.get("trial_ends"),
        },
    }
