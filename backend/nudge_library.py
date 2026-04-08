"""
Koan Nudge Library
Grounded in: circadian research, blue zone principles, Andrei Roșu longevity framework,
and the 15 behaviours of the top 1% of healthy people.
Each nudge has a trigger_id, principle, and one or more message variants.
The engine picks randomly from variants to avoid repetition.
"""

import random
from typing import Optional

NUDGE_LIBRARY = {

    # ── MORNING BOUNDARIES ──────────────────────────────────────────────
    "morning_phone_early": {
        "principle": "The first 30-60 minutes of the day belong to you, not your phone.",
        "category": "morning_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "First phone pickup before 7am, 2 consecutive days",
        "messages": [
            "The first 30 minutes of the day are the most uncontested time you have. Your phone was already there.",
            "Two mornings in a row, the phone before anything else. That window shapes the cortisol pattern for everything that follows.",
            "Before coffee, before light, before a thought of your own — the phone. That first reach is a habit forming.",
        ]
    },
    "morning_phone_consistent": {
        "principle": "Cortisol rises naturally in the morning — don't add to it with notifications.",
        "category": "morning_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "First phone pickup before 7am, 7 consecutive days",
        "messages": [
            "Every morning this week, the phone first. That's not a coincidence anymore — it's a settled habit. Habits can be redesigned.",
            "Seven days of the same first reach. The body has already decided what the morning looks like. The question is whether you have.",
            "A week of mornings that started the same way. Cortisol peaks naturally in the first hour — the phone adds to that load every time.",
        ]
    },

    # ── MOVEMENT ────────────────────────────────────────────────────────
    "movement_declining": {
        "principle": "Daily movement integrated into life — not exercise — is what the longest-lived people have in common.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Step count declining vs baseline for 4 consecutive days",
        "messages": [
            "Movement has been fading since Monday. The longest-lived people don't exercise — they just never stop moving. Even 20 minutes changes the afternoon.",
            "Four days of fewer steps. The body notices drift before the mind does — and it takes longer to recover than to lose.",
            "This week's movement has been lower than your usual. A walk after dinner does more for the next morning than another hour at the desk.",
        ]
    },
    "movement_sedentary_day": {
        "principle": "Sitting for long periods raises inflammation markers even in otherwise active people.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Steps below 3000 in a day. Only fires if movement_declining has NOT fired in the last 3 days.",
        "messages": [
            "Mostly still today. Ten minutes outside interrupts the pattern — the body responds faster than you'd expect.",
            "A long day on screens, a short day on your feet. Even a short walk after dinner resets more than another hour of catching up.",
            "Low movement day. The research is clear: it's the interruption of sitting, not just the total steps, that matters most.",
        ]
    },
    "movement_good_streak": {
        "principle": "Consistent movement is more protective than intense occasional exercise.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "3+ consecutive days above movement baseline. Max once per 14 days.",
        "messages": [
            "Three days of consistent movement. Not the amount — just that it kept happening. That's the thing.",
            "You've been moving every day this week. The body is starting to expect it.",
            "Movement has been consistent. Small and steady is what actually compounds over time.",
        ]
    },
    "movement_work_hours_gap": {
        "principle": "Prolonged unbroken sitting during work hours raises inflammation and impairs cognitive performance.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Any 3-4 hour window between 9am and 5pm with fewer than 300 steps total, on 3+ days in a week. Check all possible windows: 9-12, 10-1, 11-2, 12-3, 1-4, 2-5. Fire if any window qualifies. If calendar data is available and shows meetings in that window, use the calendar variant message.",
        "messages": [
            "Koan noticed a long stretch without movement during your workday. Even two minutes changes what the next hour costs you.",
            "A few hours passed this afternoon without any real movement. That's when focus fades and the body stiffens — a short walk interrupts both.",
            "Three days this week with a long unbroken sit during work hours. The energy dip that follows isn't inevitable — movement prevents it.",
            "[Calendar] Back-to-back meetings through a long stretch again. The body pays a physical cost for that. Even a two-minute walk between them changes what the next one costs you.",
        ]
    },
    "standing_gap": {
        "principle": "Breaking up sitting with even brief standing or walking every 90-120 minutes measurably reduces cardiovascular and metabolic risk.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "No movement (fewer than 50 steps) detected for 2 consecutive hours during waking hours (7am-10pm). Uses step count data from Apple Health or signalCollector. Fire at most once per day.",
        "messages": [
            "You haven't moved in the past two hours. Take a short walk — even two minutes is enough to reset the body.",
            "Two hours without movement. The body wasn't built for this much stillness — standing up now changes the next stretch.",
            "A long sit. Getting up for even a few minutes interrupts what prolonged sitting does to circulation and focus.",
        ]
    },

    # ── SLEEP ───────────────────────────────────────────────────────────
    "sleep_timing_inconsistent": {
        "principle": "Sleep consistency matters more than duration. The body clock is more sensitive to timing than to hours.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Bedtime variance greater than 90 minutes across 5 of last 7 days",
        "messages": [
            "Your sleep timing has been shifting all week. The body clock is more sensitive to when you sleep than how long.",
            "Different bedtimes most nights this week. Consistency of timing protects sleep quality more than adding an extra hour does.",
            "Koan has noticed your sleep schedule drifting this week. The circadian rhythm notices that before you do.",
        ]
    },
    "sleep_late_night_phone": {
        "principle": "Blue light and stimulation in the last hour before sleep delays melatonin by 90 minutes.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Phone active after 10:30pm for more than 15 minutes, 3+ nights",
        "messages": [
            "Your phone was active late last night. The last hour before sleep is worth protecting.",
            "Late screen time doesn't just delay sleep — it changes the quality of what follows.",
            "Three nights of late phone use. Melatonin is delayed by light exposure — the body doesn't know the difference between a screen and the sun.",
        ]
    },
    "sleep_duration_short": {
        "principle": "Chronic sleep restriction below 7 hours accelerates biological aging.",
        "category": "sleep",
        "longevity_factor": "cellular_senescence",
        "threshold": "Average sleep duration below 7 hours over 4+ consecutive days",
        "messages": [
            "A few short nights in a row. The body doesn't catch up as fast as it falls behind.",
            "Sleep has been short this week. Repair happens at night — less time means less of it.",
            "Short sleep compresses recovery. The deficit from this week will show up somewhere.",
        ]
    },
    "sleep_late_bedtime": {
        "principle": "Sleep before midnight has different restorative properties — slow-wave sleep is front-loaded in the night.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Sleep start after 11:30pm, 3+ nights in a row",
        "messages": [
            "Lights out after midnight again. The hours before 12 recover you differently than the hours after.",
            "Three late nights. The body doesn't negotiate on sleep timing the way it does on sleep duration.",
            "Late to bed most of this week. The circadian clock keeps its own schedule regardless of yours.",
        ]
    },
    "sleep_alarm_dependent": {
        "principle": "Consistent wake times forced by alarm against variable bedtimes creates chronic social jet lag.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Wake time variance less than 15 minutes but sleep start variance greater than 60 minutes, over 7 days",
        "messages": [
            "Consistent alarm, inconsistent bedtime. The alarm is compensating for the clock — but the body keeps the bill.",
            "You're waking at the same time every day, going to bed at different hours. The body prefers both ends to be stable.",
            "The alarm keeps the mornings consistent. The evenings are less predictable. That asymmetry has a cost.",
        ]
    },

    # ── ATTENTION & SCREEN ───────────────────────────────────────────────
    "attention_social_media_heavy": {
        "principle": "Protecting attention is one of the 15 behaviours of the top 1% of healthy people.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "Social media app sessions exceed 40% of total screen time AND social media time exceeds 60 minutes. Requires social_media_minutes field from signalCollector.",
        "messages": [
            "More than half of today's screen time was social media. That's not connection — that's drift.",
            "The feed is designed to keep you there. Noticing that is the first step.",
            "An hour of social media rarely leaves you feeling better. Today was heavy on it.",
        ]
    },
    "attention_high_pickups": {
        "principle": "Frequent phone pickups fragment attention and raise baseline cortisol.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "More than 80 pickups in a day, or more than 40% above the user's 7-day baseline",
        "messages": [
            "You picked up your phone a lot today. Each pickup is a small interruption to whatever you were doing.",
            "Frequent pickups aren't always about the phone — sometimes they're about avoiding something else.",
            "A high pickup day. The phone becomes a reflex before it becomes a choice. That gap is worth noticing.",
        ]
    },
    "attention_screen_improving": {
        "principle": "Reducing screen time has compounding benefits on sleep, stress, and focus.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "Screen time down more than 20% vs prior week average, 3+ days. Max once per 14 days.",
        "messages": [
            "Screen time has been lower this week. Your attention is quieter than it was.",
            "Less time on the phone, more time somewhere else. That's worth noticing.",
            "A week of less screen time. The attention you didn't spend on the phone went somewhere.",
        ]
    },

    # ── STRESS & RECOVERY ────────────────────────────────────────────────
    "stress_hrv_low": {
        "principle": "HRV is the body's report card on recovery. Low HRV means the nervous system needs rest, not more input.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "HRV more than 20% below user's 30-day baseline, 3+ consecutive days",
        "messages": [
            "Your body's recovery signals are low. This isn't a push-through moment.",
            "Low HRV doesn't mean something is wrong — it means something needs rest.",
            "The week has left its mark on your recovery signals. The body is asking for less, not more.",
        ]
    },
    "stress_resting_hr_elevated": {
        "principle": "Elevated resting heart rate sustained over days indicates chronic stress load.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "Resting HR more than 8bpm above user's 30-day baseline, 3+ consecutive days",
        "messages": [
            "Your resting heart rate has been higher than usual. The body is carrying something.",
            "Elevated heart rate over several days is the body asking for less, not more.",
            "Three days of elevated resting heart rate. That's not a one-off — it's a signal about load.",
        ]
    },
    "stress_back_to_back_meetings": {
        "principle": "The mind needs transition time between focused demands — back-to-back meetings erode cognitive quality.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "3+ consecutive calendar events with fewer than 10 minutes gap, in a single day. Requires calendar connection.",
        "messages": [
            "Back-to-back meetings today. Even two minutes between them changes what the next one costs you.",
            "No gaps between meetings means no recovery between demands. That compounds through the day.",
            "A day without transitions. The mind needs even a short gap between demands — back-to-back erodes quality faster than people expect.",
        ]
    },
    "stress_heavy_meeting_day": {
        "principle": "More than 5 hours of meetings in a day leaves no cognitive reserve for the rest of life.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "More than 5 hours of calendar events in a single day. Requires calendar connection.",
        "messages": [
            "A heavy meeting day. Tonight is for nothing in particular.",
            "Five hours of meetings is a lot of being on. The evening doesn't need to be productive.",
            "Most of the day was other people's agendas. The evening belongs to you.",
        ]
    },

    # ── OUTDOOR TIME ─────────────────────────────────────────────────────
    "outdoor_low_week": {
        "principle": "Natural light exposure regulates cortisol, melatonin, and attention restoration.",
        "category": "outdoor",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Outdoor time below 20 minutes per day average, over 5 of last 7 days. Source: Apple Health outdoor minutes.",
        "messages": [
            "Most of this week has been indoors. The nervous system notices the absence of natural light before you do.",
            "Five days mostly inside. The body uses daylight to calibrate more than just mood.",
            "Outdoor time has been low this week. Even 20 minutes in natural light changes what the afternoon costs you.",
        ]
    },
    "outdoor_streak": {
        "principle": "Consistent outdoor exposure aligns the circadian clock and restores directed attention.",
        "category": "outdoor",
        "longevity_factor": "stress_chronic",
        "threshold": "Outdoor time above 20 minutes per day for 4+ consecutive days. Max once per 14 days.",
        "messages": [
            "You've been getting outside consistently this week. That's doing more than it looks like.",
            "Four days of regular outdoor time. The circadian rhythm has something to work with.",
            "Consistent time outside this week. That's one of the quieter forms of self-care.",
        ]
    },

    # ── WORKOUT RECOVERY ─────────────────────────────────────────────────
    "recovery_insufficient": {
        "principle": "Elevated resting heart rate after intense activity signals the body hasn't restored yet.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "Resting HR elevated more than 5bpm above baseline the day after a high active-minutes day",
        "messages": [
            "Yesterday was heavy. Your resting heart rate hasn't come back down yet.",
            "Hard effort yesterday, elevated heart rate today. The body is still in the middle of the last thing.",
            "The workout landed. The recovery hasn't caught up. That gap is where most overtraining starts.",
        ]
    },
    "recovery_good": {
        "principle": "Rising HRV after training load signals adaptation is occurring.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "HRV rising after 3+ days of high training load. Max once per 14 days.",
        "messages": [
            "Recent training load has been high, and your HRV is rising. The body is adapting.",
            "You've been putting in the work, and the recovery signals are responding. That's the cycle working.",
            "HRV up after a demanding stretch. The effort is converting.",
        ]
    },

    # ── WORK-LIFE BOUNDARY ───────────────────────────────────────────────
    "boundary_evening_work": {
        "principle": "Evening work hours displace recovery and psychological detachment.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "Calendar events after 7pm on 3+ evenings in a week. Requires calendar connection.",
        "messages": [
            "Three evenings this week with work on the calendar. The day keeps not ending.",
            "Late meetings most nights this week. The evening is part of the day too.",
            "Work has been running past 7pm most nights. The body needs the day to have an end.",
        ]
    },
    "boundary_weekend_meetings": {
        "principle": "Weekend work interrupts the psychological recovery that weekends exist to provide.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "Any calendar event on Saturday or Sunday. Requires calendar connection.",
        "messages": [
            "There's a meeting on your weekend. The weekend is the only part of the week that doesn't need a meeting.",
            "Calendar events on a weekend. Recovery requires time without demands — even scheduled ones.",
            "A weekend meeting. The body doesn't distinguish between a calendar block and a workday when it's trying to rest.",
        ]
    },

    # ── RHYTHM & BALANCE ─────────────────────────────────────────────────
    "rhythm_balanced_day": {
        "principle": "A balanced day — movement, rest, focus, limited screens — is the oldest form of health.",
        "category": "balance",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Score 1 point per condition met: (1) steps >= 7000, (2) total screen time <= 3 hours, (3) no phone use after 10pm, (4) sleep start previous night before 11pm, (5) calendar meetings <= 4 hours if calendar connected. Fire if 3 or more conditions are met.",
        "messages": [
            "Yesterday ticked several boxes quietly — movement, rest, reasonable screens. Those days are rarer than they should be.",
            "Koan noticed a good day yesterday. Not one big thing — a few small ones that came together.",
            "A balanced day by most measures. Movement, rest, some quiet. That combination is the whole formula.",
        ]
    },
    "rhythm_weekend_recovery": {
        "principle": "Weekends restore what the week depletes — but only when the conditions for recovery are actually met.",
        "category": "balance",
        "longevity_factor": "stress_chronic",
        "threshold": "Score 1 point per condition: (1) no calendar meetings, (2) steps >= 5000, (3) sleep previous night >= 7 hours, (4) social media time < 45 minutes. Fire if 3 or more conditions are met. Only fires on Saturday or Sunday.",
        "messages": [
            "Yesterday had most of what a weekend should — movement, rest, some quiet. That's what recovery actually looks like.",
            "A real weekend day. Not because it was perfect, but because it was unhurried and the body got what it needed.",
            "Koan noticed the weekend actually felt like one. Most of the recovery signals were there. That matters.",
        ]
    },
}


def get_nudge_message(trigger_id: str) -> Optional[dict]:
    """Get a nudge from the library by trigger ID, picking a random message variant."""
    nudge = NUDGE_LIBRARY.get(trigger_id)
    if not nudge:
        return None
    return {
        "trigger_id": trigger_id,
        "category": nudge["category"],
        "principle": nudge["principle"],
        "longevity_factor": nudge["longevity_factor"],
        "message": random.choice(nudge["messages"]),
    }


def get_nudges_by_category(category: str) -> list:
    """Get all nudge trigger IDs for a given category."""
    return [k for k, v in NUDGE_LIBRARY.items() if v["category"] == category]


def get_all_categories() -> list:
    return list(set(v["category"] for v in NUDGE_LIBRARY.values()))
