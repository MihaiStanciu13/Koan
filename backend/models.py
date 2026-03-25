from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

class MicroMode(str, Enum):
    STANDARD = "standard"
    FOCUS = "focus"
    MEETING = "meeting"
    TRAVEL = "travel"

class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    CANCELLED = "cancelled"
    EXPIRED = "expired"

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: EmailStr
    name: str
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    subscription_status: SubscriptionStatus = SubscriptionStatus.TRIAL
    trial_start: datetime = Field(default_factory=datetime.utcnow)
    trial_ends: Optional[datetime] = None
    subscription_ends: Optional[datetime] = None
    push_token: Optional[str] = None  # Expo push notification token
    google_calendar_token: Optional[str] = None  # Google OAuth access token
    google_calendar_refresh_token: Optional[str] = None  # Google OAuth refresh token

# Behavioral Data Models
class PhoneBehavior(BaseModel):
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    event_type: str  # pickup, inactivity, long_session, app_switch, late_night
    metadata: Dict = {}

class WorkplaceData(BaseModel):
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str  # gmail, outlook, slack, teams, calendar
    event_type: str  # email_spike, meeting_density, unread_pileup
    metadata: Dict = {}

# Preferences Models
class Preferences(BaseModel):
    user_id: str
    micro_mode: MicroMode = MicroMode.STANDARD
    whisper_mode: bool = False
    anchor_action: str = "close one loop"
    anchor_actions: List[Dict] = []  # List of anchor actions with text, time, enabled
    quiet_periods: List[Dict] = []  # Learned periods when user focuses
    connected_tools: List[str] = []  # gmail, outlook, slack, etc.
    notification_enabled: bool = True
    nudge_style: str = "silent"  # silent, subtle, time-sensitive
    quiet_hours_enabled: bool = True
    quiet_hours_start: str = "23:00"
    quiet_hours_end: str = "07:00"

class PreferencesUpdate(BaseModel):
    micro_mode: Optional[MicroMode] = None
    whisper_mode: Optional[bool] = None
    anchor_action: Optional[str] = None
    anchor_actions: Optional[List[Dict]] = None
    notification_enabled: Optional[bool] = None
    nudge_style: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None

# Nudge Models
class Nudge(BaseModel):
    id: str
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    nudge_type: str  # focus, meeting_recovery, boundary, energy_drift, context_switch
    message: str
    explanation: str
    delivered: bool = False
    opened: bool = False
    action_taken: Optional[str] = None

class NudgeResponse(BaseModel):
    nudge_id: str
    action: str  # opened, dismissed, anchor_action_completed

# Pattern Models
class WeeklyNarrative(BaseModel):
    user_id: str
    week_start: datetime
    narrative: str
    patterns_detected: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
