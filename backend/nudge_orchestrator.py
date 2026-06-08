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
from nudge_engine import create_nudge, deliver_nudge
from nudge_library import NUDGE_LIBRARY, get_nudge_message
from pattern_detector import PatternDetector

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
            detector = PatternDetector(self.db)
            triggered_with_ctx = await detector.detect_patterns_for_orchestrator(user_id)
            for item in triggered_with_ctx:
                trigger_id = item["trigger_id"]
                pattern_context = item["context"]
                entry = NUDGE_LIBRARY.get(trigger_id, {})
                candidates.append({
                    "source": "pattern",
                    "trigger_id": trigger_id,
                    "nudge_type": entry.get("category", trigger_id),
                    # PatternDetector already requires multi-day evidence; merge pattern context
                    "context": {"_signal_count": 3, **pattern_context},
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

        # ── Wisdom / philosophical nudge (rarest category; ~once per 12 days) ──
        # Each wisdom line is bound to one or more pattern trigger_ids via the
        # library's "triggers" field. When wisdom is due, prefer a line whose
        # pattern is active right now; fall back to any wisdom line otherwise.
        try:
            wisdom_triggers = [
                k for k, v in NUDGE_LIBRARY.items() if v.get("category") == "wisdom"
            ]
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
                    ).days >= 12
                )
                if wisdom_due:
                    active_pattern_ids = {
                        c["trigger_id"] for c in candidates if c["source"] == "pattern"
                    }
                    matched = [
                        k for k in wisdom_triggers
                        if active_pattern_ids & set(NUDGE_LIBRARY[k].get("triggers", []))
                    ]
                    chosen = random.choice(matched) if matched else random.choice(wisdom_triggers)
                    candidates.append({
                        "source": "wisdom",
                        "trigger_id": chosen,
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

        # standing_gap: no movement recorded in the past 2 hours during waking hours.
        # Fires at most once per day. Requires the phone to have been recently active
        # (phone_behaviors present) to confirm the user is awake and at their device.
        if 7 <= now.hour < 22:
            try:
                two_hours_ago = now - timedelta(minutes=120)
                today_date = now.strftime("%Y-%m-%d")
                phone_active = await self.db.phone_behaviors.find_one(
                    {"user_id": user_id, "timestamp": {"$gte": two_hours_ago}}
                )
                if phone_active:
                    recent_step_signal = await self.db.health_signals.find_one(
                        {
                            "user_id": user_id,
                            "date": today_date,
                            "recorded_at": {"$gte": two_hours_ago},
                        }
                    )
                    if not recent_step_signal:
                        today_start = datetime.combine(now.date(), datetime.min.time())
                        already_fired = await self.db.nudges.find_one({
                            "user_id": user_id,
                            "trigger_id": "standing_gap",
                            "created_at": {"$gte": today_start},
                        })
                        if not already_fired:
                            candidates.append({
                                "source": "realtime",
                                "trigger_id": "standing_gap",
                                "nudge_type": "movement",
                                "context": {"_signal_count": 2},
                                "relevance_score": 0.0,
                            })
            except Exception as exc:
                logger.error(f"standing_gap detection failed for user {user_id}: {exc}")

        return candidates

    # ──────────────────────────────────────────────────────────────────────
    # 2. RELEVANCE SCORING
    # ──────────────────────────────────────────────────────────────────────

    # Positive reinforcement triggers: enforce 14-day minimum gap between fires.
    _POSITIVE_TRIGGERS = frozenset({
        "movement_good_streak",
        "attention_screen_improving",
        "outdoor_streak",
        "recovery_good",
        "rhythm_balanced_day",
        "rhythm_weekend_recovery",
        "mindful_streak",
    })

    # Urgent health signals receive a relevance boost before the recency penalty.
    # standing_gap has a fixed return of 0.75 and is excluded here.
    _PRIORITY_BOOST = {
        "stress_hrv_low": 0.15,
        "stress_resting_hr_elevated": 0.15,
        "sleep_duration_short": 0.15,
        "recovery_compound": 0.15,
        "hrv_workout_compound": 0.10,
    }

    # Message variants for new patterns not yet in NUDGE_LIBRARY.
    # Follows the same structure as compound trigger messages:
    # calm, observational, third-person, 1-2 sentences, no imperatives.
    _NEW_PATTERN_MESSAGES: dict = {
        "poor_deep_sleep": [
            "Deep sleep has been short this week — under an hour most nights. The body does its repair work there. It's worth noticing what might be pulling against it.",
            "Something has been interrupting the deeper layers of sleep. Not the hours, just the quality. The body notices even when you don't.",
        ],
        "hrv_workout_compound": [
            "Recovery has been lower than usual, and movement has been absent. The two are connected. Even a short walk changes the signal.",
            "HRV has been sitting below your baseline while exercise has paused. The body is asking for something simple.",
        ],
        "social_media_spike": [
            "Time on social apps has been climbing while movement has slowed. One often follows the other — not a judgment, just a pattern.",
            "The phone has been pulling more attention than usual, while the body has been moving less. Worth a moment of noticing.",
        ],
        "mindful_streak": [
            "Five of the last seven days included a moment of stillness. That consistency is rare. It's working.",
            "Mindfulness has been showing up regularly this week. The pattern is building something.",
        ],
        "recovery_compound": [
            "Sleep quality signals — oxygen and breathing — have been off for a couple of nights. This is the body's quiet way of asking for recovery.",
            "Two nights of lower oxygen or elevated breathing rate. Worth protecting the next sleep window carefully.",
        ],
    }

    # Compound trigger definitions. Each entry fires when both trigger_ids in "pair"
    # are present among the collected candidates, and returns early with a high score.
    _COMPOUND_TRIGGERS = [
        {
            "pair": {"movement_declining", "stress_heavy_meeting_day"},
            "trigger_id": "compound_movement_meetings",
            "nudge_type": "compound",
            "source": "pattern",
            "relevance_score": 0.92,
            "context": {"_signal_count": 3},
            "messages": [
                "Movement has been fading while meetings have been piling up. The body and the calendar are telling the same story.",
                "Less movement this week, more hours in rooms. The body needs the opposite of what the schedule is offering.",
                "A heavy week on the calendar and a quiet week on your feet. Those two things compound faster than either does alone.",
            ],
            "personalised_messages": [
                "Movement has been fading — {current_avg_steps} steps vs your usual {avg_steps_formatted} — while meetings have been piling up. The body and the calendar are telling the same story.",
            ]
        },
        {
            "pair": {"sleep_duration_short", "stress_hrv_low"},
            "trigger_id": "compound_sleep_recovery",
            "nudge_type": "compound",
            "source": "pattern",
            "relevance_score": 0.95,
            "context": {"_signal_count": 3},
            "messages": [
                "Short sleep and low recovery signals at the same time. The body is asking clearly — this isn't a push-through moment.",
                "Sleep has been short and recovery hasn't caught up. That combination ages the body faster than either does alone.",
                "The two most important recovery signals are both low right now. The body doesn't have reserves it doesn't have.",
            ],
            "personalised_messages": [
                "Averaging {avg_sleep_hours}h of sleep while your HRV sits {hrv_pct}% below baseline. The body is asking clearly — this isn't a push-through moment.",
            ]
        },
        {
            "pair": {"boundary_evening_work", "sleep_late_bedtime"},
            "trigger_id": "compound_evening_sleep",
            "nudge_type": "compound",
            "source": "pattern",
            "relevance_score": 0.90,
            "context": {"_signal_count": 3},
            "messages": [
                "Late meetings most evenings, late sleep most nights. One is causing the other — and the body is paying for both.",
                "The workday keeps running past 7, and sleep keeps starting past midnight. The evening is where this gets fixed.",
                "Evening work and late sleep have been running together this week. The day needs an end before the night can begin.",
            ]
        },
        {
            "pair": {"movement_declining", "stress_resting_hr_elevated"},
            "trigger_id": "compound_movement_hr",
            "nudge_type": "compound",
            "source": "pattern",
            "relevance_score": 0.92,
            "context": {"_signal_count": 3},
            "messages": [
                "Less movement this week and a higher resting heart rate. The body notices the connection even when the mind doesn't.",
                "Movement has been fading while resting heart rate has been climbing. The body uses movement to manage stress — it's not getting what it needs.",
                "Fewer steps and elevated heart rate over the same stretch. Those two signals together mean something the individual numbers don't.",
            ]
        },
    ]

    # Maps anchor action keywords to category affinity multipliers used by the
    # cold-start strategy to personalise scoring before engagement data exists.
    _ANCHOR_CATEGORY_AFFINITIES = {
        "meditation": {"recovery": 1.15, "sleep": 1.10, "morning_boundary": 1.10},
        "breath":     {"recovery": 1.15, "stress": 1.10},
        "walk":       {"movement": 1.15, "outdoor": 1.10},
        "grateful":   {"wisdom": 1.15, "balance": 1.10},
        "priority":   {"work_boundary": 1.15, "attention": 1.10},
        "loop":       {"work_boundary": 1.10, "attention": 1.10},
        "stretch":    {"movement": 1.15, "recovery": 1.10},
        "sleep":      {"sleep": 1.20, "morning_boundary": 1.10},
        "water":      {"movement": 1.05},
        "thought":    {"wisdom": 1.10, "balance": 1.10},
        "notification": {"attention": 1.15},
    }

    async def score_candidate(self, candidate: dict, user_id: str, multipliers: dict = None) -> float:
        """
        Return a relevance score 0.0–1.0 for a candidate.

        Scoring rules
        -------------
        Wisdom nudges            : fixed 0.5
        standing_gap             : fixed 0.75 (daily dedup handled upstream)
        Signal strength          : _signal_count 1 → 0.4, 2 → 0.65, 3+ → 0.9
        Priority boost           : trigger_id in _PRIORITY_BOOST → +0.15 (before recency)
        Recency penalty          : same nudge_type sent in last 7 days → -0.3
        Engagement bonus         : last nudge of this type was opened  → +0.1
        Positive trigger cooldown: trigger_id in _POSITIVE_TRIGGERS fired in last
                                   14 days → 0.0 (below threshold, will be dropped)
        Category multiplier      : per-user personalisation from get_category_multipliers
        Minimum threshold        : 0.6 (enforced in orchestrate, not here)
        """
        if candidate["source"] == "wisdom":
            return 0.5

        # standing_gap fires at a fixed relevance of 0.75; daily dedup is already
        # enforced in _detect_realtime_candidates, so no further recency penalty.
        if candidate["trigger_id"] == "standing_gap":
            return 0.75

        # Positive reinforcement triggers: suppress if fired within the last 14 days.
        if candidate["trigger_id"] in self._POSITIVE_TRIGGERS:
            fourteen_day_cutoff = datetime.utcnow() - timedelta(days=14)
            recent_positive = await self.db.nudges.find_one({
                "user_id": user_id,
                "trigger_id": candidate["trigger_id"],
                "created_at": {"$gte": fourteen_day_cutoff},
            })
            if recent_positive:
                return 0.0

        signal_count = candidate["context"].get("_signal_count", 1)
        if signal_count >= 3:
            score = 0.9
        elif signal_count == 2:
            score = 0.65
        else:
            score = 0.4

        # Priority boost for urgent health signals (applied before recency penalty)
        boost = self._PRIORITY_BOOST.get(candidate["trigger_id"], 0.0)
        score += boost

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

        # Category multiplier from cold-start / engagement learning
        if multipliers:
            multiplier = multipliers.get(candidate.get("nudge_type", ""), 1.0)
            score = score * multiplier

        return max(0.0, min(1.0, score))

    async def personalise_message(
        self,
        trigger_id: str,
        context: dict,
        library_entry: dict = None,
        compound_messages: list = None,
    ) -> Optional[str]:
        """
        Attempt to return a personalised message variant with {placeholders} filled.

        Returns None (caller falls back to standard random variant) if:
        - No personalised_messages defined for this trigger
        - All variants have at least one placeholder missing from context
        - Any exception occurs

        Parameters
        ----------
        trigger_id       : used only for error logging
        context          : the candidate's context dict (may contain personalisation fields)
        library_entry    : NUDGE_LIBRARY entry for this trigger (supplies personalised_messages)
        compound_messages: personalised_messages list from a compound trigger (overrides library_entry)
        """
        try:
            import re
            import copy as _copy
            import random as _random

            if compound_messages is not None:
                personalised_variants = compound_messages
            elif library_entry is not None:
                personalised_variants = library_entry.get("personalised_messages", [])
            else:
                return None

            if not personalised_variants:
                return None

            # Shuffle so different variants surface across successive calls
            variants = _copy.copy(personalised_variants)
            _random.shuffle(variants)

            for variant in variants:
                placeholders = re.findall(r"\{(\w+)\}", variant)
                if all(p in context and context[p] is not None for p in placeholders):
                    try:
                        return variant.format(**context)
                    except (KeyError, ValueError):
                        continue

            return None  # All variants need data that isn't available

        except Exception as exc:
            logger.error(f"personalise_message failed for {trigger_id}: {exc}")
            return None

    def detect_compound(self, candidates: list) -> Optional[dict]:
        """
        Return a deepcopy of the first compound trigger whose pair is fully
        represented in *candidates*, or None if no compound fires.
        Compound candidates take precedence over all scored candidates and
        bypass the _THRESHOLD gate.
        """
        import copy
        trigger_ids_present = {c["trigger_id"] for c in candidates}
        for compound in self._COMPOUND_TRIGGERS:
            if compound["pair"].issubset(trigger_ids_present):
                return copy.deepcopy(compound)
        return None

    async def get_anchor_affinities(self, user_id: str) -> dict:
        """
        Return category affinity multipliers derived from the anchor action
        the user chose during onboarding (stored in preferences.anchor_action).
        Returns an empty dict when no anchor action is on file.
        """
        prefs = await self.db.preferences.find_one({"user_id": user_id}) or {}
        anchor = (prefs.get("anchor_action") or "").lower()
        if not anchor:
            return {}
        for keyword, affinities in self._ANCHOR_CATEGORY_AFFINITIES.items():
            if keyword in anchor:
                return dict(affinities)
        return {}

    async def get_category_multipliers(self, user_id: str) -> dict:
        """
        Return per-category score multipliers for personalised ranking.

        Three phases based on days since the user joined
        ─────────────────────────────────────────────────
        Phase 1 (days 0–7, anchor only)
            Only anchor affinities are used — no engagement data yet.
        Phase 2 (days 7–30, blend)
            60 % anchor + 40 % observed open-rate multipliers.
        Phase 3 (days 30+, full engagement)
            Open-rate multipliers only; anchor no longer drives decisions.

        Open-rate multiplier rules (require ≥3 delivered nudges for the category)
        ─────────────────────────────────────────────────────────────────────────
          open_rate > 0.50 → 1.15 ×
          open_rate < 0.25 → 0.85 ×
          otherwise        → 1.0  (neutral, omitted from returned dict)
        """
        user = (
            await self.db.users.find_one({"_id": user_id})
            or await self.db.users.find_one({"id": user_id})
        )
        if not user:
            return {}

        created_at = user.get("created_at") or user.get("trial_start")
        days_since_join = (
            (datetime.utcnow() - created_at).days if created_at else 0
        )

        anchor_multipliers = await self.get_anchor_affinities(user_id)

        # Phase 1: cold-start — anchor affinities only
        if days_since_join < 7:
            return anchor_multipliers

        # Compute per-category open rates from stored nudges
        pipeline = [
            {"$match": {"user_id": user_id}},
            {
                "$group": {
                    "_id": "$nudge_type",
                    "total": {"$sum": 1},
                    "opened": {"$sum": {"$cond": ["$opened", 1, 0]}},
                }
            },
        ]
        rows = await self.db.nudges.aggregate(pipeline).to_list(100)
        engagement_multipliers: dict = {}
        for row in rows:
            total = row["total"]
            if total < 3:
                continue
            open_rate = row["opened"] / total
            if open_rate > 0.5:
                engagement_multipliers[row["_id"]] = 1.15
            elif open_rate < 0.25:
                engagement_multipliers[row["_id"]] = 0.85

        # Phase 3: full engagement — open rates only
        if days_since_join >= 30:
            return engagement_multipliers

        # Phase 2: blend (60 % anchor, 40 % engagement)
        all_cats = set(anchor_multipliers) | set(engagement_multipliers)
        return {
            cat: round(
                0.6 * anchor_multipliers.get(cat, 1.0)
                + 0.4 * engagement_multipliers.get(cat, 1.0),
                4,
            )
            for cat in all_cats
        }

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
        2. Fetch user preferences (nudge_style) — needed on every exit path
        3. collect_candidates from all sources
        4. Compound trigger check — returns early if a compound pair fires
        5. score_candidate for each (with per-user category multipliers);
           drop those below _THRESHOLD
        6. Pick the highest-scoring candidate
        7. Generate message (library for pattern/wisdom, AI for realtime)
        8. Store in MongoDB + send push notification
        9. Return nudge dict
        """
        # 1. Gate
        if not await self.can_deliver(user_id):
            return None

        # 2. Preferences — fetched once, reused by both the compound path and the
        #    normal path so we don't query twice.
        prefs = await self.db.preferences.find_one({"user_id": user_id}) or {}
        nudge_style = prefs.get("nudge_style", "silent")

        # 3. Collect
        candidates = await self.collect_candidates(user_id, realtime_signal)
        if not candidates:
            return None

        # 4. Compound trigger check — bypasses individual scoring / threshold
        compound = self.detect_compound(candidates)
        if compound:
            # Merge the individual candidates' contexts so personalised variants
            # can draw on data from both halves of the compound.
            merged_context: dict = {}
            for c in candidates:
                if c["trigger_id"] in compound["pair"]:
                    merged_context.update(c.get("context", {}))
            personalised = await self.personalise_message(
                compound["trigger_id"],
                merged_context,
                compound_messages=compound.get("personalised_messages", []),
            )
            message = personalised if personalised else random.choice(compound["messages"])
            delivered = await deliver_nudge(
                self.db, user_id,
                {
                    "nudge_type": compound["nudge_type"],
                    "message": message,
                    "explanation": "",
                    "trigger_id": compound["trigger_id"],
                },
                channel="both",
            )
            if not delivered:
                return None
            logger.info(
                f"Orchestrator delivered compound nudge "
                f"(trigger={compound['trigger_id']}, "
                f"score={compound['relevance_score']:.2f}) "
                f"to user {user_id}"
            )
            return delivered

        # 5. Score and filter — compute personalisation multipliers once
        multipliers = await self.get_category_multipliers(user_id)
        scored = []
        for candidate in candidates:
            score = await self.score_candidate(candidate, user_id, multipliers)
            if score >= _THRESHOLD:
                scored.append({**candidate, "relevance_score": score})

        if not scored:
            # Silence is the correct answer
            return None

        # 6. Pick best
        scored.sort(key=lambda c: c["relevance_score"], reverse=True)
        best = scored[0]

        # 7. Generate content and store
        if best["source"] in ("pattern", "wisdom"):
            # Special message selection for movement_work_hours_gap:
            # only include the [Calendar] variant when calendar overlap was detected.
            if best["trigger_id"] == "movement_work_hours_gap":
                lib_entry = NUDGE_LIBRARY.get("movement_work_hours_gap", {})
                msgs = lib_entry.get("messages", [])
                use_cal = best["context"].get("use_calendar_variant", False)
                if use_cal:
                    chosen = random.choice(msgs)
                else:
                    non_cal = [m for m in msgs if not m.startswith("[Calendar]")]
                    chosen = random.choice(non_cal) if non_cal else random.choice(msgs)
                # Strip [Calendar] prefix before delivery regardless of variant
                if chosen.startswith("[Calendar]"):
                    chosen = chosen[len("[Calendar]"):].strip()
                message = chosen
                explanation = lib_entry.get("principle", "")
            else:
                # Attempt personalised variant; fall back to standard random selection
                lib_entry = NUDGE_LIBRARY.get(best["trigger_id"])
                personalised = await self.personalise_message(
                    best["trigger_id"],
                    best.get("context", {}),
                    library_entry=lib_entry,
                )
                if personalised:
                    message = personalised
                    explanation = lib_entry.get("principle", "") if lib_entry else ""
                else:
                    nudge_data = get_nudge_message(best["trigger_id"])
                    if nudge_data:
                        message = nudge_data["message"]
                        explanation = nudge_data["principle"]
                    else:
                        # Fall back to locally-defined messages for new pattern types
                        local_msgs = self._NEW_PATTERN_MESSAGES.get(best["trigger_id"])
                        if not local_msgs:
                            return None
                        message = random.choice(local_msgs)
                        explanation = ""
            delivered = await deliver_nudge(
                self.db, user_id,
                {
                    "nudge_type": best["nudge_type"],
                    "message": message,
                    "explanation": explanation,
                    "trigger_id": best["trigger_id"],
                },
                channel="both",
            )
            if not delivered:
                return None
            nudge_dict = delivered

        else:
            # Realtime: delegate to nudge_engine, which generates AI content and
            # routes delivery through deliver_nudge (mode/frequency/quiet-hours).
            context = {
                k: v for k, v in best["context"].items()
                if not k.startswith("_")
            }
            nudge_obj = await create_nudge(self.db, user_id, best["nudge_type"], context)
            if not nudge_obj:
                return None
            nudge_dict = nudge_obj.dict()
            # Store trigger_id for realtime nudges too
            await self.db.nudges.update_one(
                {"id": nudge_dict["id"]},
                {"$set": {"trigger_id": best["trigger_id"]}},
            )

        logger.info(
            f"Orchestrator delivered {best['source']} nudge "
            f"(type={best['nudge_type']}, score={best['relevance_score']:.2f}) "
            f"to user {user_id}"
        )
        return nudge_dict
