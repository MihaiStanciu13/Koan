from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timedelta
from typing import List, Dict
import os
import anthropic
import logging

logger = logging.getLogger(__name__)

async def detect_weekly_patterns(db: AsyncIOMotorDatabase, user_id: str) -> Dict:
    """Detect patterns in user's weekly behavior and generate narrative"""
    try:
        week_start = datetime.utcnow() - timedelta(days=7)
        
        # Get all behavioral data for the week
        phone_behaviors = await db.phone_behaviors.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_start}
        }).to_list(1000)
        
        workplace_data = await db.workplace_data.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_start}
        }).to_list(1000)
        
        nudges = await db.nudges.find({
            "user_id": user_id,
            "created_at": {"$gte": week_start}
        }).to_list(1000)
        
        # Analyze patterns
        patterns = []
        
        # Phone pickup patterns
        pickups_by_hour = {}
        for behavior in phone_behaviors:
            if behavior["event_type"] == "pickup":
                hour = behavior["timestamp"].hour
                pickups_by_hour[hour] = pickups_by_hour.get(hour, 0) + 1
        
        # Find quietest hours (potential focus times)
        if pickups_by_hour:
            avg_pickups = sum(pickups_by_hour.values()) / len(pickups_by_hour)
            quiet_hours = [h for h, count in pickups_by_hour.items() if count < avg_pickups * 0.5]
            if quiet_hours:
                patterns.append(f"focus_periods_at_hours_{quiet_hours}")
        
        # Context switching patterns
        app_switches = [b for b in phone_behaviors if b["event_type"] == "app_switch"]
        if len(app_switches) > 20:
            patterns.append("high_context_switching")
        
        # Late night work
        late_night_events = [b for b in phone_behaviors if b["timestamp"].hour >= 22 or b["timestamp"].hour <= 5]
        if len(late_night_events) > 5:
            patterns.append("late_night_work_detected")
        
        # Meeting density (from workplace data)
        meetings = [w for w in workplace_data if "meeting" in w["event_type"]]
        if len(meetings) > 15:
            patterns.append("high_meeting_density")
        
        # Generate narrative using AI
        narrative = await generate_weekly_narrative(patterns, len(nudges))
        
        return {
            "week_start": week_start,
            "patterns_detected": patterns,
            "narrative": narrative,
            "total_events": len(phone_behaviors) + len(workplace_data),
            "nudges_received": len(nudges)
        }
    except Exception as e:
        logger.error(f"Error detecting weekly patterns: {str(e)}")
        return {
            "week_start": week_start,
            "patterns_detected": [],
            "narrative": "Not enough data to generate insights yet",
            "total_events": 0,
            "nudges_received": 0
        }

async def generate_weekly_narrative(patterns: List[str], nudge_count: int) -> str:
    """Generate a natural language narrative from detected patterns"""
    try:
        if not patterns:
            return "Building your pattern baseline. Check back next week for insights."
        
        # Prepare context for AI
        pattern_descriptions = {
            "high_context_switching": "frequent app switching",
            "late_night_work_detected": "late evening work sessions",
            "high_meeting_density": "many meetings throughout the week",
        }
        
        pattern_text = ", ".join([pattern_descriptions.get(p, p) for p in patterns])
        
        prompt = f"""Based on this week's patterns: {pattern_text}. The user received {nudge_count} nudges.
        
Create a single, calm, insightful sentence (15-25 words) about what worked well or could be adjusted. No metrics, no clichés, just a subtle observation."""
        
        api_key = os.getenv("ANTHROPIC_API_KEY")
        client = anthropic.AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=100,
            system="You are a subtle behavioral analyst. Create brief, insightful observations without motivational clichés.",
            messages=[{"role": "user", "content": prompt}]
        )
        narrative = response.content[0].text

        return narrative.strip()
    except Exception as e:
        logger.error(f"Error generating narrative: {str(e)}")
        # Fallback narratives
        if "high_context_switching" in patterns:
            return "Your afternoons were calmer when you stayed in one tool longer."
        if "late_night_work_detected" in patterns:
            return "Morning sessions seemed more focused than late evening ones."
        return "Your patterns are forming. More insights coming soon."

async def learn_quiet_periods(db: AsyncIOMotorDatabase, user_id: str):
    """Learn when user naturally focuses and update preferences"""
    try:
        # Analyze last 2 weeks of data
        two_weeks_ago = datetime.utcnow() - timedelta(days=14)
        
        phone_behaviors = await db.phone_behaviors.find({
            "user_id": user_id,
            "timestamp": {"$gte": two_weeks_ago}
        }).to_list(2000)
        
        # Group by hour and day
        activity_by_time = {}
        for behavior in phone_behaviors:
            hour = behavior["timestamp"].hour
            day = behavior["timestamp"].weekday()
            key = f"{day}_{hour}"
            activity_by_time[key] = activity_by_time.get(key, 0) + 1
        
        # Find consistently quiet periods (low activity)
        if activity_by_time:
            avg_activity = sum(activity_by_time.values()) / len(activity_by_time)
            quiet_periods = []
            
            for key, count in activity_by_time.items():
                if count < avg_activity * 0.3:  # 30% below average
                    day, hour = key.split("_")
                    quiet_periods.append({
                        "day": int(day),
                        "hour": int(hour),
                        "activity_level": count
                    })
            
            # Update user preferences
            if quiet_periods:
                await db.preferences.update_one(
                    {"user_id": user_id},
                    {"$set": {"quiet_periods": quiet_periods}}
                )
                logger.info(f"Updated quiet periods for user {user_id}: {len(quiet_periods)} periods found")
    except Exception as e:
        logger.error(f"Error learning quiet periods: {str(e)}")
