import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { patternsAPI, behaviorAPI } from '../../services/api';
import Spacer from '../../components/Spacer';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import Story from '../story';

const PATTERN_LABELS: Record<string, string> = {
  morning_phone_early: 'Morning phone habit',
  morning_phone_consistent: 'Morning routine',
  movement_declining: 'Movement fading',
  movement_sedentary_day: 'Low movement day',
  movement_good_streak: 'Consistent movement',
  sleep_timing_inconsistent: 'Irregular sleep timing',
  sleep_late_night_phone: 'Late night screen use',
  sleep_duration_short: 'Short sleep streak',
  attention_social_media_heavy: 'Heavy social media use',
  attention_high_pickups: 'Frequent phone pickups',
  attention_screen_improving: 'Screen time improving',
  stress_hrv_low: 'Low recovery signals',
  stress_resting_hr_elevated: 'Elevated resting heart rate',
  stress_back_to_back_meetings: 'Back-to-back meetings',
  stress_heavy_meeting_day: 'Heavy meeting day',
  rhythm_balanced_day: 'Balanced day detected',
  rhythm_weekend_recovery: 'Weekend recovery',
  outdoor_low_week: 'Low outdoor time',
  outdoor_streak: 'Good outdoor streak',
  recovery_insufficient: 'Insufficient recovery',
  recovery_good: 'Recovery on track',
  boundary_evening_work: 'Evening work pattern',
  boundary_weekend_meetings: 'Weekend meeting load',
};

function formatPatternLabel(triggerId: string): string {
  if (PATTERN_LABELS[triggerId]) return PATTERN_LABELS[triggerId];
  return triggerId
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function deriveCategoryLabel(patterns: string[]): string | null {
  if (!patterns.length) return null;
  const prefix = patterns[0].split('_')[0];
  const map: Record<string, string> = {
    morning: 'Morning',
    movement: 'Movement',
    sleep: 'Sleep',
    attention: 'Attention',
    stress: 'Stress',
    rhythm: 'Balance',
    outdoor: 'Outdoor',
    recovery: 'Recovery',
    boundary: 'Boundaries',
    wisdom: 'Wisdom',
  };
  return map[prefix] ?? null;
}

export default function InsightsScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [patternsDetected, setPatternsDetected] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [isSunday, setIsSunday] = useState(false);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    if (!user) return;

    const today = new Date();
    setIsSunday(today.getDay() === 0);

    try {
      const patterns = await patternsAPI.getWeekly();
      setNarrative(patterns.narrative || '');
      setPatternsDetected(patterns.patterns_detected || []);
      setWeekStart(patterns.week_start ? new Date(patterns.week_start) : null);
    } catch (error) {
      console.error('Failed to load insights:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsights();
    setRefreshing(false);
  };

  const categoryLabel = deriveCategoryLabel(patternsDetected);

  const getInsightState = () => {
    if (!user?.created_at) return 'observing';
    const daysSinceCreation = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 2) return 'observing';
    if (daysSinceCreation < 7) return 'forming';
    return 'ready';
  };
  const insightState = getInsightState();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Insights</Text>
        <Text style={styles.subtitle}>No charts. No metrics. Just patterns.</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={{ flex: 1 }}
      >
        {/* Story card — tappable, appears first */}
        <TouchableOpacity style={styles.narrativeCard} onPress={() => setShowStory(true)} activeOpacity={0.8}>
          <Text style={styles.narrativeCategoryLabel}>WHY KOAN EXISTS</Text>
          <Text style={styles.narrativeText}>My grandparents lived past ninety.</Text>
          <Text style={[styles.narrativeSubtext, { fontStyle: 'italic', marginTop: 8 }]}>
            The story behind the quiet.
          </Text>
          <Text style={{ alignSelf: 'flex-end', color: '#8aab98', fontSize: 20, marginTop: 12 }}>›</Text>
        </TouchableOpacity>

        {/* Week Period */}
        {insightState === 'observing' ? (
          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>First reflection</Text>
            <Text style={styles.periodText}>Arrives this Sunday</Text>
          </View>
        ) : insightState === 'forming' ? (
          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Your baseline is building</Text>
            <Text style={styles.periodText}>Arrives this Sunday</Text>
          </View>
        ) : weekStart ? (
          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>
              {isSunday ? 'This week' : 'Last reflection'}
            </Text>
            <Text style={styles.periodText}>
              Week of {format(weekStart, 'MMM d, yyyy')}
            </Text>
            {!isSunday && (
              <Text style={styles.periodNext}>
                Your next weekly reflection arrives on Sunday.
              </Text>
            )}
          </View>
        ) : null}

        {/* Main Narrative */}
        <View style={styles.narrativeCard}>
          {insightState === 'observing' && (
            <>
              <Text style={styles.narrativeCategoryLabel}>JUST GETTING STARTED</Text>
              <Text style={styles.narrativeText}>Koan is still listening.</Text>
              <Text style={styles.narrativeSubtext}>
                Check back in a couple of days. Patterns take a little time to form.
              </Text>
            </>
          )}
          {insightState === 'forming' && (
            <>
              <Text style={styles.narrativeCategoryLabel}>PATTERNS FORMING</Text>
              <Text style={styles.narrativeText}>Koan has been observing your patterns.</Text>
              <Text style={styles.narrativeSubtext}>
                Your first weekly reflection arrives this Sunday.
              </Text>
            </>
          )}
          {insightState === 'ready' && (
            <>
              {categoryLabel && (
                <Text style={styles.narrativeCategoryLabel}>{categoryLabel.toUpperCase()}</Text>
              )}
              <Text style={styles.narrativeText}>{narrative || 'Koan has been observing your patterns this week.'}</Text>
              {narrative?.includes('baseline') && (
                <Text style={styles.narrativeSubtext}>
                  Koan builds your baseline first. Patterns emerge gradually over the first few weeks.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Detected Patterns */}
        {patternsDetected.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Patterns Observed</Text>
            {patternsDetected.map((pattern, index) => (
              <View key={index} style={styles.patternItem}>
                <View style={styles.patternDot} />
                <Text style={styles.patternText}>
                  {formatPatternLabel(pattern)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Philosophy */}
        <View style={styles.philosophyCard}>
          <Text style={styles.philosophyText}>
            Koan observes without judgment. These insights help you see what's working and
            what's not.
          </Text>
        </View>

        {/* Note */}
        <Text style={styles.note}>
          Patterns emerge over time. Check back next week for deeper insights.
        </Text>

        <Spacer minHeight={24} />

        <View style={styles.philosophyCard}>
          <Text style={[styles.philosophyText, { fontFamily: 'Georgia', fontStyle: 'italic' }]}>
            Koan observes without judgment.
          </Text>
        </View>
      </ScrollView>
      <Modal
        visible={showStory}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowStory(false)}
      >
        <Story onContinue={() => setShowStory(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 0,
    paddingBottom: 40,
  },
  periodCard: {
    backgroundColor: '#D9F7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  periodLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 4,
  },
  periodText: {
    fontSize: 14,
    color: '#3A3A3A',
  },
  periodNext: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.5,
    marginTop: 6,
  },
  narrativeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    alignItems: 'center',
  },
  narrativeCategoryLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#5FAD8E',
    marginBottom: 12,
  },
  narrativeText: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontStyle: 'italic',
    color: '#3A3A3A',
    lineHeight: 28,
    textAlign: 'center',
  },
  narrativeSubtext: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.6,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 16,
  },
  patternItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  patternDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5FAD8E',
    marginRight: 12,
  },
  patternText: {
    fontSize: 14,
    color: '#3A3A3A',
  },
  philosophyCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 20,
  },
  philosophyText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 21,
    textAlign: 'center',
  },
  note: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 20,
  },
});
