import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { nudgeAPI } from '../../services/api';
import { format } from 'date-fns';

export default function NudgesScreen() {
  const [nudges, setNudges] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedNudge, setExpandedNudge] = useState<string | null>(null);

  useEffect(() => {
    loadNudges();
  }, []);

  const loadNudges = async () => {
    try {
      const response = await nudgeAPI.getPending();
      setNudges(response.nudges || []);
    } catch (error) {
      console.error('Failed to load nudges:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNudges();
    setRefreshing(false);
  };

  const toggleNudgeExpand = (nudgeId: string) => {
    setExpandedNudge(expandedNudge === nudgeId ? null : nudgeId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Nudges</Text>
        <Text style={styles.subtitle}>Gentle course-corrections when they matter</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {nudges.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <View style={styles.emptyDot} />
            </View>
            <Text style={styles.emptyTitle}>No nudges yet</Text>
            <Text style={styles.emptyText}>
              Koan is observing your patterns. Your first nudge usually appears within 24–48
              hours.
            </Text>
            <Text style={styles.emptySubtext}>
              We're learning when you need a gentle reminder and when to stay quiet.
            </Text>
          </View>
        ) : (
          nudges.map((nudge) => (
            <TouchableOpacity
              key={nudge.id}
              style={styles.nudgeCard}
              onPress={() => toggleNudgeExpand(nudge.id)}
            >
              <View style={styles.nudgeHeader}>
                <View style={styles.nudgeLeft}>
                  <View style={styles.nudgeDot} />
                  <View style={styles.nudgeHeaderText}>
                    <Text style={styles.nudgeType}>
                      {nudge.nudge_type.replace('_', ' ')}
                    </Text>
                    <Text style={styles.nudgeTime}>
                      {format(new Date(nudge.created_at), 'MMM d, h:mm a')}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={expandedNudge === nudge.id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#3A3A3A"
                />
              </View>

              <Text style={styles.nudgeMessage}>{nudge.message}</Text>

              {expandedNudge === nudge.id && (
                <View style={styles.nudgeExpanded}>
                  <View style={styles.divider} />
                  <Text style={styles.explanationLabel}>Why this nudge?</Text>
                  <Text style={styles.explanationText}>{nudge.explanation}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        <View style={styles.philosophyCard}>
          <Text style={styles.philosophyText}>
            You know the next step. We just help you remember.
          </Text>
        </View>
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#A8D7F0',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 40,
  },
  nudgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  nudgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nudgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A8D7F0',
    marginRight: 12,
  },
  nudgeHeaderText: {
    flex: 1,
  },
  nudgeType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3A',
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  nudgeTime: {
    fontSize: 11,
    color: '#3A3A3A',
    opacity: 0.5,
  },
  nudgeMessage: {
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 22,
  },
  nudgeExpanded: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E6E6E4',
    marginBottom: 16,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 21,
  },
  philosophyCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
  },
  philosophyText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 21,
    textAlign: 'center',
  },
});
