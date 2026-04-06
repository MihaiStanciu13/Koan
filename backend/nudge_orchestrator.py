"""
Koan Nudge Orchestrator

The single layer that sits above both nudge engines and owns all delivery
decisions.  Server code and the scheduler call orchestrate(); neither the
pattern-based engine nor the adaptive engine is invoked directly by callers
anymore.

Sources
-------
  System 2 – "pattern"  : multi-day health-signal patterns via PatternDetector
  System 1 – "realtime" : immediate behavioural signals from behavior_events
                           or an injected Signal from the adaptive engine
  Variety  – "wisdom"   : philosophical nudge, at most once per week
"""

import logging
import random
import uuid
from datetime import datetime, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from adaptive_nudge_engine import Signal, SignalType
from models import Nudge
from nudge_engine import create_nudge
from nudge_library import NUDGE_LIBRARY, get_nudge_message
from pattern_detector import PatternDetector
from push_notifications import send_nudge_push

logger = logging.getLogger(__name__)

# Minimum relevance score a candidate must reach to be delivered
_THRESHOLD = 0.6

# Maps injected SignalType values to (nudge_type, context_builder)
_SIGNAL_TYPE_MAP = {
    SignalType.EXCESSIVE_PICKUPS:   ("energy_drift",   lambda m: {"pickup_count": m.get("pickup_count", 5)}),
    SignalType.LONG_SCREEN_SESSION: ("energy_drift",   lambda m: {"pickup_count": 0}),
    SignalType.RAPID_APP_SWITCHING: ("context_switch", lambda m: {"switch_count": m.get("switch_count", 5)}),
    SignalType.EXTENDED_INACTIVITY: ("energy_drift",   lambda m: {"pickup_count": 0}),
    SignalType.LATE_NIGHT_USE:      ("late_night",      lambda m: {"time": m.get("time", "late")}),
    SignalType.FOCUS_BOUNDARY:      ("focus_mode",     lambda m: {}),
}


class NudgeOrchestrator:
    """
    Collects, scores, and delivers the single most relevant nudge for a user.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # ──────────────────────────────────────────────────────────────────────
    # 1. CANDIDATE COLLECTION
    # ──────────────────────────────────────────────────────────────────────

    async def collect_candidates(
        self,
        user_id: str,
        realtime_signal: Optional[Signal] = None,
    ) -> list:
        """
        Return a flat list of candidate dicts, each with:
            source         : "pattern" | "realtime" | "wisdom"
            trigger_id     : str
            nudge_type     : str
            context        : dict  (may include internal _signal_count key)
            relevance_score: float (0.0, filled in later)
        """
        candidates = []

        # ── System 2: multi-day pattern candidates ────────────────────────
        try:
            triggered = await PatternDetector(self.db).detect_patterns(user_id)
            for trigger_id in triggered:
                entry = NUDGE_LIBRARY.get(trigger_id, {})
                candidates.append({
                    "source": "pattern",
                    "trigger_id": trigger_id,
                    "nudge_type": entry.get("category", trigger_id),
                    # PatternDetector already requires multi-day evidence
                    "context": {"_signal_count": 3},
                    "relevance_score": 0.0,
                })
        except Exception as exc:
            logger.error(f"Pattern detection failed for user {user_id}: {exc}")

        # ── System 1: real-time candidates from behavioral events ─────────
        try:
            candidates.extend(await self._detect_realtime_candidates(user_id))
        except Exception as exc:
            logger.error(f"Realtime detection failed for user {user_id}: {exc}")

        # ── Injected real-time signal (from /adaptive-nudges/evaluate) ────
        if realtime_signal is not None:
            mapped = _SIGNAL_TYPE_MAP.get(realtime_signal.signal_type)
            if mapped:
                nudge_type, ctx_fn = mapped
                context = ctx_fn(realtime_signal.metadata)
                # Use signal strength as a proxy for evidence depth
                signal_count = 2 if realtime_signal.strength >= 0.7 else 1
                candidates.append({
                    "source": "realtime",
                    "trigger_id": realtime_signal.signal_type.value,
                    "nudge_type": nudge_type,
                    "context": {**context, "_signal_count": signal_count},
                    "relevance_score": 0.0,
                })

        # ── Wisdom / philosophical nudge (at most once per week) ──────────
        try:
            wisdom_triggers = [k for k in NUDGE_LIBRARY if k.startswith("wisdom_")]
            if wisdom_triggers:
                last_wisdom = await self.db.nudges.find_one(
                    {"user_id": user_id, "nudge_type": "wisdom"},
                    sort=[("created_at", -1)],
                )
                wisdom_due = (
                    not last_wisdom
                    or (
                        datetime.utcnow()
                        - last_wisdom.get("created_at", datetime.min)
                    ).days >= 7
                )
                if wisdom_due:
                    candidates.append({
                        "source": "wisdom",
                        "trigger_id": random.choice(wisdom_triggers),
                        "nudge_type": "wisdom",
                        "context": {},
                        "relevance_score": 0.0,
                    })
        except Exception as exc:
            logger.error(f"Wisdom candidate check failed for user {user_id}: {exc}")

        return candidates

    async def _detect_realtime_candidates(self, user_id: str) -> list:
        """Detect real-time candidates from behavioral events in the last 30 min."""
        candidates = []
        now = datetime.utcnow()
        window = now - timedelta(minutes=30)

        events = await self.db.phone_behaviors.find(
            {"user_id": user_id, "timestamp": {"$gte": window}}
        ).to_list(100)

        if not events:
            return candidates

        # context_switch: ≥4 app switches
        switches = [e for e in events if e.get("event_type") == "app_switch"]
        if len(switches) >= 4:
            candidates.append({
                "source": "realtime",
                "trigger_id": "context_switch",
                "nudge_type": "context_switch",
                "context": {"switch_count": len(switches), "_signal_count": 1},
                "relevance_score": 0.0,
            })

        # energy_drift: ≥5 phone pickups
        pickups = [e for e in events if e.get("event_type") == "pickup"]
        if len(pickups) >= 5:
            candidates.append({
                "source": "realtime",
                "trigger_id": "energy_drift",
                "nudge_type": "energy_drift",
                "context": {"pickup_count": len(pickups), "_signal_count": 1},
                "relevance_score": 0.0,
            })

        # late_night: any activity detected after 22:00
        if now.hour >= 22:
            candidates.append({
                "source": "realtime",
                "trigger_id": "late_night",
                "nudge_type": "late_night",
                "context": {"time": now.strftime("%H:%M"), "_signal_count": 1},
                "relevance_score": 0.0,
            })

        return candidates

    # ──────────────────────────────────────────────────────────────────────
    # 2. RELEVANCE SCORING
    # ──────────────────────────────────────────────────────────────────────

    async def score_candidate(self, candidate: dict, user_id: str) -> float:
        """
        Return a relevance score 0.0–1.0 for a candidate.

        Scoring rules
        -------------
        Wisdom nudges       : fixed 0.5
        Signal strength     : _signal_count 1 → 0.4, 2 → 0.65, 3+ → 0.9
        Recency penalty     : same nudge_type sent in last 7 days → -0.3
        Engagement bonus    : last nudge of this type was opened  → +0.1
        Minimum threshold   : 0.6 (enforced in orchestrate, not here)
        """
        if candidate["source"] == "wisdom":
            return 0.5

        signal_count = candidate["context"].get("_signal_count", 1)
        if signal_count >= 3:
            score = 0.9
        elif signal_count == 2:
            score = 0.65
        else:
            score = 0.4

        nudge_type = candidate["nudge_type"]
        recency_cutoff = datetime.utcnow() - timedelta(days=7)

        # Recency penalty
        recent_same = await self.db.nudges.find_one({
            "user_id": user_id,
            "nudge_type": nudge_type,
            "created_at": {"$gte": recency_cutoff},
        })
        if recent_same:
            score -= 0.3

        # Engagement bonus
        last_of_type = await self.db.nudges.find_one(
            {"user_id": user_id, "nudge_type": nudge_type},
            sort=[("created_at", -1)],
        )
        if last_of_type and last_of_type.get("opened"):
            score += 0.1

        return max(0.0, min(1.0, score))

    # ──────────────────────────────────────────────────────────────────────
    # 3. DELIVERY GATE
    # ──────────────────────────────────────────────────────────────────────

    async def can_deliver(self, user_id: str) -> bool:
        """
        Returns False if:
        - User subscription_status is "expired"
        - Any nudge was delivered to this user in the last 6 hours
        """
        user = await self.db.users.find_one({"id": user_id})
        if not user or user.get("subscription_status") == "expired":
            return False

        cutoff = datetime.utcnow() - timedelta(hours=6)
        recent_delivery = await self.db.nudges.find_one({
            "user_id": user_id,
            "delivered": True,
            "created_at": {"$gte": cutoff},
        })
        if recent_delivery:
            return False

        return True

    # ──────────────────────────────────────────────────────────────────────
    # 4. ORCHESTRATE
    # ──────────────────────────────────────────────────────────────────────

    async def orchestrate(
        self,
        user_id: str,
        realtime_signal: Optional[Signal] = None,
    ) -> Optional[dict]:
        """
        Run the full pipeline for a user and return the delivered nudge dict,
        or None if nothing should be sent right now.

        Steps
        -----
        1. can_deliver gate
        2. collect_candidates from all sources
        3. score_candidate for each; drop those below _THRESHOLD
        4. pick the highest-scoring candidate
        5. generate message (library for pattern/wisdom, AI for realtime)
        6. store in MongoDB + send push notification
        7. return nudge dict
        """
        # 1. Gate
        if not await self.can_deliver(user_id):
            return None

        # 2. Collect
        candidates = await self.collect_candidates(user_id, realtime_signal)
        if not candidates:
            return None

        # 3. Score and filter
        scored = []
        for candidate in candidates:
            score = await self.score_candidate(candidate, user_id)
            if score >= _THRESHOLD:
                scored.append({**candidate, "relevance_score": score})

        if not scored:
            # Silence is the correct answer
            return None

        # 4. Pick best
        scored.sort(key=lambda c: c["relevance_score"], reverse=True)
        best = scored[0]

        # 5. Generate content and store
        prefs = await self.db.preferences.find_one({"user_id": user_id}) or {}
        nudge_style = prefs.get("nudge_style", "silent")

        if best["source"] in ("pattern", "wisdom"):
            # Use pre-written library message
            nudge_data = get_nudge_message(best["trigger_id"])
            if not nudge_data:
                return None

            message = nudge_data["message"]
            explanation = nudge_data["principle"]
            nudge_id = str(uuid.uuid4())
            nudge_obj = Nudge(
                id=nudge_id,
                user_id=user_id,
                nudge_type=best["nudge_type"],
                message=message,
                explanation=explanation,
                delivered=False,
                silent=(nudge_style == "silent"),
            )
            await self.db.nudges.insert_one(nudge_obj.dict())
            nudge_dict = nudge_obj.dict()

        else:
            # Realtime: delegate to nudge_engine (AI-generated content)
            # Strip internal bookkeeping keys before passing context to engine
            context = {
                k: v for k, v in best["context"].items()
                if not k.startswith("_")
            }
            nudge_obj = await create_nudge(self.db, user_id, best["nudge_type"], context)
            if not nudge_obj:
                return None
            nudge_dict = nudge_obj.dict()
            message = nudge_dict["message"]

        # 6. Push notification (non-fatal)
        try:
            await send_nudge_push(self.db, user_id, message)
        except Exception as exc:
            logger.error(f"Push notification failed for user {user_id}: {exc}")

        logger.info(
            f"Orchestrator delivered {best['source']} nudge "
            f"(type={best['nudge_type']}, score={best['relevance_score']:.2f}) "
            f"to user {user_id}"
        )
        return nudge_dict
