"""
Koan Pattern Detector
Analyses health signals and behavioural data to detect meaningful patterns.
Returns pattern assessments that the nudge engine uses to select nudges from the library.
"""

from datetime import datetime, timedelta
from typing import Optional
from nudge_library import get_nudge_message, NUDGE_LIBRARY

try:
    import anthropic
except ImportError:
    anthropic = None


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
        # Per-trigger context storage — populated during detection, read by
        # detect_patterns_for_orchestrator to build richer candidate dicts.
        self._pattern_contexts: dict = {}

        # ── Morning phone boundary ──
        early_pickups = [
            s for s in signals[:5]
            if s.get("first_pickup_time") and s["first_pickup_time"] < "07:00"
        ]
        if len(early_pickups) >= 3:
            triggered.append("morning_phone_early")
            ctx: dict = {}
            try:
                raw_time = early_pickups[0].get("first_pickup_time")
                if raw_time:
                    h, m = map(int, raw_time.split(":"))
                    ampm = "am" if h < 12 else "pm"
                    h12 = h % 12 or 12
                    ctx["first_pickup_time"] = f"{h12}:{m:02d} {ampm}"
            except Exception:
                pass
            self._pattern_contexts["morning_phone_early"] = ctx
        elif len(early_pickups) >= 2:
            triggered.append("morning_phone_consistent")

        # ── Movement declining ──
        step_counts = [s.get("steps") for s in signals[:5] if s.get("steps")]
        if len(step_counts) >= 4:
            if all(step_counts[i] > step_counts[i+1] for i in range(min(3, len(step_counts)-1))):
                triggered.append("movement_declining")
                ctx = {}
                try:
                    avg_steps = baseline.get("avg_steps")
                    if avg_steps:
                        ctx["avg_steps_formatted"] = f"{round(avg_steps):,}"
                    recent = step_counts[:4]
                    ctx["current_avg_steps"] = f"{round(sum(recent) / len(recent)):,}"
                except Exception:
                    pass
                self._pattern_contexts["movement_declining"] = ctx
        if today_signal.get("steps", 0) < 3000 and today_signal.get("total_screen_time_minutes", 0) > 240:
            triggered.append("movement_sedentary_day")
            ctx = {}
            try:
                steps_val = today_signal.get("steps")
                if steps_val is not None:
                    ctx["steps_today"] = steps_val
            except Exception:
                pass
            self._pattern_contexts["movement_sedentary_day"] = ctx
        if len(step_counts) >= 5 and all(s > 7000 for s in step_counts[:5]):
            triggered.append("movement_good_streak")

        # ── Sleep patterns ──
        sleep_starts = [s.get("sleep_start") for s in signals[:5] if s.get("sleep_start")]
        if len(sleep_starts) >= 3:
            times = [int(t.replace(":", "")) for t in sleep_starts]
            if max(times) - min(times) > 130:
                triggered.append("sleep_timing_inconsistent")
                ctx = {}
                try:
                    def _hhmm_to_mins(t_str: str) -> int:
                        hh, mm = map(int, t_str.split(":"))
                        mins = hh * 60 + mm
                        return mins + 1440 if hh < 3 else mins
                    mins_list = [_hhmm_to_mins(t) for t in sleep_starts]
                    ctx["sleep_variance_minutes"] = max(mins_list) - min(mins_list)
                except Exception:
                    pass
                self._pattern_contexts["sleep_timing_inconsistent"] = ctx
        sleep_durations = [s.get("sleep_duration_minutes") for s in signals[:3] if s.get("sleep_duration_minutes")]
        if len(sleep_durations) >= 2 and all(d < 390 for d in sleep_durations):
            triggered.append("sleep_duration_short")
            ctx = {}
            try:
                ctx["avg_sleep_hours"] = round(sum(sleep_durations) / len(sleep_durations) / 60, 1)
                baseline_sleep = baseline.get("avg_sleep_duration")
                if baseline_sleep:
                    ctx["baseline_sleep_hours"] = round(baseline_sleep / 60, 1)
            except Exception:
                pass
            self._pattern_contexts["sleep_duration_short"] = ctx

        # ── Attention & screen ──
        total = today_signal.get("total_screen_time_minutes", 0)
        social = today_signal.get("social_media_minutes", 0)
        if total > 0 and social > 0 and (social / total) > 0.5 and social > 60:
            triggered.append("attention_social_media_heavy")
            ctx = {}
            try:
                ctx["social_media_minutes"] = social
                ctx["social_pct"] = round(social / total * 100)
            except Exception:
                pass
            self._pattern_contexts["attention_social_media_heavy"] = ctx
        pickups = today_signal.get("total_pickups", 0)
        baseline_pickups = baseline.get("avg_pickups") or 20
        if pickups > baseline_pickups * 1.5 and pickups > 30:
            triggered.append("attention_high_pickups")
            ctx = {}
            try:
                ctx["pickups_today"] = pickups
                ctx["pickups_above_baseline"] = max(0, pickups - round(baseline_pickups))
            except Exception:
                pass
            self._pattern_contexts["attention_high_pickups"] = ctx
        recent_screens = [s.get("total_screen_time_minutes") for s in signals[:5] if s.get("total_screen_time_minutes")]
        if len(recent_screens) >= 3 and baseline.get("avg_screen_time"):
            if all(s < baseline["avg_screen_time"] * 0.7 for s in recent_screens[:3]):
                triggered.append("attention_screen_improving")

        # ── HRV & heart rate ──
        hrv_values = [s.get("hrv_ms") for s in signals[:5] if s.get("hrv_ms")]
        if len(hrv_values) >= 2 and baseline.get("avg_hrv"):
            if all(h < baseline["avg_hrv"] * 0.8 for h in hrv_values[:2]):
                triggered.append("stress_hrv_low")
                ctx = {}
                try:
                    pct_below = round((1.0 - hrv_values[0] / baseline["avg_hrv"]) * 100)
                    ctx["hrv_pct"] = max(0, pct_below)
                except Exception:
                    pass
                self._pattern_contexts["stress_hrv_low"] = ctx
        rhr_values = [s.get("resting_heart_rate") for s in signals[:4] if s.get("resting_heart_rate")]
        if len(rhr_values) >= 3 and baseline.get("avg_resting_hr"):
            if all(h > baseline["avg_resting_hr"] * 1.1 for h in rhr_values[:3]):
                triggered.append("stress_resting_hr_elevated")
                ctx = {}
                try:
                    rhr_avg = sum(rhr_values[:3]) / 3
                    ctx["rhr_current"] = round(rhr_avg)
                    ctx["rhr_delta"] = round(rhr_avg - baseline["avg_resting_hr"])
                except Exception:
                    pass
                self._pattern_contexts["stress_resting_hr_elevated"] = ctx

        # ── Calendar context ──
        try:
            user = await self.db.users.find_one({"id": user_id})
            if user and user.get("google_calendar_token"):
                from google_calendar import get_meeting_density
                density = await get_meeting_density(
                    user["google_calendar_token"],
                    user.get("google_calendar_refresh_token", "")
                )
                if density.get("back_to_back"):
                    triggered.append("stress_back_to_back_meetings")
                    ctx = {}
                    try:
                        count = (density.get("back_to_back_count")
                                 or density.get("meeting_count"))
                        if count:
                            ctx["meeting_count"] = count
                    except Exception:
                        pass
                    self._pattern_contexts["stress_back_to_back_meetings"] = ctx
                if density.get("meeting_minutes", 0) > 300:
                    triggered.append("stress_heavy_meeting_day")
                    ctx = {}
                    try:
                        ctx["meeting_hours"] = round(
                            density.get("meeting_minutes", 0) / 60, 1
                        )
                    except Exception:
                        pass
                    self._pattern_contexts["stress_heavy_meeting_day"] = ctx
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
                        ctx = {}
                        try:
                            count = (ms_data.get("back_to_back_count")
                                     or ms_data.get("meeting_count"))
                            if count:
                                ctx["meeting_count"] = count
                        except Exception:
                            pass
                        self._pattern_contexts["stress_back_to_back_meetings"] = ctx
                if ms_data.get("meeting_minutes", 0) > 300:
                    if "stress_heavy_meeting_day" not in triggered:
                        triggered.append("stress_heavy_meeting_day")
                        ctx = {}
                        try:
                            ctx["meeting_hours"] = round(
                                ms_data.get("meeting_minutes", 0) / 60, 1
                            )
                        except Exception:
                            pass
                        self._pattern_contexts["stress_heavy_meeting_day"] = ctx
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

        # ── Poor deep sleep ──
        deep_sleep_values = [
            s.get("sleep_deep_minutes") for s in signals[:5]
            if s.get("sleep_deep_minutes") is not None
        ]
        if len(deep_sleep_values) >= 3:
            nights_under_60 = sum(1 for v in deep_sleep_values if v < 60)
            if nights_under_60 >= 3:
                triggered.append("poor_deep_sleep")
                ctx = {}
                try:
                    ctx["avg_deep_minutes"] = round(
                        sum(deep_sleep_values) / len(deep_sleep_values), 1
                    )
                except Exception:
                    pass
                self._pattern_contexts["poor_deep_sleep"] = ctx

        # ── HRV + workout compound ──
        if baseline.get("avg_hrv"):
            hrv_baseline = baseline["avg_hrv"]
            consecutive_low_no_workout = 0
            for sig in signals[:5]:
                hrv = sig.get("hrv_ms")
                if hrv is None:
                    break
                workout = sig.get("workout_minutes")
                if hrv < hrv_baseline * 0.85 and (workout is None or workout == 0):
                    consecutive_low_no_workout += 1
                else:
                    break
            if consecutive_low_no_workout >= 3:
                triggered.append("hrv_workout_compound")
                ctx = {}
                try:
                    recent_hrv = [
                        s.get("hrv_ms") for s in signals[:consecutive_low_no_workout]
                        if s.get("hrv_ms") is not None
                    ]
                    if recent_hrv:
                        avg_recent = sum(recent_hrv) / len(recent_hrv)
                        ctx["hrv_pct_below"] = round(
                            (1.0 - avg_recent / hrv_baseline) * 100
                        )
                    ctx["days_without_workout"] = consecutive_low_no_workout
                except Exception:
                    pass
                self._pattern_contexts["hrv_workout_compound"] = ctx

        # ── Social media spike ──
        consecutive_spike = 0
        for sig in signals[:5]:
            sm = sig.get("social_media_minutes")
            steps = sig.get("steps")
            if sm is not None and steps is not None and sm > 120 and steps < 3000:
                consecutive_spike += 1
            else:
                break
        if consecutive_spike >= 2:
            triggered.append("social_media_spike")
            ctx = {}
            try:
                sample = signals[:consecutive_spike]
                sm_vals = [s["social_media_minutes"] for s in sample if s.get("social_media_minutes") is not None]
                step_vals = [s["steps"] for s in sample if s.get("steps") is not None]
                if sm_vals:
                    ctx["avg_social_minutes"] = round(sum(sm_vals) / len(sm_vals))
                if step_vals:
                    ctx["avg_steps"] = round(sum(step_vals) / len(step_vals))
            except Exception:
                pass
            self._pattern_contexts["social_media_spike"] = ctx

        # ── Mindful streak (positive reinforcement) ──
        mindful_values = [
            s.get("mindful_minutes") for s in signals[:7]
            if s.get("mindful_minutes") is not None
        ]
        if len(mindful_values) >= 5:
            days_with_mindful = sum(1 for v in mindful_values if v > 0)
            if days_with_mindful >= 5:
                triggered.append("mindful_streak")
                self._pattern_contexts["mindful_streak"] = {"streak_days": days_with_mindful}

        # ── Recovery compound ──
        # Fires when spo2_avg < 94 OR (respiratory_rate_avg > 18 AND sleep_efficiency < 80)
        # for 2+ of the last 5 nights where data exists.
        poor_recovery_count = 0
        recovery_ctx_samples: list = []
        for sig in signals[:5]:
            spo2 = sig.get("spo2_avg")
            resp_rate = sig.get("respiratory_rate_avg")
            sleep_eff = sig.get("sleep_efficiency")
            if spo2 is None and resp_rate is None:
                continue
            spo2_poor = spo2 is not None and spo2 < 94
            resp_eff_poor = (
                resp_rate is not None
                and sleep_eff is not None
                and resp_rate > 18
                and sleep_eff < 80
            )
            if spo2_poor or resp_eff_poor:
                poor_recovery_count += 1
                recovery_ctx_samples.append(sig)
        if poor_recovery_count >= 2:
            triggered.append("recovery_compound")
            ctx = {}
            try:
                spo2_vals = [s["spo2_avg"] for s in recovery_ctx_samples if s.get("spo2_avg") is not None]
                resp_vals = [s["respiratory_rate_avg"] for s in recovery_ctx_samples if s.get("respiratory_rate_avg") is not None]
                eff_vals = [s["sleep_efficiency"] for s in recovery_ctx_samples if s.get("sleep_efficiency") is not None]
                if spo2_vals:
                    ctx["spo2_avg"] = round(sum(spo2_vals) / len(spo2_vals), 1)
                if resp_vals:
                    ctx["respiratory_rate_avg"] = round(sum(resp_vals) / len(resp_vals), 1)
                if eff_vals:
                    ctx["sleep_efficiency"] = round(sum(eff_vals) / len(eff_vals), 1)
            except Exception:
                pass
            self._pattern_contexts["recovery_compound"] = ctx

        # ── Balance & rhythm ──
        is_weekend = datetime.utcnow().weekday() >= 5
        if is_weekend:
            triggered.append("rhythm_weekend_recovery")
        steps_ok = today_signal.get("steps", 0) > 6000
        screen_ok = today_signal.get("total_screen_time_minutes", 0) < 180
        sleep_ok = today_signal.get("sleep_duration_minutes", 0) > 360
        if steps_ok and screen_ok and sleep_ok:
            triggered.append("rhythm_balanced_day")

        # ── movement_work_hours_gap ──
        # Requires optional hourly_steps field (dict: {"9": steps, "10": steps, ...}).
        # If field is absent (not yet provided by health kit integration), detection is skipped.
        work_windows = [(9, 12), (10, 13), (11, 14), (12, 15), (13, 16), (14, 17)]
        qualifying_days = 0
        calendar_overlap = False
        for sig in signals[:7]:
            hourly_steps = sig.get("hourly_steps")
            if not hourly_steps:
                continue
            for win_start, win_end in work_windows:
                window_steps = sum(
                    hourly_steps.get(str(h), 0) for h in range(win_start, win_end)
                )
                if window_steps < 300:
                    qualifying_days += 1
                    break  # count each day at most once
        if qualifying_days >= 3:
            triggered.append("movement_work_hours_gap")
            # Set calendar variant flag if back-to-back meetings were detected
            # (density data already fetched in calendar context block above)
            try:
                if user and (user.get("google_calendar_token") or user.get("microsoft_access_token")):
                    calendar_overlap = True
            except Exception:
                pass
            self._pattern_contexts["movement_work_hours_gap"] = {
                "use_calendar_variant": calendar_overlap
            }

        # ── sleep_late_bedtime ──
        # Sleep start after 23:30 on 3+ nights in the last 7 days.
        def _sleep_hour(t: str) -> float:
            """Convert HH:MM to a float hour, treating post-midnight times as 24+."""
            try:
                h, m = map(int, t.split(":"))
                val = h + m / 60.0
                return val + 24.0 if val < 3.0 else val
            except Exception:
                return 0.0

        sleep_starts_7d = [s.get("sleep_start") for s in signals[:7] if s.get("sleep_start")]
        if len(sleep_starts_7d) >= 3:
            late_nights = sum(1 for t in sleep_starts_7d if _sleep_hour(t) >= 23.5)
            if late_nights >= 3:
                triggered.append("sleep_late_bedtime")
                ctx = {}
                try:
                    # Average bedtime across the most recent 3 nights
                    sample = sleep_starts_7d[:3]
                    avg_hour = sum(_sleep_hour(t) for t in sample) / len(sample)
                    avg_hour = avg_hour % 24  # normalise back to 0–24 range
                    h = int(avg_hour)
                    m = round((avg_hour - h) * 60)
                    if m == 60:
                        h, m = (h + 1) % 24, 0
                    ampm = "am" if h < 12 else "pm"
                    h12 = h % 12 or 12
                    ctx["avg_bedtime"] = f"{h12}:{m:02d} {ampm}"
                except Exception:
                    pass
                self._pattern_contexts["sleep_late_bedtime"] = ctx

        # ── sleep_alarm_dependent ──
        # Consistent wake time (< 15 min spread) with inconsistent bedtime (> 60 min spread).
        # Requires at least 5 days of sleep data.
        wake_times_7d = [s.get("wake_time") for s in signals[:7] if s.get("wake_time")]
        sleep_starts_for_alarm = [s.get("sleep_start") for s in signals[:7] if s.get("sleep_start")]
        if len(wake_times_7d) >= 5 and len(sleep_starts_for_alarm) >= 5:
            def _to_minutes(t: str) -> int:
                try:
                    h, m = map(int, t.split(":"))
                    return h * 60 + m
                except Exception:
                    return 0

            wake_mins = [_to_minutes(t) for t in wake_times_7d[:5]]
            # Adjust post-midnight sleep starts: anything before 3am → add 24h
            sleep_mins_adj = []
            for t in sleep_starts_for_alarm[:5]:
                m = _to_minutes(t)
                sleep_mins_adj.append(m + 1440 if m < 180 else m)

            wake_range = max(wake_mins) - min(wake_mins)
            sleep_range = max(sleep_mins_adj) - min(sleep_mins_adj)
            if wake_range < 15 and sleep_range > 60:
                triggered.append("sleep_alarm_dependent")

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
            "recovery_compound",
            "hrv_workout_compound",
            "stress_hrv_low",
            "stress_resting_hr_elevated",
            "recovery_insufficient",
            "stress_back_to_back_meetings",
            "stress_heavy_meeting_day",
            "boundary_evening_work",
            "boundary_weekend_meetings",
            "poor_deep_sleep",
            "sleep_timing_inconsistent",
            "sleep_duration_short",
            "sleep_late_night_phone",
            "sleep_late_bedtime",
            "sleep_alarm_dependent",
            "outdoor_low_week",
            "morning_phone_early",
            "morning_phone_consistent",
            "movement_declining",
            "movement_sedentary_day",
            "movement_work_hours_gap",
            "standing_gap",
            "social_media_spike",
            "attention_social_media_heavy",
            "attention_high_pickups",
            "rhythm_weekend_recovery",
            "rhythm_balanced_day",
            "movement_good_streak",
            "outdoor_streak",
            "recovery_good",
            "attention_screen_improving",
            "mindful_streak",
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

    async def detect_patterns_for_orchestrator(self, user_id: str) -> list:
        """
        Like detect_patterns() but returns a list of dicts with trigger_id and context.
        Context entries are populated during detection (e.g. use_calendar_variant for
        movement_work_hours_gap). Used by NudgeOrchestrator for richer candidate construction.
        """
        triggered = await self.detect_patterns(user_id)
        return [
            {
                "trigger_id": t,
                "context": self._pattern_contexts.get(t, {}),
            }
            for t in triggered
        ]

    async def generate_weekly_narrative(
        self,
        user_id: str,
        patterns_detected: list,
        signals: list,
        baseline: dict,
    ) -> str:
        """
        Generate a 2-3 sentence weekly narrative using the Anthropic API.
        Falls back to hardcoded narratives if anthropic is unavailable or the call fails.
        """
        # Hardcoded fallbacks keyed by dominant category
        _fallbacks = {
            "morning_boundary": "Your mornings have been starting on someone else's terms. The phone is there before the day has had a chance to begin.",
            "movement": "Movement has been inconsistent this week. The body notices when it's not being used.",
            "sleep": "Sleep patterns have been shifting. Consistency is what your body clock needs most.",
            "attention": "Screen time and attention have been fragmented. The feed has been winning more than it should.",
            "recovery": "Recovery signals have been low. The week has been heavy.",
            "balance": "This week has had moments of real balance. That's worth carrying forward.",
            "outdoor": "Time outside has been low this week. The body uses natural light for more than it's given credit for.",
            "work_boundary": "Work has been bleeding into evenings and weekends. The recovery the week needs isn't happening.",
        }

        # Derive dominant category from triggered patterns
        category_counts: dict = {}
        for t in patterns_detected:
            cat = NUDGE_LIBRARY.get(t, {}).get("category", "other")
            category_counts[cat] = category_counts.get(cat, 0) + 1
        dominant = max(category_counts, key=category_counts.get) if category_counts else None

        def _fallback() -> str:
            return _fallbacks.get(dominant, "Koan has been observing your patterns this week.")

        if anthropic is None:
            return _fallback()

        import os
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return _fallback()

        try:
            # Build a compact context summary
            today = signals[0] if signals else {}
            context = {
                "patterns_detected": patterns_detected,
                "dominant_category": dominant,
                "signal_count": len(signals),
                "avg_steps": round(baseline.get("avg_steps") or 0),
                "avg_sleep_minutes": round(baseline.get("avg_sleep_duration") or 0),
                "avg_screen_time_minutes": round(baseline.get("avg_screen_time") or 0),
                "avg_pickups": round(baseline.get("avg_pickups") or 0),
                "today_steps": today.get("steps", 0),
                "today_sleep_minutes": today.get("sleep_duration_minutes", 0),
                "today_screen_time_minutes": today.get("total_screen_time_minutes", 0),
            }

            _MODEL = "claude-haiku-4-5-20251001"
            client = anthropic.AsyncAnthropic(api_key=api_key)
            response = await client.messages.create(
                model=_MODEL,
                max_tokens=200,
                system=(
                    "You are Koan, a calm behavioral companion that helps people "
                    "understand their wellbeing patterns. Write with a quiet, "
                    "observational tone — like a sentence you'd underline in a book. "
                    "No advice, no imperatives, no clichés. Never preachy."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Write a weekly reflection of 2-3 sentences based on this data:\n"
                        f"{context}\n\n"
                        "Observations should be grounded in the data. "
                        "Do not mention specific numbers. "
                        "Tone: understated, honest, not motivational."
                    ),
                }],
            )
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            await self.db.api_usage.insert_one({
                "user_id": user_id,
                "timestamp": datetime.utcnow(),
                "endpoint": "weekly_narrative",
                "model": _MODEL,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "success": True,
            })
            return response.content[0].text.strip()
        except Exception:
            try:
                await self.db.api_usage.insert_one({
                    "user_id": user_id,
                    "timestamp": datetime.utcnow(),
                    "endpoint": "weekly_narrative",
                    "model": "claude-haiku-4-5-20251001",
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "success": False,
                })
            except Exception:
                pass
            return _fallback()

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

        baseline = await self.get_baseline(user_id)

        # Build category summary for dominant calculation
        category_counts: dict = {}
        for t in triggered:
            cat = NUDGE_LIBRARY.get(t, {}).get("category", "other")
            category_counts[cat] = category_counts.get(cat, 0) + 1
        dominant = max(category_counts, key=category_counts.get) if category_counts else None

        narrative = await self.generate_weekly_narrative(user_id, triggered, signals, baseline)

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
