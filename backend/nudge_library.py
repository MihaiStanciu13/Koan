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
        "messages": [
            "Your phone was the first thing you reached for this morning. Tomorrow, let it wait 30 minutes.",
            "The day started before you did. Give yourself the first chapter.",
            "Three days this week, your phone was there before your coffee. That hour shapes everything after it.",
        ]
    },
    "morning_phone_consistent": {
        "principle": "Cortisol rises naturally in the morning — don't add to it with notifications.",
        "category": "morning_boundary",
        "longevity_factor": "stress_chronic",
        "messages": [
            "You've been starting every day the same way. Your nervous system notices.",
            "The algorithm doesn't sleep. You should get a head start.",
        ]
    },

    # ── MOVEMENT ────────────────────────────────────────────────────────
    "movement_declining": {
        "principle": "Daily movement integrated into life — not exercise — is what the longest-lived people have in common.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "Movement has been fading this week. It doesn't need to be exercise — a walk after dinner counts more than you think.",
            "Your ancestors walked 15-40km a day without thinking of it as fitness. Ten minutes outside still counts.",
            "Four days of fewer steps. The body notices drift before the mind does.",
        ]
    },
    "movement_sedentary_day": {
        "principle": "Sitting for long periods raises inflammation markers even in otherwise active people.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "A long day on screens, a short day on your feet. Even 10 minutes after dinner resets more than you'd expect.",
            "The body wasn't built for stillness. A short walk now costs nothing and returns more than you think.",
        ]
    },
    "movement_good_streak": {
        "principle": "Consistent movement is more protective than intense occasional exercise.",
        "category": "movement",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "You've been moving consistently. That's not a small thing.",
            "Five days of steady movement. Your body is remembering what it's for.",
        ]
    },

    # ── SLEEP ───────────────────────────────────────────────────────────
    "sleep_timing_inconsistent": {
        "principle": "Sleep consistency matters more than duration. The body clock is more sensitive to timing than to hours.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "messages": [
            "Your sleep schedule has been shifting. Consistency matters more than duration — your body clock notices the drift before you do.",
            "Different bedtimes each night confuse your circadian rhythm more than a short night does.",
            "The blue zone populations sleep and wake with the light. Consistency is the thing.",
        ]
    },
    "sleep_late_night_phone": {
        "principle": "Blue light and stimulation in the last hour before sleep delays melatonin by 90 minutes.",
        "category": "sleep",
        "longevity_factor": "hormonal_dysregulation",
        "messages": [
            "Your phone was active late last night. The last hour before sleep is worth protecting.",
            "Late screen time doesn't just delay sleep — it changes the quality of what follows.",
        ]
    },
    "sleep_duration_short": {
        "principle": "Chronic sleep restriction below 7 hours accelerates biological aging.",
        "category": "sleep",
        "longevity_factor": "cellular_senescence",
        "messages": [
            "A few short nights in a row. Sleep debt accumulates faster than it recovers.",
            "The body does its repair work at night. Less sleep means less repair.",
        ]
    },

    # ── ATTENTION & SCREEN ───────────────────────────────────────────────
    "attention_social_media_heavy": {
        "principle": "Protecting attention is one of the 15 behaviours of the top 1% of healthy people.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
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
        "messages": [
            "You picked up your phone a lot today. Each pickup is a small interruption to whatever you were doing.",
            "Frequent pickups aren't always about the phone — sometimes they're about avoiding something else.",
        ]
    },
    "attention_screen_improving": {
        "principle": "Reducing screen time has compounding benefits on sleep, stress, and focus.",
        "category": "attention",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Screen time has been lower this week. Your attention is quieter than it was.",
            "Less time on the phone, more time somewhere else. That's worth noticing.",
        ]
    },

    # ── STRESS & RECOVERY ────────────────────────────────────────────────
    "stress_hrv_low": {
        "principle": "HRV is the body's report card on recovery. Low HRV means the nervous system needs rest, not more input.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Your body's recovery signals are low. This isn't a push-through moment.",
            "Low HRV doesn't mean something is wrong — it means something needs rest.",
            "The week has left its mark. Tomorrow morning, don't open your phone for the first 30 minutes.",
        ]
    },
    "stress_resting_hr_elevated": {
        "principle": "Elevated resting heart rate sustained over days indicates chronic stress load.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "messages": [
            "Your resting heart rate has been higher than usual. The body is carrying something.",
            "Elevated heart rate over several days is the body asking for less, not more.",
        ]
    },

    "stress_back_to_back_meetings": {
        "principle": "The mind needs transition time between focused demands — back-to-back meetings erode cognitive quality.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Back-to-back meetings today. Even two minutes between them changes what the next one costs you.",
            "No gaps between meetings means no recovery between demands. That compounds.",
        ]
    },
    "stress_heavy_meeting_day": {
        "principle": "More than 5 hours of meetings in a day leaves no cognitive reserve for the rest of life.",
        "category": "recovery",
        "longevity_factor": "stress_chronic",
        "messages": [
            "A heavy meeting day. Tonight is for nothing in particular.",
            "Five hours of meetings is a lot of being on. The evening doesn't need to be productive.",
        ]
    },

    # ── WISDOM ──────────────────────────────────────────────────────────
    "wisdom_natural_movement": {
        "principle": "The longest-lived people don't exercise — they live in environments that make movement unavoidable.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "The healthiest people in the world never had gym memberships. They just lived in ways that kept them moving.",
            "Natural movement isn't a workout. It's what happens when your life is designed around a body.",
            "A walk isn't exercise. It's what you are.",
        ]
    },
    "wisdom_sleep_consistency": {
        "principle": "Your body runs on a clock that predates civilization. Disrupting it has costs that accumulate silently.",
        "category": "wisdom",
        "longevity_factor": "hormonal_dysregulation",
        "messages": [
            "Consistency of sleep timing predicts longevity better than duration. The clock matters more than the hours.",
            "The body doesn't distinguish between jet lag and an irregular schedule. Both confuse it the same way.",
            "Going to bed at the same time is one of the oldest forms of self-care. It predates the word.",
        ]
    },
    "wisdom_purpose": {
        "principle": "Ikigai — a reason to get up in the morning — is one of the strongest predictors of longevity across cultures.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Okinawans don't retire. They just keep doing what they love, at a pace that suits the decade.",
            "Purpose doesn't need to be grand. It needs to be real.",
            "People who live the longest tend to know why they got up today. The reason doesn't have to be important.",
        ]
    },
    "wisdom_social_connection": {
        "principle": "Loneliness is as harmful to health as smoking 15 cigarettes a day. Connection is not optional.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "The Roseto Effect: a community that ate badly, smoked, and worked hard — but had almost no heart disease. They had each other.",
            "Strong social ties reduce mortality risk by 50%. Not 5. Fifty.",
            "Connection is not a reward for finishing the work. It is part of what makes the work sustainable.",
        ]
    },
    "wisdom_chronic_vs_acute_stress": {
        "principle": "Acute stress is adaptive. Chronic stress is corrosive. The body can't tell the difference between a deadline and a predator.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Short stress is useful. Long stress eats the things that protect you.",
            "The stress response evolved for emergencies. When it runs all day, the body pays the bill later.",
            "A body in chronic stress ages faster. Not metaphorically — measurably, at the cellular level.",
        ]
    },
    "wisdom_unstructured_time": {
        "principle": "The brain's default mode network — active during unstructured time — is essential for creativity, memory consolidation, and emotional regulation.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Boredom isn't a problem to solve. It's a condition the brain needs.",
            "The most useful thinking often happens when you're doing nothing in particular.",
            "Unstructured time is not wasted time. It's when the brain does its background work.",
        ]
    },
    "wisdom_eating_patterns": {
        "principle": "When you eat may matter as much as what you eat. Eating within a consistent window aligns with your body's metabolic rhythms.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "Blue zone populations eat their largest meal at midday and their smallest in the evening. The timing is part of the practice.",
            "Late-night eating asks the digestive system to work when the body expects to rest.",
            "Consistent meal timing is a form of circadian hygiene most people never consider.",
        ]
    },
    "wisdom_chronic_overwork": {
        "principle": "Karoshi — death from overwork — is a recognized cause of death in Japan. Sustained overwork compresses lifespan, not just wellbeing.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "The countries with the highest life expectancy are not the ones that work the most hours.",
            "Overwork is not a personality trait. It's a chronic stressor with a long invoice.",
            "Rest is not the opposite of productivity. It is what makes continued productivity possible.",
        ]
    },
    "wisdom_circadian_alignment": {
        "principle": "Light is the primary signal that sets your internal clock. Morning light and evening darkness are among the most powerful health levers available.",
        "category": "wisdom",
        "longevity_factor": "hormonal_dysregulation",
        "messages": [
            "Morning light in the first 30 minutes after waking sets the cortisol rhythm for the entire day.",
            "The body has been calibrating to sunrise and sunset for 300,000 years. Electric light is very new.",
            "Bright light in the morning and dim light in the evening is not a preference — it's what the biology expects.",
        ]
    },
    "wisdom_nature_exposure": {
        "principle": "Time in nature reduces cortisol, lowers blood pressure, and improves immune function — effects that last days after a single exposure.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Shinrin-yoku — forest bathing — is prescribed by doctors in Japan. The trees are doing something.",
            "20 minutes outside lowers cortisol measurably. The body responds to nature faster than the mind does.",
            "You evolved outside. The inside is the recent experiment.",
        ]
    },
    "wisdom_rest_vs_recovery": {
        "principle": "Rest and recovery are not the same. Rest is passive. Recovery is active restoration — sleep, movement, connection, quiet.",
        "category": "wisdom",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Sitting on a couch scrolling is not recovery. Recovery requires something that restores.",
            "The body recovers through sleep, movement, and ease. Not through passive consumption.",
            "What you call 'doing nothing' matters. Not all nothing is restoring.",
        ]
    },
    "wisdom_compounding_small_choices": {
        "principle": "Health is not made in dramatic interventions. It accumulates through small choices made consistently over years.",
        "category": "wisdom",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "The people who live well at 80 didn't start preparing at 79. It was the accumulation of ordinary days.",
            "No single choice matters very much. The pattern of choices, compounded over years, matters enormously.",
            "Small consistent actions outperform large occasional ones. The body responds to what it can rely on.",
        ]
    },

    # ── OUTDOOR TIME ─────────────────────────────────────────────────────
    "outdoor_low_week": {
        "principle": "Natural light exposure regulates cortisol, melatonin, and attention restoration. Five days without it has measurable downstream effects.",
        "category": "outdoor",
        "longevity_factor": "hormonal_dysregulation",
        "messages": [
            "Most of this week has been indoors. The nervous system notices the absence of natural light before you do.",
            "Five days mostly inside. The body uses daylight to calibrate more than just mood.",
            "Outdoor time has been low this week. Even 20 minutes in natural light changes what the afternoon costs you.",
        ]
    },
    "outdoor_streak": {
        "principle": "Consistent outdoor exposure aligns the circadian clock, reduces cortisol reactivity, and restores directed attention.",
        "category": "outdoor",
        "longevity_factor": "stress_chronic",
        "messages": [
            "You've been getting outside consistently this week. That's doing more than it looks like.",
            "Four days of regular outdoor time. The circadian rhythm has something to work with.",
            "Consistent time outside this week. That's one of the quieter forms of self-care.",
        ]
    },

    # ── WORKOUT RECOVERY ─────────────────────────────────────────────────
    "recovery_insufficient": {
        "principle": "Elevated resting heart rate the day after intense activity signals the body hasn't yet restored — adding load compounds the deficit.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "messages": [
            "Yesterday was heavy. Your resting heart rate hasn't come back down yet.",
            "Hard effort yesterday, elevated heart rate today. The body is still in the middle of the last thing.",
            "The workout landed. The recovery hasn't caught up. That gap is where most overtraining starts.",
        ]
    },
    "recovery_good": {
        "principle": "Rising HRV after a block of training load is the body's signal that adaptation is occurring — the work is becoming capacity.",
        "category": "recovery",
        "longevity_factor": "cardiovascular",
        "messages": [
            "Recent training load has been high, and your HRV is rising. The body is adapting.",
            "You've been putting in the work, and the recovery signals are responding. That's the cycle working.",
            "HRV up after a demanding stretch. The effort is converting.",
        ]
    },

    # ── WORK-LIFE BOUNDARY ───────────────────────────────────────────────
    "boundary_evening_work": {
        "principle": "Evening work hours displace recovery, social connection, and the psychological detachment the body needs to end the day.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "messages": [
            "Three evenings this week with work on the calendar. The day keeps not ending.",
            "Late meetings most nights this week. The evening is part of the day too.",
            "Work has been running past 7pm most nights. The body needs the day to have an end.",
        ]
    },
    "boundary_weekend_meetings": {
        "principle": "Weekend work interrupts the psychological recovery that weekends exist to provide — recovery from role demands, not just physical rest.",
        "category": "work_boundary",
        "longevity_factor": "stress_chronic",
        "messages": [
            "There's a meeting on your weekend. The weekend is the only part of the week that doesn't need a meeting.",
            "Calendar events on a weekend. Recovery requires time without demands — even scheduled ones.",
            "A weekend meeting. The body doesn't distinguish between a calendar block and a workday when it's trying to rest.",
        ]
    },

    # ── RHYTHM & BALANCE ─────────────────────────────────────────────────
    "rhythm_balanced_day": {
        "principle": "A balanced day — movement, rest, focus, social — is the oldest form of health.",
        "category": "balance",
        "longevity_factor": "inflammation_chronic",
        "messages": [
            "Today looked balanced. Movement, rest, presence. That's the whole thing.",
            "A good day doesn't announce itself. Today was one.",
        ]
    },
    "rhythm_weekend_recovery": {
        "principle": "Weekends are for psychological recovery, not physical — the mind needs unstructured time.",
        "category": "balance",
        "longevity_factor": "stress_chronic",
        "messages": [
            "It's the weekend. Not for catching up — for letting the week finish.",
            "Rest isn't the absence of productivity. It's its own thing.",
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
