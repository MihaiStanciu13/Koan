from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

class MicroMode(str, Enum):
    STANDARD = "standard"
    WHISPER = "whisper"


def normalize_micro_mode(value) -> str:
    """Map any stored micro_mode to the current two-value set.

    Legacy "focus" and "meeting" values (removed in Phase 1d) collapse to
    "standard". Used for lazy migration on read and as a safety net in gating.
    """
    return value if value in ("standard", "whisper") else "standard"

class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    TRIAL_LOCKIN_REQUIRED = "trial_lockin_required"  # 14-day app trial elapsed; paywall locks
    ACTIVE = "active"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    ARCHIVED = "archived"  # 90-day soft-archive; data preserved, restored on return

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
    # Subscription lifecycle (Phase 1e-1)
    revenuecat_app_user_id: Optional[str] = None  # RC app_user_id (== id unless transferred/aliased)
    product_id: Optional[str] = None              # current entitlement product (koan_monthly/yearly/lifetime)
    cancelled_at: Optional[datetime] = None       # set on RC CANCELLATION; access continues to subscription_ends
    status_changed_at: Optional[datetime] = None  # when the current status was entered (drives the 90-day archive timer)
    archived: bool = False
    archived_at: Optional[datetime] = None
    pre_archive_status: Optional[str] = None       # status to restore to on unarchive

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
    anchor_action: str = "close one loop"
    anchor_actions: List[Dict] = []  # List of anchor actions with text, time, enabled
    quiet_periods: List[Dict] = []  # Learned periods when user focuses
    connected_tools: List[str] = []  # gmail, outlook, slack, etc.
    notification_enabled: bool = True
    nudge_style: str = "silent"  # silent, subtle, time-sensitive
    quiet_hours_enabled: bool = True
    quiet_hours_start: str = "23:00"
    quiet_hours_end: str = "07:00"
    tz_offset: int = 0  # minutes east of UTC; last reported by the client (today-card)
    last_koan_push_week: Optional[str] = None  # "YYYY-WW" of the last Sunday koan push
    story_viewed: bool = False

class PreferencesUpdate(BaseModel):
    micro_mode: Optional[MicroMode] = None
    anchor_action: Optional[str] = None
    anchor_actions: Optional[List[Dict]] = None
    connected_tools: Optional[List[str]] = None
    notification_enabled: Optional[bool] = None
    nudge_style: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    story_viewed: Optional[bool] = None

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
    featured_at: Optional[datetime] = None  # set when surfaced as the home "Today" card; excluded from the feed

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
    # Sleep detail
    sleep_deep_minutes: Optional[float] = None       # deep sleep stage duration
    sleep_rem_minutes: Optional[float] = None         # REM stage duration
    sleep_core_minutes: Optional[float] = None        # core/light sleep stage duration
    sleep_efficiency: Optional[float] = None          # sleep efficiency percentage 0-100
    # Recovery
    spo2_avg: Optional[float] = None                  # average blood oxygen during sleep
    respiratory_rate_avg: Optional[float] = None      # avg breaths per minute during sleep
    # Activity
    workout_minutes: Optional[float] = None           # total workout duration for the day
    mindful_minutes: Optional[float] = None           # mindfulness/meditation minutes
    # Expanded HealthKit signals
    resting_energy_kcal: Optional[float] = None        # basal/resting energy burned
    hourly_steps: Optional[List[int]] = None           # 24-element array, steps per hour
    wake_time: Optional[str] = None                    # HH:MM, end of last sleep interval
    stand_hours: Optional[int] = None                  # Apple Watch stand hours
    walking_hr_avg: Optional[float] = None             # average walking heart rate (bpm)
    vo2_max: Optional[float] = None                    # cardiovascular fitness (mL/kg/min)
    audio_exposure_db_avg: Optional[float] = None      # avg environmental sound level (dB)
    # Screen Time (refined)
    real_pickups: Optional[int] = None                # actual pickup count from DeviceActivity

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
    sleep_deep_minutes: Optional[float] = None
    sleep_rem_minutes: Optional[float] = None
    sleep_core_minutes: Optional[float] = None
    sleep_efficiency: Optional[float] = Field(None, ge=0, le=100)
    spo2_avg: Optional[float] = Field(None, ge=50, le=100)
    respiratory_rate_avg: Optional[float] = Field(None, ge=0, le=60)
    workout_minutes: Optional[float] = None
    mindful_minutes: Optional[float] = None
    # Expanded HealthKit signals
    resting_energy_kcal: Optional[float] = Field(None, ge=0, le=10000)
    hourly_steps: Optional[List[int]] = None
    wake_time: Optional[str] = None
    stand_hours: Optional[int] = Field(None, ge=0, le=24)
    walking_hr_avg: Optional[float] = Field(None, ge=20, le=250)
    vo2_max: Optional[float] = Field(None, ge=0, le=100)
    audio_exposure_db_avg: Optional[float] = Field(None, ge=0, le=200)
    real_pickups: Optional[int] = Field(None, ge=0, le=1000)
