import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { nudgeAPI, behaviorAPI, preferencesAPI, subscriptionAPI } from '../../services/api';
import { format } from 'date-fns';

export default function HomeScreen() {
  const { user } = useAuth();
  const { sendNudgeNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [anchorAction, setAnchorAction] = useState('close one loop');
  const [pendingNudges, setPendingNudges] = useState<any[]>([]);
  const [trialDays, setTrialDays] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

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
        // Send push notification
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

  const simulatePickup = async () => {
    try {
      await behaviorAPI.recordPhoneBehavior('pickup', { source: 'manual' });
      Alert.alert('Recorded', 'Phone pickup logged');
    } catch (error) {
      console.error('Failed to record:', error);
    }
  };

  const simulateAppSwitch = async () => {
    try {
      await behaviorAPI.recordPhoneBehavior('app_switch', { source: 'manual' });
      Alert.alert('Recorded', 'App switch logged');
    } catch (error) {
      console.error('Failed to record:', error);
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

        {/* Testing Tools */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Test Behavior Tracking</Text>
          <Text style={styles.testDescription}>
            Simulate phone behaviors to see how the app detects patterns.
          </Text>
          
          <View style={styles.testButtons}>
            <TouchableOpacity style={styles.testButton} onPress={simulatePickup}>
              <Ionicons name="phone-portrait-outline" size={20} color="#3A3A3A" />
              <Text style={styles.testButtonText}>Log Pickup</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.testButton} onPress={simulateAppSwitch}>
              <Ionicons name="swap-horizontal-outline" size={20} color="#3A3A3A" />
              <Text style={styles.testButtonText}>Log Switch</Text>
            </TouchableOpacity>
          </View>
        </View>

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
  testDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    marginBottom: 16,
    lineHeight: 20,
  },
  testButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6E6E4',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  testButtonText: {
    fontSize: 14,
    color: '#3A3A3A',
    fontWeight: '500',
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
