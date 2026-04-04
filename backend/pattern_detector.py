"""
Koan Pattern Detector
Analyses health signals and behavioural data to detect meaningful patterns.
Returns pattern assessments that the nudge engine uses to select nudges from the library.
"""

from datetime import datetime, timedelta
from typing import Optional
from nudge_library import get_nudge_message, NUDGE_LIBRARY


class PatternDetector:
    def __init__(self, db):
        self.db = db

    async def get_recent_signals(self, user_id: str, days: int = 7) -> list:
        """Get health signals for the last N days."""
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
        signals = await self.db.health_signals.find(
            {"user_id": user_id, "date": {"$gte": cutoff}},
            sort=[("date", -1)]
        ).to_list(days)
        return signals

    async def get_baseline(self, user_id: str) -> dict:
        """Calculate 30-day baseline averages for comparison."""
        cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
        signals = await self.db.health_signals.find(
            {"user_id": user_id, "date": {"$gte": cutoff}}
        ).to_list(30)
        if not signals:
            return {}
        def avg(key):
            vals = [s[key] for s in signals if s.get(key)]
            return sum(vals) / len(vals) if vals else None
        return {
            "avg_steps": avg("steps"),
            "avg_screen_time": avg("total_screen_time_minutes"),
            "avg_pickups": avg("total_pickups"),
            "avg_sleep_duration": avg("sleep_duration_minutes"),
            "avg_resting_hr": avg("resting_heart_rate"),
            "avg_hrv": avg("hrv_ms"),
        }

    async def detect_patterns(self, user_id: str) -> list:
        """
        Detect patterns from recent signals.
        Returns list of trigger_ids that warrant nudges.
        """
        signals = await self.get_recent_signals(user_id, days=7)
        if len(signals) < 2:
            return []

        baseline = await self.get_baseline(user_id)
        today_signal = signals[0] if signals else {}
        triggered = []

        # ── Morning phone boundary ──
        early_pickups = [
            s for s in signals[:5]
            if s.get("first_pickup_time") and s["first_pickup_time"] < "07:00"
        ]
        if len(early_pickups) >= 3:
            triggered.append("morning_phone_early")
        elif len(early_pickups) >= 2:
            triggered.append("morning_phone_consistent")

        # ── Movement declining ──
        step_counts = [s.get("steps") for s in signals[:5] if s.get("steps")]
        if len(step_counts) >= 4:
            if all(step_counts[i] > step_counts[i+1] for i in range(min(3, len(step_counts)-1))):
                triggered.append("movement_declining")
        if today_signal.get("steps", 0) < 3000 and today_signal.get("total_screen_time_minutes", 0) > 240:
            triggered.append("movement_sedentary_day")
        if len(step_counts) >= 5 and all(s > 7000 for s in step_counts[:5]):
            triggered.append("movement_good_streak")

        # ── Sleep patterns ──
        sleep_starts = [s.get("sleep_start") for s in signals[:5] if s.get("sleep_start")]
        if len(sleep_starts) >= 3:
            times = [int(t.replace(":", "")) for t in sleep_starts]
            if max(times) - min(times) > 130:
                triggered.append("sleep_timing_inconsistent")
        sleep_durations = [s.get("sleep_duration_minutes") for s in signals[:3] if s.get("sleep_duration_minutes")]
        if len(sleep_durations) >= 2 and all(d < 390 for d in sleep_durations):
            triggered.append("sleep_duration_short")

        # ── Attention & screen ──
        total = today_signal.get("total_screen_time_minutes", 0)
        social = today_signal.get("social_media_minutes", 0)
        if total > 0 and social > 0 and (social / total) > 0.5 and social > 60:
            triggered.append("attention_social_media_heavy")
        pickups = today_signal.get("total_pickups", 0)
        baseline_pickups = baseline.get("avg_pickups") or 20
        if pickups > baseline_pickups * 1.5 and pickups > 30:
            triggered.append("attention_high_pickups")
        recent_screens = [s.get("total_screen_time_minutes") for s in signals[:5] if s.get("total_screen_time_minutes")]
        if len(recent_screens) >= 3 and baseline.get("avg_screen_time"):
            if all(s < baseline["avg_screen_time"] * 0.7 for s in recent_screens[:3]):
                triggered.append("attention_screen_improving")

        # ── HRV & heart rate ──
        hrv_values = [s.get("hrv_ms") for s in signals[:5] if s.get("hrv_ms")]
        if len(hrv_values) >= 2 and baseline.get("avg_hrv"):
            if all(h < baseline["avg_hrv"] * 0.8 for h in hrv_values[:2]):
                triggered.append("stress_hrv_low")
        rhr_values = [s.get("resting_heart_rate") for s in signals[:4] if s.get("resting_heart_rate")]
        if len(rhr_values) >= 3 and baseline.get("avg_resting_hr"):
            if all(h > baseline["avg_resting_hr"] * 1.1 for h in rhr_values[:3]):
                triggered.append("stress_resting_hr_elevated")

        # ── Balance & rhythm ──
        is_weekend = datetime.utcnow().weekday() >= 5
        if is_weekend:
            triggered.append("rhythm_weekend_recovery")
        steps_ok = today_signal.get("steps", 0) > 6000
        screen_ok = today_signal.get("total_screen_time_minutes", 0) < 180
        sleep_ok = today_signal.get("sleep_duration_minutes", 0) > 360
        if steps_ok and screen_ok and sleep_ok:
            triggered.append("rhythm_balanced_day")

        return triggered

    async def get_priority_nudge(self, user_id: str) -> Optional[dict]:
        """
        Get the single most important nudge for the user right now.
        Checks what was recently sent to avoid repetition.
        Priority order: stress/recovery > sleep > morning boundary > movement > attention > balance
        """
        triggered = await self.detect_patterns(user_id)
        if not triggered:
            return None

        priority_order = [
            "stress_hrv_low",
            "stress_resting_hr_elevated",
            "sleep_timing_inconsistent",
            "sleep_duration_short",
            "sleep_late_night_phone",
            "morning_phone_early",
            "morning_phone_consistent",
            "movement_declining",
            "movement_sedentary_day",
            "attention_social_media_heavy",
            "attention_high_pickups",
            "rhythm_weekend_recovery",
            "rhythm_balanced_day",
            "movement_good_streak",
            "attention_screen_improving",
        ]

        # Get recently sent nudge types to avoid repetition
        cutoff = datetime.utcnow() - timedelta(hours=20)
        recent_nudges = await self.db.nudges.find(
            {"user_id": user_id, "created_at": {"$gte": cutoff}}
        ).to_list(10)
        recent_types = {n.get("nudge_type") for n in recent_nudges}

        for trigger_id in priority_order:
            if trigger_id in triggered:
                nudge_data = NUDGE_LIBRARY.get(trigger_id, {})
                category = nudge_data.get("category", trigger_id)
                if category not in recent_types:
                    return get_nudge_message(trigger_id)

        return None

    async def detect_weekly_patterns(self, user_id: str) -> dict:
        """Generate a weekly narrative and pattern summary."""
        signals = await self.get_recent_signals(user_id, days=7)
        triggered = await self.detect_patterns(user_id)

        if not signals:
            return {
                "narrative": "Koan is still building your baseline. Check back in a few days.",
                "patterns_detected": [],
                "week_start": (datetime.utcnow() - timedelta(days=7)).isoformat(),
            }

        # Build narrative from triggered patterns
        category_counts = {}
        for t in triggered:
            cat = NUDGE_LIBRARY.get(t, {}).get("category", "other")
            category_counts[cat] = category_counts.get(cat, 0) + 1

        dominant = max(category_counts, key=category_counts.get) if category_counts else None

        narratives = {
            "morning_boundary": "Your mornings have been starting on someone else's terms. The phone is there before the day has had a chance to begin.",
            "movement": "Movement has been inconsistent this week. The body notices when it's not being used.",
            "sleep": "Sleep patterns have been shifting. Consistency is what your body clock needs most.",
            "attention": "Screen time and attention have been fragmented. The feed has been winning more than it should.",
            "recovery": "Recovery signals have been low. The week has been heavy.",
            "balance": "This week has had moments of real balance. That's worth carrying forward.",
        }

        narrative = narratives.get(dominant, "Koan has been observing your patterns this week.")

        return {
            "narrative": narrative,
            "patterns_detected": triggered,
            "week_start": (datetime.utcnow() - timedelta(days=7)).isoformat(),
            "dominant_category": dominant,
            "signal_count": len(signals),
        }


# ── Module-level shims for backwards compatibility with server.py ─────────────
# server.py imports detect_weekly_patterns and learn_quiet_periods as module-level
# functions. These shims delegate to the class methods.

async def detect_weekly_patterns(db, user_id: str) -> dict:
    return await PatternDetector(db).detect_weekly_patterns(user_id)


async def learn_quiet_periods(db, user_id: str) -> None:
    """
    Analyse historical nudge engagement times to infer quiet periods.
    Writes back to preferences.quiet_periods.
    """
    from collections import Counter
    nudges = await db.nudges.find(
        {"user_id": user_id, "opened": True}
    ).to_list(100)

    if not nudges:
        return

    hour_counts = Counter()
    for nudge in nudges:
        created = nudge.get("created_at")
        if created:
            hour_counts[created.hour] += 1

    # Hours with zero or low engagement are candidate quiet periods
    all_hours = set(range(24))
    active_hours = {h for h, c in hour_counts.items() if c >= 2}
    quiet_hours = sorted(all_hours - active_hours)

    # Group into contiguous ranges
    quiet_periods = []
    if quiet_hours:
        start = quiet_hours[0]
        prev = quiet_hours[0]
        for h in quiet_hours[1:]:
            if h != prev + 1:
                quiet_periods.append({"start": f"{start:02d}:00", "end": f"{prev:02d}:59"})
                start = h
            prev = h
        quiet_periods.append({"start": f"{start:02d}:00", "end": f"{prev:02d}:59"})

    await db.preferences.update_one(
        {"user_id": user_id},
        {"$set": {"quiet_periods": quiet_periods}},
        upsert=True,
    )
