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
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { nudgeAPI, behaviorAPI, preferencesAPI, subscriptionAPI } from '../../services/api';
import { format } from 'date-fns';

const LEARNING_MESSAGES = [
  "Learning your rhythm…",
  "Observing your focus patterns…",
  "Understanding your switching habits…",
  "Noting your afternoon flow…",
  "Sensing your energy drift…",
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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [anchorAction, setAnchorAction] = useState('close one loop');
  const [pendingNudges, setPendingNudges] = useState<any[]>([]);
  const [trialDays, setTrialDays] = useState(0);
  const [currentLearningMessage, setCurrentLearningMessage] = useState(0);
  const [currentHint, setCurrentHint] = useState(0);
  
  // Animation for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
    startPulseAnimation();
    
    // Rotate learning message every 5 seconds
    const messageInterval = setInterval(() => {
      setCurrentLearningMessage((prev) => (prev + 1) % LEARNING_MESSAGES.length);
    }, 5000);
    
    // Rotate hint daily
    const hint = new Date().getDate() % TODAY_HINTS.length;
    setCurrentHint(hint);
    
    return () => clearInterval(messageInterval);
  }, []);

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

  const loadData = async () => {
    try {
      const [prefs, nudges, subscription] = await Promise.all([
        preferencesAPI.get(),
        nudgeAPI.getPending(),
        subscriptionAPI.getStatus(),
      ]);

      setAnchorAction(prefs.anchor_action || 'close one loop');
      setPendingNudges(nudges.nudges || []);
      setTrialDays(subscription.trial_days_remaining || 0);
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
            <Text style={styles.learningText}>{LEARNING_MESSAGES[currentLearningMessage]}</Text>
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

        {/* Anchor Action Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Your Anchor Action</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Daily</Text>
            </View>
          </View>
          
          <Text style={styles.anchorActionText}>{anchorAction}</Text>
          
          <Text style={styles.anchorExplanation}>
            Pick ONE task and complete it fully before moving to the next. This daily practice
            helps combat context-switching and unfinished work.
          </Text>

          <TouchableOpacity
            style={styles.anchorButton}
            onPress={handleAnchorAction}
            disabled={loading}
          >
            <Text style={styles.anchorButtonText}>
              {loading ? 'Sending...' : 'Send Reminder'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#3A3A3A" />
          </TouchableOpacity>
        </View>

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
    backgroundColor: '#A8D7F0',
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
    borderColor: '#A8D7F0',
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
    backgroundColor: '#A8D7F0',
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
    backgroundColor: '#A8D7F0',
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
    backgroundColor: '#A8D7F0',
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
    backgroundColor: '#A8D7F0',
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
});
