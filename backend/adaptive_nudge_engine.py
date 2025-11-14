"""
Koan Adaptive Nudge Engine

Replaces rigid rules with an adaptive, context-aware system that fires nudges
only when signals and user patterns indicate the moment is appropriate.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class SignalType(str, Enum):
    """Candidate signal types that can trigger nudges"""
    EXCESSIVE_PICKUPS = "excessive_pickups"
    LONG_SCREEN_SESSION = "long_screen_session"
    RAPID_APP_SWITCHING = "rapid_app_switching"
    EXTENDED_INACTIVITY = "extended_inactivity"
    MORNING_UNLOCK = "morning_unlock"
    LATE_NIGHT_USE = "late_night_use"
    BREAK_RETURN = "break_return"
    RE_ENTRY_MOMENT = "re_entry_moment"
    FOCUS_BOUNDARY = "focus_boundary"


@dataclass
class Signal:
    """Represents a candidate signal for nudge"""
    signal_type: SignalType
    strength: float  # 0.0 to 1.0
    timestamp: datetime
    metadata: Dict


@dataclass
class NudgeWeight:
    """Dynamic weight for a signal type"""
    signal_type: SignalType
    base_weight: float = 1.0
    pattern_multiplier: float = 1.0  # Increases with pattern consistency
    effectiveness_multiplier: float = 1.0  # Decreases with dismissals
    time_of_day_multiplier: float = 1.0  # Based on historical effectiveness
    
    @property
    def total_weight(self) -> float:
        return self.base_weight * self.pattern_multiplier * self.effectiveness_multiplier * self.time_of_day_multiplier


# Calm, neutral nudge messages following Koan voice
NUDGE_MESSAGES = {
    SignalType.EXCESSIVE_PICKUPS: [
        "Pause. Notice what you're reaching for.",
        "Take one breath before continuing.",
        "Hold this space for what matters.",
    ],
    SignalType.LONG_SCREEN_SESSION: [
        "Let your body reset for a moment.",
        "Take one breath before continuing.",
    ],
    SignalType.RAPID_APP_SWITCHING: [
        "Choose the next step before moving again.",
        "Pause. Notice what you're reaching for.",
    ],
    SignalType.EXTENDED_INACTIVITY: [
        "Start with the simplest next action.",
        "You know the next step.",
    ],
    SignalType.MORNING_UNLOCK: [
        "Set one quiet intention for today.",
        "Choose the next step before moving again.",
    ],
    SignalType.LATE_NIGHT_USE: [
        "If it's not urgent, tomorrow will be faster.",
        "Let your body reset for a moment.",
    ],
    SignalType.BREAK_RETURN: [
        "Carry one clear thought from your break into this moment.",
        "Start with the simplest next action.",
    ],
    SignalType.RE_ENTRY_MOMENT: [
        "Return to what you meant to do.",
        "Choose the next step before moving again.",
    ],
    SignalType.FOCUS_BOUNDARY: [
        "Hold this space for what matters.",
        "Set one quiet intention for today.",
    ],
}

# Fallback nudges when no signal fires within 36 hours
FALLBACK_NUDGES = [
    "You know the next step.",
    "Return to what you meant to do.",
    "One small action is enough.",
]


class AdaptiveNudgeEngine:
    """
    Core adaptive nudge engine that evaluates signals and decides when to fire nudges
    based on context, patterns, and user behavior.
    """
    
    # Global nudge limits (HARD RULES)
    MAX_NUDGES_PER_DAY = 3
    MIN_MINUTES_BETWEEN_NUDGES = 60
    QUIET_HOURS_START = 23  # 23:00
    QUIET_HOURS_END = 7     # 07:00
    SIMILAR_NUDGE_COOLDOWN_HOURS = 2
    FALLBACK_NUDGE_THRESHOLD_HOURS = 36
    
    def __init__(self, db):
        self.db = db
        self.weights_collection = db["nudge_weights"]
        self.nudge_history_collection = db["nudge_history"]
        
    async def evaluate_signal(self, user_id: str, signal: Signal) -> Optional[Dict]:
        """
        Evaluate a candidate signal and decide whether to fire a nudge.
        
        Returns nudge data if should fire, None otherwise.
        """
        # Check global constraints first
        if not await self._can_send_nudge(user_id, signal.timestamp):
            return None
            
        # Get adaptive weight for this signal type
        weight = await self._get_signal_weight(user_id, signal.signal_type, signal.timestamp)
        
        # Calculate final score
        score = signal.strength * weight.total_weight
        
        # Threshold for firing (can be tuned)
        threshold = 0.6
        
        if score > threshold:
            # Select best message for this signal
            message = await self._select_nudge_message(user_id, signal.signal_type)
            
            # Create nudge
            nudge = {
                "user_id": user_id,
                "signal_type": signal.signal_type,
                "message": message,
                "score": score,
                "timestamp": signal.timestamp,
                "metadata": signal.metadata,
            }
            
            # Record this nudge
            await self._record_nudge(user_id, nudge)
            
            return nudge
            
        return None
    
    async def check_fallback_nudge(self, user_id: str) -> Optional[Dict]:
        """
        Check if fallback nudge should be sent (no nudges in 36 hours).
        """
        # Get last nudge time
        last_nudge = await self.nudge_history_collection.find_one(
            {"user_id": user_id},
            sort=[("timestamp", -1)]
        )
        
        if not last_nudge:
            return None
            
        hours_since_last = (datetime.utcnow() - last_nudge["timestamp"]).total_seconds() / 3600
        
        if hours_since_last >= self.FALLBACK_NUDGE_THRESHOLD_HOURS:
            # Check if we can send nudge now
            if await self._can_send_nudge(user_id, datetime.utcnow()):
                import random
                message = random.choice(FALLBACK_NUDGES)
                
                nudge = {
                    "user_id": user_id,
                    "signal_type": "fallback",
                    "message": message,
                    "score": 0.5,
                    "timestamp": datetime.utcnow(),
                    "metadata": {"type": "fallback"},
                }
                
                await self._record_nudge(user_id, nudge)
                return nudge
                
        return None
    
    async def _can_send_nudge(self, user_id: str, timestamp: datetime) -> bool:
        """Check if we can send a nudge based on global constraints."""
        # Check quiet hours
        hour = timestamp.hour
        if self.QUIET_HOURS_START <= hour or hour < self.QUIET_HOURS_END:
            # Exception for morning intention nudge
            if hour >= self.QUIET_HOURS_END and hour < 8:
                pass  # Allow morning nudges
            else:
                return False
        
        # Check daily limit
        today_start = datetime.combine(timestamp.date(), datetime.min.time())
        nudges_today = await self.nudge_history_collection.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": today_start}
        })
        
        if nudges_today >= self.MAX_NUDGES_PER_DAY:
            return False
        
        # Check minimum time between nudges
        last_nudge = await self.nudge_history_collection.find_one(
            {"user_id": user_id},
            sort=[("timestamp", -1)]
        )
        
        if last_nudge:
            minutes_since_last = (timestamp - last_nudge["timestamp"]).total_seconds() / 60
            if minutes_since_last < self.MIN_MINUTES_BETWEEN_NUDGES:
                return False
        
        return True
    
    async def _get_signal_weight(self, user_id: str, signal_type: SignalType, timestamp: datetime) -> NudgeWeight:
        """Get adaptive weight for a signal type."""
        # Try to get existing weight
        weight_doc = await self.weights_collection.find_one({
            "user_id": user_id,
            "signal_type": signal_type
        })
        
        if not weight_doc:
            # Initialize new weight
            return NudgeWeight(signal_type=signal_type)
        
        # Build weight from stored data
        weight = NudgeWeight(
            signal_type=signal_type,
            base_weight=weight_doc.get("base_weight", 1.0),
            pattern_multiplier=weight_doc.get("pattern_multiplier", 1.0),
            effectiveness_multiplier=weight_doc.get("effectiveness_multiplier", 1.0),
            time_of_day_multiplier=await self._get_time_of_day_multiplier(
                user_id, signal_type, timestamp.hour
            )
        )
        
        return weight
    
    async def _get_time_of_day_multiplier(self, user_id: str, signal_type: SignalType, hour: int) -> float:
        """Calculate time-of-day effectiveness multiplier based on history."""
        # Get historical effectiveness for this signal type at this hour
        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "signal_type": signal_type,
                }
            },
            {
                "$project": {
                    "hour": {"$hour": "$timestamp"},
                    "dismissed": 1,
                    "engaged": 1
                }
            },
            {
                "$match": {
                    "hour": {"$gte": hour - 1, "$lte": hour + 1}  # Hour window
                }
            }
        ]
        
        results = await self.nudge_history_collection.aggregate(pipeline).to_list(length=100)
        
        if not results:
            return 1.0
        
        # Calculate effectiveness (engaged / total)
        total = len(results)
        engaged = sum(1 for r in results if r.get("engaged", False))
        dismissed = sum(1 for r in results if r.get("dismissed", False))
        
        if total == 0:
            return 1.0
        
        effectiveness = (engaged - dismissed * 0.5) / total
        
        # Map to multiplier (0.5 to 1.5)
        multiplier = 0.5 + effectiveness
        return max(0.5, min(1.5, multiplier))
    
    async def _select_nudge_message(self, user_id: str, signal_type: SignalType) -> str:
        """Select best message for this signal type."""
        messages = NUDGE_MESSAGES.get(signal_type, FALLBACK_NUDGES)
        
        # Get message history to avoid repetition
        recent_nudges = await self.nudge_history_collection.find(
            {"user_id": user_id},
            sort=[("timestamp", -1)],
            limit=10
        ).to_list(length=10)
        
        recent_messages = {n["message"] for n in recent_nudges}
        
        # Prefer messages not recently used
        fresh_messages = [m for m in messages if m not in recent_messages]
        
        if fresh_messages:
            import random
            return random.choice(fresh_messages)
        
        import random
        return random.choice(messages)
    
    async def _record_nudge(self, user_id: str, nudge: Dict):
        """Record a nudge in history."""
        await self.nudge_history_collection.insert_one({
            "user_id": user_id,
            "signal_type": nudge["signal_type"],
            "message": nudge["message"],
            "score": nudge["score"],
            "timestamp": nudge["timestamp"],
            "metadata": nudge.get("metadata", {}),
            "dismissed": False,
            "engaged": False,
        })
    
    async def record_nudge_interaction(self, user_id: str, nudge_id: str, action: str):
        """
        Record user interaction with a nudge (dismissed, engaged, ignored).
        Updates adaptive weights based on user response.
        """
        # Update nudge record
        await self.nudge_history_collection.update_one(
            {"_id": nudge_id, "user_id": user_id},
            {
                "$set": {
                    action: True,
                    "interaction_time": datetime.utcnow()
                }
            }
        )
        
        # Get nudge details
        nudge = await self.nudge_history_collection.find_one({"_id": nudge_id})
        
        if not nudge:
            return
        
        signal_type = nudge["signal_type"]
        
        # Update effectiveness multiplier
        weight_doc = await self.weights_collection.find_one({
            "user_id": user_id,
            "signal_type": signal_type
        })
        
        if not weight_doc:
            weight_doc = {
                "user_id": user_id,
                "signal_type": signal_type,
                "effectiveness_multiplier": 1.0
            }
        
        # Adjust effectiveness based on action
        if action == "dismissed":
            # Decrease weight slightly
            weight_doc["effectiveness_multiplier"] = max(0.3, weight_doc.get("effectiveness_multiplier", 1.0) * 0.9)
        elif action == "engaged":
            # Increase weight slightly
            weight_doc["effectiveness_multiplier"] = min(1.5, weight_doc.get("effectiveness_multiplier", 1.0) * 1.1)
        
        # Save updated weight
        await self.weights_collection.update_one(
            {"user_id": user_id, "signal_type": signal_type},
            {"$set": weight_doc},
            upsert=True
        )
    
    async def update_pattern_multiplier(self, user_id: str, signal_type: SignalType, pattern_detected: bool):
        """
        Update pattern multiplier when a pattern is detected or broken.
        Called by behavioral monitoring.
        """
        weight_doc = await self.weights_collection.find_one({
            "user_id": user_id,
            "signal_type": signal_type
        })
        
        if not weight_doc:
            weight_doc = {
                "user_id": user_id,
                "signal_type": signal_type,
                "pattern_multiplier": 1.0
            }
        
        if pattern_detected:
            # Increase pattern multiplier (consistent pattern)
            weight_doc["pattern_multiplier"] = min(1.5, weight_doc.get("pattern_multiplier", 1.0) * 1.05)
        else:
            # Decrease pattern multiplier (pattern broken)
            weight_doc["pattern_multiplier"] = max(0.7, weight_doc.get("pattern_multiplier", 1.0) * 0.95)
        
        await self.weights_collection.update_one(
            {"user_id": user_id, "signal_type": signal_type},
            {"$set": weight_doc},
            upsert=True
        )


# Signal detection functions with exact thresholds

def detect_excessive_pickups(events: List[Dict]) -> Optional[Signal]:
    """Detect excessive pickups: >5 pickups in 10 min"""
    recent_events = [e for e in events if e["event_type"] == "phone_pickup"]
    
    if len(recent_events) < 5:
        return None
    
    # Check if 5+ pickups in 10 min window
    window_start = datetime.utcnow() - timedelta(minutes=10)
    pickups_in_window = [e for e in recent_events if e["timestamp"] >= window_start]
    
    if len(pickups_in_window) > 5:
        strength = min(1.0, len(pickups_in_window) / 10.0)
        return Signal(
            signal_type=SignalType.EXCESSIVE_PICKUPS,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"pickup_count": len(pickups_in_window)}
        )
    
    return None


def detect_long_screen_session(session_duration_minutes: float) -> Optional[Signal]:
    """Detect long screen session: >15 minutes continuous screen-on"""
    if session_duration_minutes > 15:
        strength = min(1.0, session_duration_minutes / 30.0)
        return Signal(
            signal_type=SignalType.LONG_SCREEN_SESSION,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"session_minutes": session_duration_minutes}
        )
    return None


def detect_rapid_app_switching(events: List[Dict]) -> Optional[Signal]:
    """Detect rapid app switching: >4 app switches in 60 sec"""
    recent_switches = [e for e in events if e["event_type"] == "app_switch"]
    
    window_start = datetime.utcnow() - timedelta(seconds=60)
    switches_in_window = [e for e in recent_switches if e["timestamp"] >= window_start]
    
    if len(switches_in_window) > 4:
        strength = min(1.0, len(switches_in_window) / 8.0)
        return Signal(
            signal_type=SignalType.RAPID_APP_SWITCHING,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"switch_count": len(switches_in_window)}
        )
    
    return None


def detect_extended_inactivity(last_activity_minutes: float) -> Optional[Signal]:
    """Detect extended inactivity: no steps/motion for 45 min"""
    if last_activity_minutes > 45:
        strength = min(1.0, last_activity_minutes / 90.0)
        return Signal(
            signal_type=SignalType.EXTENDED_INACTIVITY,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"inactive_minutes": last_activity_minutes}
        )
    return None


def detect_morning_unlock(unlock_time: datetime, alarm_or_dnd_end: datetime) -> Optional[Signal]:
    """Detect morning unlock: first unlock within 2-4 min after alarm or DND end"""
    minutes_after = (unlock_time - alarm_or_dnd_end).total_seconds() / 60
    
    if 2 <= minutes_after <= 4:
        strength = 1.0
        return Signal(
            signal_type=SignalType.MORNING_UNLOCK,
            strength=strength,
            timestamp=unlock_time,
            metadata={"minutes_after_alarm": minutes_after}
        )
    
    return None


def detect_late_night_use(current_time: datetime) -> Optional[Signal]:
    """Detect late-night use: screen activity after 22:00"""
    if current_time.hour >= 22:
        # Strength increases as it gets later
        strength = min(1.0, (current_time.hour - 22) / 3.0 + 0.3)
        return Signal(
            signal_type=SignalType.LATE_NIGHT_USE,
            strength=strength,
            timestamp=current_time,
            metadata={"hour": current_time.hour}
        )
    
    return None


def detect_break_return(idle_minutes: float, steps: int, unlocked: bool) -> Optional[Signal]:
    """Detect break return: idle >20 min → walking >100 steps → unlock"""
    if idle_minutes > 20 and steps > 100 and unlocked:
        strength = min(1.0, steps / 200.0)
        return Signal(
            signal_type=SignalType.BREAK_RETURN,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"idle_minutes": idle_minutes, "steps": steps}
        )
    
    return None


def detect_re_entry_moment(idle_minutes: float, unlocked: bool) -> Optional[Signal]:
    """Detect re-entry moment: idle >60 min → immediate unlock"""
    if idle_minutes > 60 and unlocked:
        strength = min(1.0, idle_minutes / 120.0)
        return Signal(
            signal_type=SignalType.RE_ENTRY_MOMENT,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"idle_minutes": idle_minutes}
        )
    
    return None


def detect_focus_boundary(focus_mode_activated: bool) -> Optional[Signal]:
    """Detect focus boundary: user activates Do Not Disturb / Focus mode"""
    if focus_mode_activated:
        strength = 1.0
        return Signal(
            signal_type=SignalType.FOCUS_BOUNDARY,
            strength=strength,
            timestamp=datetime.utcnow(),
            metadata={"focus_activated": True}
        )
    
    return None
