import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { patternsAPI, behaviorAPI } from '../../services/api';
import { format } from 'date-fns';

export default function InsightsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [patternsDetected, setPatternsDetected] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    try {
      const [patterns, behaviorSummary] = await Promise.all([
        patternsAPI.getWeekly(),
        behaviorAPI.getSummary(7),
      ]);

      setNarrative(patterns.narrative || '');
      setPatternsDetected(patterns.patterns_detected || []);
      setWeekStart(patterns.week_start ? new Date(patterns.week_start) : null);
      setSummary(behaviorSummary);
    } catch (error) {
      console.error('Failed to load insights:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsights();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Insights</Text>
        <Text style={styles.subtitle}>No charts. No metrics. Just patterns.</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Week Period */}
        {weekStart && (
          <View style={styles.periodCard}>
            <Text style={styles.periodLabel}>Current Period</Text>
            <Text style={styles.periodText}>
              Week of {format(weekStart, 'MMM d, yyyy')}
            </Text>
          </View>
        )}

        {/* Main Narrative */}
        <View style={styles.narrativeCard}>
          <View style={styles.narrativeIcon}>
            <View style={styles.narrativeDot} />
          </View>
          <Text style={styles.narrativeText}>{narrative}</Text>
        </View>

        {/* Detected Patterns */}
        {patternsDetected.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Patterns Observed</Text>
            {patternsDetected.map((pattern, index) => (
              <View key={index} style={styles.patternItem}>
                <View style={styles.patternDot} />
                <Text style={styles.patternText}>
                  {pattern.replace('_', ' ')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity Summary */}
        {summary && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This Week</Text>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Phone behaviors tracked</Text>
              <Text style={styles.statValue}>
                {Object.values(summary.phone_behaviors || {}).reduce(
                  (a: any, b: any) => a + b,
                  0
                )}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Workplace patterns</Text>
              <Text style={styles.statValue}>
                {Object.values(summary.workplace_patterns || {}).reduce(
                  (a: any, b: any) => a + b,
                  0
                )}
              </Text>
            </View>
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
      </ScrollView>
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
  narrativeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A8D7F0',
    alignItems: 'center',
  },
  narrativeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  narrativeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A8D7F0',
  },
  narrativeText: {
    fontSize: 16,
    color: '#3A3A3A',
    lineHeight: 24,
    textAlign: 'center',
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
    backgroundColor: '#A8D7F0',
    marginRight: 12,
  },
  patternText: {
    fontSize: 14,
    color: '#3A3A3A',
    textTransform: 'capitalize',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  statLabel: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
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
