"""
Koan Nudge Library
Grounded in circadian research, blue-zone living, and longevity practice.
Each nudge has a trigger_id, principle, and one or more message variants.
The engine picks randomly from variants to avoid repetition.

Voice: cool observational. Concrete over abstract, present over prescriptive,
one thought per line. No statistics, no imperatives without an observation
first, no motivational register, no first-person plural.
"""

import random
from typing import Optional

NUDGE_LIBRARY = {

    # ── MORNING BOUNDARIES ──────────────────────────────────────────────
    "morning_phone_early": {
        "principle": "The first minutes of the day set its tone. The phone is happy to take them.",
        "category": "morning_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "First phone pickup before 7am, 2 consecutive days",
        "messages": [
            "The first minutes of the day, and the phone was already in them.",
            "Two mornings running, the screen before the window. The day starts on someone else's terms.",
            "Before coffee, before light, before a thought of your own — the phone.",
        ],
        "personalised_messages": [
            "Two mornings running, the phone first — by {first_pickup_time}, before the day was yours.",
        ]
    },
    "morning_phone_consistent": {
        "principle": "Cortisol rises on its own in the morning. The phone adds to a load already climbing.",
        "category": "morning_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "First phone pickup before 7am, 7 consecutive days",
        "messages": [
            "Every morning this week, the phone first. Not a slip anymore — a shape the day has taken.",
            "Seven mornings, the same first reach. The hand knows the way before the eyes are open.",
            "A week of mornings that began on the screen. The day was decided before it started.",
        ]
    },

    # ── MOVEMENT ────────────────────────────────────────────────────────
    "movement_declining": {
        "principle": "The longest-lived people don't exercise. They live in ways that keep them moving.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Step count declining vs baseline for 4 consecutive days",
        "messages": [
            "Movement has been thinning since Monday. The body drifts quietly, and comes back slowly.",
            "Four days of fewer steps. The legs forget faster than the calendar does.",
            "Less moving this week than usual. A walk after dinner does more for the morning than another hour at the desk.",
        ],
        "personalised_messages": [
            "Four days under the usual {avg_steps_formatted}. The body drifts before the mind notices.",
            "Movement thinning this week — around {current_avg_steps} steps against the usual {avg_steps_formatted}.",
        ]
    },
    "movement_sedentary_day": {
        "principle": "It is the sitting unbroken, more than the step count, that the body minds.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Steps below 3000 in a day. Only fires if movement_declining has NOT fired in the last 3 days.",
        "messages": [
            "Mostly still today. Ten minutes outdoors breaks the spell faster than it sounds.",
            "A long day on the screen, a short one on the feet.",
            "Low movement today. It is the sitting, more than the missing steps, that the body keeps.",
        ],
        "personalised_messages": [
            "Under {steps_today} steps today. Ten minutes outside is enough to change the shape of it.",
        ]
    },
    "movement_good_streak": {
        "principle": "Consistent movement protects more than intense, occasional effort.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "3+ consecutive days above movement baseline. Max once per 14 days.",
        "messages": [
            "Three days of moving, every one of them. Not the amount — that it kept happening.",
            "Movement every day this week. The body is starting to expect it.",
            "Steady on the feet this week. Small and repeated is the thing that compounds.",
        ]
    },
    "movement_work_hours_gap": {
        "principle": "Long unbroken sitting through the workday stiffens the body and dulls the mind.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Any 3-4 hour window between 9am and 5pm with fewer than 300 steps total, on 3+ days in a week. Check all possible windows: 9-12, 10-1, 11-2, 12-3, 1-4, 2-5. Fire if any window qualifies. If calendar data is available and shows meetings in that window, use the calendar variant message.",
        "messages": [
            "A long stretch of the workday passed without movement. Two minutes changes the hour that follows.",
            "An afternoon went by in the chair. Focus fades and the body stiffens in the same stillness; a short walk loosens both.",
            "Three days this week, a long unbroken sit through working hours. The slump that follows isn't fated — it's seated.",
            "[Calendar] Back-to-back through a long stretch again. A body holds the meetings in the shoulders. Two minutes between them changes the next.",
        ]
    },
    "standing_gap": {
        "principle": "Breaking up sitting every couple of hours steadies circulation and attention both.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "threshold": "No movement (fewer than 50 steps) detected for 2 consecutive hours during waking hours (7am-10pm). Uses step count data from Apple Health or signalCollector. Fire at most once per day.",
        "messages": [
            "Two hours without moving. The body stiffens in the stillness; a few steps undo it.",
            "A long sit. Circulation and attention both slow in it — standing breaks both.",
            "Still for two hours. The body wasn't built to hold one shape this long.",
        ]
    },

    # ── SLEEP ───────────────────────────────────────────────────────────
    "sleep_timing_inconsistent": {
        "principle": "The body clock is more sensitive to when you sleep than to how long.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Bedtime variance greater than 90 minutes across 5 of last 7 days",
        "messages": [
            "Sleep landed at a different hour most nights this week. The clock minds the when more than the how long.",
            "Different bedtimes all week. Steady timing protects sleep more than an added hour does.",
            "The sleep schedule has been drifting. The body keeps the time even when the calendar doesn't.",
        ],
        "personalised_messages": [
            "Bedtime moved by as much as {sleep_variance_minutes} minutes this week. The clock notices that before you do.",
        ]
    },
    "sleep_late_night_phone": {
        "principle": "Light in the last hour before sleep pushes the whole night later.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Phone active after 10:30pm for more than 15 minutes, 3+ nights",
        "messages": [
            "The screen was on past 11 again. The last hour before sleep is worth keeping dark.",
            "Late light, three nights running. The body reads a screen the way it reads the sun.",
            "Three nights of the phone past bedtime. Sleep still comes, but thinner.",
        ]
    },
    "sleep_duration_short": {
        "principle": "Short sleep, repeated, wears the body down from the inside.",
        "category": "sleep",
        "longevity_factor": "cellular_senescence",
        "threshold": "Average sleep duration below 7 hours over 4+ consecutive days",
        "messages": [
            "A few short nights in a row. The body falls behind faster than it catches up.",
            "Sleep has been short this week. Repair happens in the hours that went missing.",
            "Short nights compress the night's work. The shortfall surfaces somewhere later.",
        ],
        "personalised_messages": [
            "A few short nights running — nearer {avg_sleep_hours}h than the usual {baseline_sleep_hours}h.",
        ]
    },
    "sleep_late_bedtime": {
        "principle": "The deep, slow-wave sleep is front-loaded. The hours before midnight carry it.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Sleep start after 11:30pm, 3+ nights in a row",
        "messages": [
            "Lights out after midnight again. The hours before twelve restore differently than the ones after.",
            "Three late nights. The body argues less about how long than about when.",
            "Late to bed most of the week. The clock keeps its own hours regardless.",
        ],
        "personalised_messages": [
            "Asleep near {avg_bedtime} again. The hours before midnight do the deeper work.",
        ]
    },
    "sleep_alarm_dependent": {
        "principle": "A fixed alarm against a wandering bedtime is its own quiet kind of jet lag.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Wake time variance less than 15 minutes but sleep start variance greater than 60 minutes, over 7 days",
        "messages": [
            "Steady alarm, wandering bedtime. The morning holds its line; the body keeps the difference.",
            "Same wake time, a different hour asleep each night. The body prefers both ends fixed.",
            "The alarm steadies the mornings. The evenings drift. That gap has a quiet cost.",
        ]
    },

    # ── ATTENTION & SCREEN ───────────────────────────────────────────────
    "attention_social_media_heavy": {
        "principle": "Attention is the rarest thing the day spends. Guarding it is its own discipline.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "Social media sessions make up more than two-fifths of screen time and exceed 60 minutes. Requires social_media_minutes field from signalCollector.",
        "messages": [
            "Most of today's screen went to the feed. That's not connection — that's the current.",
            "The feed is built to hold you. Noticing the pull is most of the work.",
            "A long stretch in the feed today. It rarely leaves the day better than it found it.",
        ],
        "personalised_messages": [
            "{social_media_minutes} minutes in the feed today — most of the screen. Not connection. Drift.",
        ]
    },
    "attention_high_pickups": {
        "principle": "Each pickup is a small cut in whatever was underway. The reflex arrives before the reason.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "More than 80 pickups in a day, or well above the user's 7-day baseline",
        "messages": [
            "The phone went in and out of the hand all day. Each time, a small cut in whatever was underway.",
            "A lot of reaching for the phone today. The reflex arrives before the reason.",
            "A high-pickup day. Sometimes the phone is the thing; sometimes it's the not-the-other-thing.",
        ],
        "personalised_messages": [
            "{pickups_today} pickups today, {pickups_above_baseline} past the usual. Each one a small interruption.",
        ]
    },
    "attention_screen_improving": {
        "principle": "Less screen has a quiet way of compounding into sleep, focus, and ease.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "threshold": "Screen time down markedly versus the prior week, 3+ days. Max once per 14 days.",
        "messages": [
            "Less screen this week. The attention is quieter than it was.",
            "Fewer hours on the phone. They went somewhere — that's worth seeing.",
            "A lighter week on the screen. The time not spent there landed elsewhere.",
        ]
    },

    # ── STRESS & RECOVERY ────────────────────────────────────────────────
    "stress_hrv_low": {
        "principle": "HRV is the body's report on its own recovery. Low means rest, not more input.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "HRV well below user's 30-day baseline, 3+ consecutive days",
        "messages": [
            "The recovery signals are low. This isn't a push-through stretch.",
            "Low HRV isn't a fault. It's a request for rest.",
            "The week left its mark on recovery. The body is asking for less.",
        ],
        "personalised_messages": [
            "HRV sitting below its usual line this week. That's the body asking for rest, not effort.",
        ]
    },
    "stress_resting_hr_elevated": {
        "principle": "A resting pulse held high across days is the body carrying a load it hasn't set down.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "Resting HR more than 8bpm above user's 30-day baseline, 3+ consecutive days",
        "messages": [
            "Resting heart rate has run high for days. The body is holding something it hasn't set down.",
            "A raised resting pulse, several mornings now. Not a one-off — a load.",
            "The heart has idled higher than usual this week. Something is still being carried.",
        ],
        "personalised_messages": [
            "Resting pulse near {rhr_current} this week, {rhr_delta} above the usual line. Something is being carried.",
        ]
    },
    "stress_back_to_back_meetings": {
        "principle": "The mind needs a seam between demands. Back-to-back wears it thin.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "3+ consecutive calendar events with fewer than 10 minutes gap, in a single day. Requires calendar connection.",
        "messages": [
            "Back-to-back meetings today. Two minutes between them changes the next.",
            "No gaps means no recovery between demands. It accrues across the day.",
            "A day without transitions. The mind needs the seam between things; back-to-back wears it thin.",
        ],
        "personalised_messages": [
            "{meeting_count} meetings nose-to-tail today. Even two minutes between would change the next.",
        ]
    },
    "stress_heavy_meeting_day": {
        "principle": "A day spent being on leaves no reserve for the rest of life. The evening doesn't owe anyone.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "threshold": "More than 5 hours of calendar events in a single day. Requires calendar connection.",
        "messages": [
            "A heavy day of meetings. Tonight is for nothing in particular.",
            "Hours of being on. The evening doesn't owe anyone productivity.",
            "Most of the day ran on other people's agendas. The evening is yours.",
        ],
        "personalised_messages": [
            "{meeting_hours} hours of meetings today. The evening is for nothing in particular.",
        ]
    },

    # ── OUTDOOR TIME ─────────────────────────────────────────────────────
    "outdoor_low_week": {
        "principle": "Daylight calibrates more than mood. The body sets its clock by light it actually gets.",
        "category": "outdoor",
        "longevity_factor": "hormonal_dysregulation",
        "threshold": "Outdoor time below 20 minutes per day average, over 5 of last 7 days. Source: Apple Health outdoor minutes.",
        "messages": [
            "Most of the week was spent indoors. The nervous system misses daylight before the mind does.",
            "Five days mostly inside. The body keeps its clock by light it didn't get.",
            "Little time outside this week. Twenty minutes of daylight changes the afternoon.",
        ]
    },
    "outdoor_streak": {
        "principle": "Regular daylight steadies the clock and restores worn attention.",
        "category": "outdoor",
        "longevity_factor": "stress_chronic",
        "threshold": "Outdoor time above 20 minutes per day for 4+ consecutive days. Max once per 14 days.",
        "messages": [
            "Outside most days this week. It's doing more than it looks like.",
            "Four days of daylight in a row. The clock has something steady to work from.",
            "Regular time outside this week — one of the quieter repairs.",
        ]
    },

    # ── WORKOUT RECOVERY ─────────────────────────────────────────────────
    "recovery_insufficient": {
        "principle": "A pulse still high the day after hard effort means the body hasn't restored yet.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "Resting HR elevated more than 5bpm above baseline the day after a high active-minutes day",
        "messages": [
            "Yesterday was heavy. The resting pulse hasn't come back down.",
            "Hard effort yesterday, the heart still high today. The body is mid-sentence with the last thing.",
            "The work landed; the recovery hasn't. That gap is where overreaching begins.",
        ]
    },
    "recovery_good": {
        "principle": "HRV rising after a hard run of days is the body adapting to the load.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "threshold": "HRV rising after 3+ days of high training load. Max once per 14 days.",
        "messages": [
            "A demanding stretch, and the recovery signals are rising. The body is adapting.",
            "The work went in; the body is answering. That's the cycle doing its work.",
            "Recovery climbing after a hard run of days. The effort is converting.",
        ]
    },

    # ── WORK-LIFE BOUNDARY ───────────────────────────────────────────────
    "boundary_evening_work": {
        "principle": "Evening work crowds out the detachment that recovery needs.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "Calendar events after 7pm on 3+ evenings in a week. Requires calendar connection.",
        "messages": [
            "Three evenings this week with work on the calendar. The day keeps not ending.",
            "Late meetings most nights. The evening is part of the day too.",
            "Work ran past seven most nights. The body needs the day to have an edge.",
        ]
    },
    "boundary_weekend_meetings": {
        "principle": "The weekend exists to interrupt the week. Work crosses into it at a cost.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "threshold": "Any calendar event on Saturday or Sunday. Requires calendar connection.",
        "messages": [
            "A meeting on the weekend. The one stretch that doesn't need one.",
            "Work on a Saturday. Rest needs hours with no demand in them.",
            "A weekend on the calendar. The body doesn't tell a meeting from a workday when it's trying to rest.",
        ]
    },

    # ── RHYTHM & BALANCE ─────────────────────────────────────────────────
    "rhythm_balanced_day": {
        "principle": "A day of movement, rest, focus, and quiet screens is the oldest form of health.",
        "category": "balance",
        "longevity_factor": "inflammation_chronic",
        "threshold": "Score 1 point per condition met: (1) steps >= 7000, (2) total screen time <= 3 hours, (3) no phone use after 10pm, (4) sleep start previous night before 11pm, (5) calendar meetings <= 4 hours if calendar connected. Fire if 3 or more conditions are met.",
        "messages": [
            "Yesterday quietly did several things right — moving, resting, the screen set down. Rarer than it should be.",
            "A good day yesterday. Not one big thing; a few small ones that lined up.",
            "A balanced day by most measures — some movement, some rest, some quiet. That's the whole of it.",
        ]
    },
    "rhythm_weekend_recovery": {
        "principle": "Weekends restore the week, but only when the conditions for rest are actually met.",
        "category": "balance",
        "longevity_factor": "stress_chronic",
        "threshold": "Score 1 point per condition: (1) no calendar meetings, (2) steps >= 5000, (3) sleep previous night >= 7 hours, (4) social media time < 45 minutes. Fire if 3 or more conditions are met. Only fires on Saturday or Sunday.",
        "messages": [
            "Yesterday had most of what a weekend is for — movement, rest, some quiet.",
            "A real weekend day. Not perfect — unhurried, and the body took what it needed.",
            "The weekend felt like one. Most of the recovery was there. That counts.",
        ]
    },

    # ── WISDOM ──────────────────────────────────────────────────────────
    # Wisdom nudges are the rarest category — at most once per ~12 days.
    # Each is tied to one or more trigger patterns (see "triggers"); the
    # orchestrator prefers a line whose pattern is active right now.
    # One observation per entry, in the voice of a sentence you'd underline.

    "wisdom_movement_woven": {
        "principle": "Movement belongs in the structure of a day, not the schedule of one.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["movement_declining", "movement_work_hours_gap", "movement_sedentary_day"],
        "messages": [
            "Movement was once woven into the day, not scheduled into it.",
        ]
    },
    "wisdom_walk_is_what_you_are": {
        "principle": "A walk is closer to what a body is than to a thing a body does.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["movement_declining", "standing_gap"],
        "messages": [
            "A walk isn't exercise. It's nearer to what a body is for.",
        ]
    },
    "wisdom_chair_opinion": {
        "principle": "Comfort and rest are not the same thing. The chair confuses them.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["standing_gap", "movement_work_hours_gap"],
        "messages": [
            "The chair is comfortable. The body keeps a different opinion.",
        ]
    },
    "wisdom_old_clock": {
        "principle": "The internal clock predates the calendar and keeps time either way.",
        "category": "wisdom",
        "longevity_factor": "hormonal_dysregulation",
        "triggers": ["sleep_timing_inconsistent", "sleep_alarm_dependent"],
        "messages": [
            "The body runs on a clock older than the calendar. It keeps time either way.",
        ]
    },
    "wisdom_dark_hour": {
        "principle": "The hour before sleep was dark for nearly all of human history.",
        "category": "wisdom",
        "longevity_factor": "hormonal_dysregulation",
        "triggers": ["sleep_late_night_phone", "sleep_late_bedtime"],
        "messages": [
            "The last hour before sleep was dark for most of human history. The body still expects it.",
        ]
    },
    "wisdom_sleep_repair": {
        "principle": "Sleep is when the body does its repairs, on its own schedule.",
        "category": "wisdom",
        "longevity_factor": "cellular_senescence",
        "triggers": ["sleep_duration_short", "sleep_late_bedtime"],
        "messages": [
            "Sleep does its repairs at night, and keeps its own hours.",
        ]
    },
    "wisdom_plants_were_medicine": {
        "principle": "Plant-forward eating is medicine taken as food, not instead of it.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["rhythm_balanced_day", "rhythm_weekend_recovery"],
        "messages": [
            "The plants on the plate were the medicine. The medicine was just lunch.",
        ]
    },
    "wisdom_hara_hachi_bu": {
        "principle": "Eating to most-of-the-way-full is its own old discipline.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["rhythm_balanced_day"],
        "messages": [
            "Hara hachi bu. Eat to eight parts of ten, and stop.",
        ]
    },
    "wisdom_morning_light": {
        "principle": "Morning light is the strongest signal the body has for setting its day.",
        "category": "wisdom",
        "longevity_factor": "hormonal_dysregulation",
        "triggers": ["morning_phone_early", "sleep_timing_inconsistent", "outdoor_low_week"],
        "messages": [
            "Morning light tells the body what time it is. Nothing else does it as well.",
        ]
    },
    "wisdom_assembled_outdoors": {
        "principle": "The body was assembled outdoors. Indoors is the recent arrangement.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["outdoor_low_week"],
        "messages": [
            "You were assembled outdoors. The inside is the recent experiment.",
        ]
    },
    "wisdom_attention_is_a_life": {
        "principle": "Attention is the currency a life is spent in. It is also the one the feed wants.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["attention_social_media_heavy", "attention_high_pickups"],
        "messages": [
            "Attention is the one currency that buys a life. The feed knows it too.",
        ]
    },
    "wisdom_short_vs_long_stress": {
        "principle": "Acute stress sharpens; chronic stress erodes. The body can't always tell them apart.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["stress_hrv_low", "stress_resting_hr_elevated"],
        "messages": [
            "Short stress sharpens. Long stress erodes. The body can't tell a deadline from a predator.",
        ]
    },
    "wisdom_the_seam": {
        "principle": "The mind lands in the gap between things. Back-to-back removes the gap.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["stress_back_to_back_meetings", "stress_heavy_meeting_day"],
        "messages": [
            "The mind needs a seam between things. Back-to-back leaves nowhere to land.",
        ]
    },
    "wisdom_overwork_invoice": {
        "principle": "Sustained overwork is a debt the body settles later, with interest.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["boundary_evening_work", "boundary_weekend_meetings", "stress_heavy_meeting_day"],
        "messages": [
            "The body keeps the invoice for overwork, and pays it later.",
        ]
    },
    "wisdom_rest_is_not_recovery": {
        "principle": "Rest is passive; recovery restores. The two are easy to confuse.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["stress_hrv_low", "recovery_insufficient"],
        "messages": [
            "Doing nothing and recovering are not the same. One restores; one only passes the time.",
        ]
    },
    "wisdom_a_reason_to_rise": {
        "principle": "A reason to get up in the morning is among the steadiest predictors of a long life.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["rhythm_weekend_recovery", "recovery_good"],
        "messages": [
            "The Okinawans don't retire. They keep a reason to rise, sized to the decade.",
        ]
    },
    "wisdom_shared_meal": {
        "principle": "Connection is not a reward for the work. It is part of what makes a life hold.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "triggers": ["boundary_weekend_meetings", "rhythm_weekend_recovery"],
        "messages": [
            "A shared meal does something a supplement can't.",
        ]
    },
    "wisdom_pattern_of_days": {
        "principle": "Health is not made in a day. It accumulates in the pattern of them.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "triggers": ["movement_good_streak", "attention_screen_improving", "outdoor_streak"],
        "messages": [
            "No single day decides much. The pattern of days decides everything.",
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
