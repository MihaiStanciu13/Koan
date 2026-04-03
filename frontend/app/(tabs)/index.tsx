import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { nudgeAPI, behaviorAPI, preferencesAPI, subscriptionAPI, adaptiveNudgeAPI } from '../../services/api';
import { format } from 'date-fns';
import WelcomeVideoModal from '../../components/WelcomeVideoModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LEARNING_MESSAGES_BY_PHASE = [
  // Phase 0: Just started
  [
    "Learning from your phone usage patterns…",
    "Building your behavioral baseline…",
    "Understanding your daily rhythm…",
  ],
  // Phase 1: Early learning (1-10 events)
  [
    "Observing when you pick up your phone…",
    "Noting your app switching patterns…",
    "Learning your focus windows…",
  ],
  // Phase 2: Building patterns (10-50 events)
  [
    "Understanding your switching habits…",
    "Noting your afternoon flow…",
    "Sensing your energy patterns…",
  ],
  // Phase 3: Active learning (50+ events)
  [
    "Learning your rhythm…",
    "Observing your focus patterns…",
    "Sensing your energy drift…",
  ],
];

const TODAY_HINTS = [
  "You know the next step.",
  "Return to focus.",
  "Start with one clear action.",
  "Take a moment before switching tasks.",
  "Decide your next step.",
];

export default function HomeScreen() {
  const { user } = useAuth();
  const { sendNudgeNotification } = useNotifications();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [anchorAction, setAnchorAction] = useState('close one loop');
  const [anchorActions, setAnchorActions] = useState<any[]>([]);
  const [pendingNudges, setPendingNudges] = useState<any[]>([]);
  const [trialDays, setTrialDays] = useState(0);
  const [learningPhase, setLearningPhase] = useState(0); // Track which phase of learning we're in
  const [currentHint, setCurrentHint] = useState(0);
  const [showWelcomeVideo, setShowWelcomeVideo] = useState(false);
  const [show5thNudgeMilestone, setShow5thNudgeMilestone] = useState(false);
  
  // Animation for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
    startPulseAnimation();
    determineLearningPhase();
    checkFirstVisit();
    
    // Rotate hint daily
    const hint = new Date().getDate() % TODAY_HINTS.length;
    setCurrentHint(hint);
  }, []);

  // Reload data when screen comes into focus (e.g., after returning from anchor actions)
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const checkFirstVisit = async () => {
    try {
      const hasSeenWelcome = await AsyncStorage.getItem('hasSeenWelcomeVideo');
      if (!hasSeenWelcome) {
        // Show welcome video modal after a brief delay
        setTimeout(() => {
          setShowWelcomeVideo(true);
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to check first visit:', error);
    }
  };

  const handleCloseWelcomeVideo = async () => {
    setShowWelcomeVideo(false);
    try {
      await AsyncStorage.setItem('hasSeenWelcomeVideo', 'true');
    } catch (error) {
      console.error('Failed to save welcome video flag:', error);
    }
  };

  const determineLearningPhase = async () => {
    // Determine learning phase based on account age and activity
    try {
      const summary = await behaviorAPI.getSummary(7);
      const totalEvents = summary.total_events || 0;
      
      if (totalEvents === 0) {
        setLearningPhase(0); // Just started
      } else if (totalEvents < 10) {
        setLearningPhase(1); // Early learning
      } else if (totalEvents < 50) {
        setLearningPhase(2); // Building patterns
      } else {
        setLearningPhase(3); // Active learning
      }
    } catch (error) {
      setLearningPhase(0);
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const checkNudgeMilestone = async () => {
    try {
      const hasSeenMilestone = await AsyncStorage.getItem('seen5thNudgeMilestone');
      if (hasSeenMilestone) return;
      
      // Get total nudge count
      const nudgeCount = await nudgeAPI.getCount();
      
      if (nudgeCount >= 5) {
        setShow5thNudgeMilestone(true);
        await AsyncStorage.setItem('seen5thNudgeMilestone', 'true');
      }
    } catch (error) {
      console.error('Failed to check nudge milestone:', error);
    }
  };

  const loadData = async () => {
    try {
      const [prefs, nudges, subscription, fallback] = await Promise.all([
        preferencesAPI.get(),
        nudgeAPI.getPending(),
        subscriptionAPI.getStatus(),
        adaptiveNudgeAPI.checkFallback().catch(() => null), // Optional fallback check
      ]);

      setAnchorAction(prefs.anchor_action || 'close one loop');
      // Load anchor actions array
      if (prefs.anchor_actions && Array.isArray(prefs.anchor_actions)) {
        const enabledActions = prefs.anchor_actions.filter((a: any) => a.enabled && a.text);
        setAnchorActions(enabledActions);
      }
      
      let allNudges = nudges.nudges || [];
      
      // Add fallback nudge if returned
      if (fallback && fallback.nudge) {
        allNudges = [fallback.nudge, ...allNudges];
      }
      
      setPendingNudges(allNudges);
      setTrialDays(subscription.trial_days_remaining || 0);
      
      // Check for 5th nudge milestone
      await checkNudgeMilestone();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAnchorAction = async () => {
    setLoading(true);
    try {
      const response = await nudgeAPI.triggerAnchor();
      if (response.nudge) {
        await sendNudgeNotification(
          'Your Anchor Action',
          response.nudge.message,
          response.nudge.id
        );
        Alert.alert('Nudge Sent', 'Check your notifications');
        await loadData();
      }
    } catch (error) {
      Alert.alert('Error', 'Could not trigger nudge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name}</Text>
            <Text style={styles.tagline}>Everything you need to know, you already know.</Text>
          </View>
        </View>

        {/* Trial Banner */}
        {user?.subscription_status === 'trial' && trialDays > 0 && (
          <View style={styles.trialBanner}>
            <View style={styles.trialDot} />
            <Text style={styles.trialText}>{trialDays} days of trial remaining</Text>
          </View>
        )}

        {/* Koan is Learning You Module */}
        <View style={styles.learningCard}>
          <View style={styles.learningContent}>
            <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.dotInner} />
            </Animated.View>
            <Text style={styles.learningText}>
              {LEARNING_MESSAGES_BY_PHASE[learningPhase][0]}
            </Text>
          </View>
        </View>

        {/* Today's Hint Card */}
        <View style={styles.hintCard}>
          <View style={styles.hintHeader}>
            <View style={styles.hintDot} />
            <Text style={styles.hintLabel}>Today's Hint</Text>
          </View>
          <Text style={styles.hintText}>{TODAY_HINTS[currentHint]}</Text>
        </View>

        {/* Anchor Actions Card */}
        <TouchableOpacity 
          style={styles.card}
          onPress={() => router.push('/anchor-actions')}
        >
          <View style={styles.cardHeader}>
            <View style={styles.anchorIconContainer}>
              <Ionicons name="boat-outline" size={24} color="#5FAD8E" />
              <Text style={styles.cardTitle}>Anchor Actions</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#3A3A3A" />
          </View>
          
          {anchorActions.length > 0 ? (
            <>
              <Text style={styles.anchorDescription}>
                Your daily anchors:
              </Text>
              {anchorActions.map((action: any, index: number) => (
                <View key={index} style={styles.anchorItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#5FAD8E" />
                  <Text style={styles.anchorItemText}>{action.text}</Text>
                  <Text style={styles.anchorItemTime}>{action.time}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.anchorDescription}>
                Set 1-3 simple, repeatable actions that ground you throughout the day
              </Text>
              <View style={styles.anchorPreview}>
                <Ionicons name="time-outline" size={16} color="#5FAD8E" />
                <Text style={styles.anchorPreviewText}>
                  Daily reminders at times you choose
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* 5th Nudge Milestone */}
        {show5thNudgeMilestone && (
          <View style={styles.milestoneCard}>
            <View style={styles.milestoneHeader}>
              <Ionicons name="trophy-outline" size={32} color="#5FAD8E" />
            </View>
            <Text style={styles.milestoneTitle}>Your pattern baseline is forming</Text>
            <Text style={styles.milestoneText}>
              You've received 5 nudges. Koan works best over time — your subtle patterns are starting to emerge.
            </Text>
            <TouchableOpacity 
              style={styles.milestoneButton}
              onPress={() => setShow5thNudgeMilestone(false)}
            >
              <Text style={styles.milestoneButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Nudges */}
        {pendingNudges.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Nudges</Text>
            {pendingNudges.slice(0, 3).map((nudge) => (
              <View key={nudge.id} style={styles.nudgeItem}>
                <View style={styles.nudgeIcon}>
                  <View style={styles.nudgeDot} />
                </View>
                <View style={styles.nudgeContent}>
                  <Text style={styles.nudgeMessage}>{nudge.message}</Text>
                  <Text style={styles.nudgeTime}>
                    {format(new Date(nudge.created_at), 'h:mm a')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Philosophy Card */}
        <View style={styles.philosophyCard}>
          <Text style={styles.philosophyText}>
            Koan delivers subtle nudges when they matter. No dashboards. No noise. Just calm
            clarity.
          </Text>
        </View>
      </ScrollView>

      {/* Welcome Video Modal */}
      <WelcomeVideoModal 
        visible={showWelcomeVideo} 
        onClose={handleCloseWelcomeVideo} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D9F7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  trialDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5FAD8E',
    marginRight: 10,
  },
  trialText: {
    fontSize: 14,
    color: '#3A3A3A',
  },
  learningCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#5FAD8E',
  },
  learningContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulsingDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5FAD8E',
  },
  learningText: {
    fontSize: 15,
    color: '#3A3A3A',
    opacity: 0.8,
    fontStyle: 'italic',
    flex: 1,
  },
  hintCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  hintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  hintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5FAD8E',
    marginRight: 8,
  },
  hintLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3A',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hintText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#3A3A3A',
    lineHeight: 26,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  badge: {
    backgroundColor: '#E6E6E4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    color: '#3A3A3A',
    fontWeight: '500',
  },
  anchorActionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 12,
  },
  anchorExplanation: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 21,
    marginBottom: 16,
  },
  anchorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5FAD8E',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  anchorButtonText: {
    color: '#3A3A3A',
    fontSize: 15,
    fontWeight: '600',
  },
  nudgeItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  nudgeIcon: {
    width: 32,
    alignItems: 'center',
    paddingTop: 2,
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5FAD8E',
  },
  nudgeContent: {
    flex: 1,
  },
  nudgeMessage: {
    fontSize: 14,
    color: '#3A3A3A',
    lineHeight: 20,
    marginBottom: 4,
  },
  nudgeTime: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.5,
  },
  philosophyCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
  },
  philosophyText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 21,
    textAlign: 'center',
  },
  anchorIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  anchorDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 21,
    marginBottom: 16,
  },
  anchorPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  anchorPreviewText: {
    fontSize: 12,
    color: '#5FAD8E',
    fontWeight: '500',
  },
  anchorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  anchorItemText: {
    flex: 1,
    fontSize: 14,
    color: '#3A3A3A',
  },
  anchorItemTime: {
    fontSize: 12,
    color: '#5FAD8E',
    fontWeight: '500',
  },
  milestoneCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  milestoneHeader: {
    marginBottom: 16,
  },
  milestoneTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3A3A3A',
    marginBottom: 12,
    textAlign: 'center',
  },
  milestoneText: {
    fontSize: 15,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  milestoneButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  milestoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
