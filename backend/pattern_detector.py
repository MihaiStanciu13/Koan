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
            "avg_outdoor_minutes": avg("outdoor_minutes"),
            "avg_active_energy": avg("active_energy_kcal"),
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

        # ── Calendar context ──
        try:
            user = await self.db.users.find_one({"_id": user_id})
            if user and user.get("google_calendar_token"):
                from google_calendar import get_meeting_density
                density = await get_meeting_density(
                    user["google_calendar_token"],
                    user.get("google_calendar_refresh_token", "")
                )
                if density.get("back_to_back"):
                    triggered.append("stress_back_to_back_meetings")
                if density.get("meeting_minutes", 0) > 300:
                    triggered.append("stress_heavy_meeting_day")
        except Exception:
            pass  # calendar unavailable, continue without it

        # ── Microsoft 365 Calendar context ──
        try:
            if user and user.get("microsoft_access_token"):
                from microsoft_calendar import get_meeting_density as ms_density
                ms_data = await ms_density(user["microsoft_access_token"])
                if ms_data.get("back_to_back"):
                    if "stress_back_to_back_meetings" not in triggered:
                        triggered.append("stress_back_to_back_meetings")
                if ms_data.get("meeting_minutes", 0) > 300:
                    if "stress_heavy_meeting_day" not in triggered:
                        triggered.append("stress_heavy_meeting_day")
        except Exception:
            pass

        # ── Outdoor time ──
        outdoor_values = [
            s.get("outdoor_minutes") for s in signals[:7]
            if s.get("outdoor_minutes") is not None
        ]
        baseline_outdoor = baseline.get("avg_outdoor_minutes")
        if baseline_outdoor and len(outdoor_values) >= 5:
            below_baseline = sum(1 for v in outdoor_values if v < baseline_outdoor * 0.6)
            if below_baseline >= 5:
                triggered.append("outdoor_low_week")
            elif all(v > baseline_outdoor * 1.2 for v in outdoor_values[:4]):
                triggered.append("outdoor_streak")
        elif not baseline_outdoor and len(outdoor_values) >= 5:
            # No baseline yet — trigger if consistently very low absolute value
            if sum(1 for v in outdoor_values if v < 10) >= 5:
                triggered.append("outdoor_low_week")

        # ── Workout recovery ──
        yesterday_signal = signals[1] if len(signals) > 1 else {}
        baseline_active_energy = baseline.get("avg_active_energy") or 300
        baseline_resting_hr = baseline.get("avg_resting_hr") or 65
        baseline_hrv = baseline.get("avg_hrv") or 0
        yesterday_active_energy = yesterday_signal.get("active_energy_kcal", 0)
        today_resting_hr = today_signal.get("resting_heart_rate", 0)
        if (yesterday_active_energy > baseline_active_energy * 1.5
                and today_resting_hr > baseline_resting_hr * 1.1
                and today_resting_hr > 0):
            triggered.append("recovery_insufficient")
        active_energy_recent = [
            s.get("active_energy_kcal") for s in signals[:4]
            if s.get("active_energy_kcal")
        ]
        today_hrv = today_signal.get("hrv_ms", 0)
        if (len(active_energy_recent) >= 3
                and all(v > baseline_active_energy * 1.3 for v in active_energy_recent[:3])
                and baseline_hrv > 0
                and today_hrv > baseline_hrv * 1.1):
            triggered.append("recovery_good")

        # ── Work-life boundary (calendar) ──
        # Reuses the `user` dict fetched in the Calendar context block above.
        try:
            if user and user.get("google_calendar_token"):
                from google_calendar import get_meeting_density
                density = await get_meeting_density(
                    user["google_calendar_token"],
                    user.get("google_calendar_refresh_token", "")
                )
                if density.get("evening_meetings_this_week", 0) >= 3:
                    triggered.append("boundary_evening_work")
                if density.get("weekend_meetings", False):
                    triggered.append("boundary_weekend_meetings")
        except Exception:
            pass

        try:
            if user and user.get("microsoft_access_token"):
                from microsoft_calendar import get_meeting_density as ms_density
                ms_data = await ms_density(user["microsoft_access_token"])
                if ms_data.get("evening_meetings_this_week", 0) >= 3:
                    if "boundary_evening_work" not in triggered:
                        triggered.append("boundary_evening_work")
                if ms_data.get("weekend_meetings", False):
                    if "boundary_weekend_meetings" not in triggered:
                        triggered.append("boundary_weekend_meetings")
        except Exception:
            pass

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
            "recovery_insufficient",
            "stress_back_to_back_meetings",
            "stress_heavy_meeting_day",
            "boundary_evening_work",
            "boundary_weekend_meetings",
            "sleep_timing_inconsistent",
            "sleep_duration_short",
            "sleep_late_night_phone",
            "outdoor_low_week",
            "morning_phone_early",
            "morning_phone_consistent",
            "movement_declining",
            "movement_sedentary_day",
            "attention_social_media_heavy",
            "attention_high_pickups",
            "rhythm_weekend_recovery",
            "rhythm_balanced_day",
            "movement_good_streak",
            "outdoor_streak",
            "recovery_good",
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
            "outdoor": "Time outside has been low this week. The body uses natural light for more than it's given credit for.",
            "work_boundary": "Work has been bleeding into evenings and weekends. The recovery the week needs isn't happening.",
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
