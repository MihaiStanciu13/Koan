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
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function NudgesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [nudges, setNudges] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedNudge, setExpandedNudge] = useState<string | null>(null);
  const [patternsExpanded, setPatternsExpanded] = useState(false);

  useEffect(() => {
    loadNudges();
  }, []);

  const loadNudges = async () => {
    if (!user) return;
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {nudges.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <View style={styles.emptyDot} />
            </View>
            <Text style={styles.emptyTitle}>Koan is listening</Text>
            <Text style={styles.emptyText}>
              For the next 24–48 hours, Koan is building your baseline from phone usage patterns — pickup frequency, app switches, and session length.
            </Text>
            <Text style={styles.toolsLabel}>Connect your tools to unlock richer nudges:</Text>
            <TouchableOpacity style={styles.toolButton} onPress={() => router.push('/settings')}>
              <Text style={styles.toolButtonText}>Google Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => router.push('/settings')}>
              <Text style={styles.toolButtonText}>Microsoft 365</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={() => router.push('/settings')}>
              <Text style={styles.toolButtonText}>Slack</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPatternsExpanded(v => !v)} style={styles.patternsToggle}>
              <Text style={styles.patternsToggleText}>What patterns does Koan monitor? →</Text>
            </TouchableOpacity>
            {patternsExpanded && (
              <View style={styles.patternsDetail}>
                <Text style={styles.patternsDetailText}>
                  Koan tracks signals across three dimensions: <Text style={styles.patternsDetailBold}>phone pickups</Text> (how often and when you reach for your phone, including your first pickup of the day), <Text style={styles.patternsDetailBold}>screen time patterns</Text> (total usage, app categories, and how your attention is distributed), and <Text style={styles.patternsDetailBold}>meeting load</Text> (when connected to your calendar — dense blocks vs. open time — so nudges arrive when you actually have capacity to act on them).
                </Text>
              </View>
            )}
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
      </ScrollView>

      <View style={styles.philosophyCard}>
        <Text style={styles.philosophyText}>
          You know the next step. We just help you remember.
        </Text>
      </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
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
    backgroundColor: '#5FAD8E',
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
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  toolsLabel: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.6,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  toolButton: {
    width: '100%',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  toolButtonText: {
    fontSize: 13,
    color: '#3A3A3A',
    fontWeight: '400',
  },
  patternsToggle: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  patternsToggleText: {
    fontSize: 13,
    color: '#5FAD8E',
    opacity: 0.85,
  },
  patternsDetail: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 16,
    width: '100%',
  },
  patternsDetailText: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.75,
    lineHeight: 20,
  },
  patternsDetailBold: {
    fontWeight: '600',
    opacity: 1,
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
    backgroundColor: '#5FAD8E',
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
    marginHorizontal: 20,
    marginBottom: 20,
  },
  philosophyText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 21,
    textAlign: 'center',
  },
});
