from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

class MicroMode(str, Enum):
    STANDARD = "standard"
    FOCUS = "focus"
    MEETING = "meeting"
    WHISPER = "whisper"

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
    google_id: Optional[str] = None  # Google SSO user ID
    apple_id: Optional[str] = None  # Apple SSO user ID

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
    connected_tools: Optional[List[str]] = None
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
    silent: bool = False  # True when nudge_style is "silent" — delivered without sound

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

# Health Signal Models
class HealthSignal(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    recorded_at: datetime = Field(default_factory=datetime.utcnow)
    # Movement
    steps: Optional[int] = None
    walking_running_distance_km: Optional[float] = None
    flights_climbed: Optional[int] = None
    exercise_minutes: Optional[int] = None
    active_energy_kcal: Optional[float] = None
    # Sleep
    sleep_duration_minutes: Optional[int] = None
    sleep_start: Optional[str] = None
    sleep_end: Optional[str] = None
    # Phone behaviour
    first_pickup_time: Optional[str] = None
    total_pickups: Optional[int] = None
    total_screen_time_minutes: Optional[int] = None
    social_media_minutes: Optional[int] = None
    productivity_minutes: Optional[int] = None
    notification_count: Optional[int] = None
    # Body (wearable, optional)
    resting_heart_rate: Optional[int] = None
    hrv_ms: Optional[float] = None
    # Location (opt-in)
    location_variety: Optional[int] = None  # distinct places visited
    time_outdoors_minutes: Optional[int] = None

class HealthSignalCreate(BaseModel):
    date: str
    steps: Optional[int] = Field(None, ge=0, le=100000)
    walking_running_distance_km: Optional[float] = None
    flights_climbed: Optional[int] = None
    exercise_minutes: Optional[int] = None
    active_energy_kcal: Optional[float] = None
    sleep_duration_minutes: Optional[int] = Field(None, ge=0, le=960)
    sleep_start: Optional[str] = None
    sleep_end: Optional[str] = None
    first_pickup_time: Optional[str] = None
    total_pickups: Optional[int] = Field(None, ge=0, le=1000)
    total_screen_time_minutes: Optional[int] = Field(None, ge=0, le=1440)
    social_media_minutes: Optional[int] = None
    productivity_minutes: Optional[int] = None
    notification_count: Optional[int] = None
    resting_heart_rate: Optional[int] = Field(None, ge=20, le=250)
    hrv_ms: Optional[float] = Field(None, ge=0, le=300)
    location_variety: Optional[int] = None
    time_outdoors_minutes: Optional[int] = None
