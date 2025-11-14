import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { storage } from '../services/storage';
import * as Notifications from 'expo-notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0-indexed now for FlatList
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [selectedMode, setSelectedMode] = useState('standard');
  const flatListRef = useRef<FlatList>(null);

  const handleNext = async () => {
    if (step < 2) {
      // Move to next step
      const nextStep = step + 1;
      setStep(nextStep);
      flatListRef.current?.scrollToIndex({ index: nextStep, animated: true });
    } else {
      // Complete onboarding
      await storage.setOnboardingComplete();
      router.replace('/(tabs)');
    }
  };

  const handleSkip = async () => {
    await storage.setOnboardingComplete();
    router.replace('/(tabs)');
  };

  const requestNotifications = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
      
      if (status === 'granted') {
        Alert.alert('Notifications Enabled', 'You can adjust notification settings anytime in Settings.');
      }
    } catch (error) {
      console.error('Failed to request notifications:', error);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setStep(viewableItems[0].index);
    }
  }).current;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                step >= s && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {/* Step 1: Philosophy */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <View style={styles.logoSymbol}>
              <View style={styles.logoDot} />
            </View>
            <Text style={styles.title}>No Dashboards. No Metrics.</Text>
            <Text style={styles.description}>
              Just subtle, well-timed behavioral nudges that help you act on what you
              already know.
            </Text>
            <View style={styles.featureList}>
              <FeatureItem icon="notifications-off" text="No constant pings" />
              <FeatureItem icon="bar-chart-outline" text="No tracking dashboards" />
              <FeatureItem icon="trophy-outline" text="No gamification" />
              <FeatureItem icon="sparkles" text="Just gentle course-corrections" />
            </View>
          </View>
        )}

        {/* Step 2: Notification Explanation */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Ionicons name="notifications-outline" size={64} color="#A8D7F0" />
            <Text style={styles.title}>Koan works through small, subtle moments</Text>
            <Text style={styles.description}>
              Most of Koan's magic happens through short, gentle notifications delivered at the right time. 
              They're quiet, respectful, and designed to help you realign — not interrupt.
            </Text>

            <View style={styles.notificationFeatures}>
              <View style={styles.featureRow}>
                <Ionicons name="volume-off" size={20} color="#3A3A3A" />
                <Text style={styles.featureText}>Silent by default</Text>
              </View>
              <View style={styles.featureRow}>
                <Ionicons name="time-outline" size={20} color="#3A3A3A" />
                <Text style={styles.featureText}>Delivered at the right time</Text>
              </View>
              <View style={styles.featureRow}>
                <Ionicons name="shield-outline" size={20} color="#3A3A3A" />
                <Text style={styles.featureText}>Private and respectful</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.enableButton}
              onPress={async () => {
                await requestNotifications();
                handleNext();
              }}
            >
              <Text style={styles.enableButtonText}>Enable Notifications</Text>
            </TouchableOpacity>

            <Text style={styles.subtleText}>You can choose how subtle they are.</Text>
          </View>
        )}

        {/* Step 3: Choose Mode */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Ionicons name="settings-outline" size={64} color="#A8D7F0" />
            <Text style={styles.title}>Select Your Mode</Text>
            <Text style={styles.description}>
              Choose how nudges adapt to your work style. You can change this anytime.
            </Text>

            <ModeCard
              icon="flash-outline"
              title="Standard"
              description="Balanced nudges throughout the day"
              selected={selectedMode === 'standard'}
              onPress={() => setSelectedMode('standard')}
            />
            <ModeCard
              icon="eye-outline"
              title="Focus Mode"
              description="Minimal interruptions, deep work support"
              selected={selectedMode === 'focus'}
              onPress={() => setSelectedMode('focus')}
            />
            <ModeCard
              icon="people-outline"
              title="Meeting-Heavy"
              description="Recovery nudges between meetings"
              selected={selectedMode === 'meeting'}
              onPress={() => setSelectedMode('meeting')}
            />
            <ModeCard
              icon="airplane-outline"
              title="Travel Mode"
              description="Ultra-rare, essential nudges only"
              selected={selectedMode === 'travel'}
              onPress={() => setSelectedMode('travel')}
            />
          </View>
        )}

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextText}>{step === 3 ? 'Get Started' : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={styles.timeEstimate}>⏱ Under 60 seconds</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon} size={20} color="#A8D7F0" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function ModeCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: any;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.modeCard, selected && styles.modeCardSelected]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={24} color={selected ? '#A8D7F0' : '#888'} />
      <View style={styles.modeText}>
        <Text style={[styles.modeTitle, selected && styles.modeTextSelected]}>
          {title}
        </Text>
        <Text style={styles.modeDescription}>{description}</Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={24} color="#A8D7F0" />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
  },
  progressDotActive: {
    backgroundColor: '#A8D7F0',
  },
  logoSymbol: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#A8D7F0',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3A3A3A',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  featureList: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#5FAD8E',
    fontWeight: '500',
  },
  permissionCard: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  permissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  permissionText: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  permissionSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  privacyNote: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2a2a2a',
    gap: 12,
  },
  modeCardSelected: {
    borderColor: '#A8D7F0',
    backgroundColor: '#0f1a2e',
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  modeTextSelected: {
    color: '#A8D7F0',
  },
  modeDescription: {
    fontSize: 14,
    color: '#888',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timeEstimate: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginTop: 16,
  },
  notificationFeatures: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  enableButton: {
    backgroundColor: '#A8D7F0',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  enableButtonText: {
    color: '#3A3A3A',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtleText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
  },
});
