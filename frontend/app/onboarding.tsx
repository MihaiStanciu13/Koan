import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { storage } from '../services/storage';
import { preferencesAPI } from '../services/api';
import * as Notifications from 'expo-notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SUGGESTED_ANCHORS = [
  'Close one loop',
  'Take three deep breaths',
  'Write down one thought',
  'Drink a glass of water',
  'Stand and stretch',
  'Clear one notification',
  'Review your top priority for tomorrow',
  'Take a 5-minute walk',
  'Do a 5 minute meditation.',
  'Write down one thing you\'re grateful for',
];

const ONBOARDING_DATA = [
  {
    id: '1',
    isAnchorStep: true,
    title: 'Set your anchor',
    description: 'A small, repeatable action that grounds your day. You can change it anytime in Settings.',
  },
  {
    id: '2',
    isNotificationStep: true,
    title: 'Koan works through small, subtle moments',
    description:
      "Most of Koan's magic happens through short, gentle notifications delivered at the right time. They're quiet, respectful, and designed to help you realign — not interrupt.",
    features: [
      { icon: 'volume-off', text: 'Silent by default' },
      { icon: 'time-outline', text: 'Delivered at the right time' },
      { icon: 'shield-outline', text: 'Private and respectful' },
    ],
  },
  {
    id: '3',
    isExpectStep: true,
    title: 'Now Koan begins to listen.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setTimeout(() => setShowInterstitial(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Breathing dot for step 3
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.16, duration: 2500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const requestNotifications = async () => {
    try {
      await Notifications.requestPermissionsAsync();
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const authToken = await storage.getAuthToken();
      await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/user/push-token`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ push_token: tokenData.data }),
      }).catch(() => {}); // fail silently
    } catch (error) {
      console.error('Failed to request notifications:', error);
    }
    handleNext();
  };

  const skipNotifications = () => {
    handleNext();
  };

  const handleInterstitialContinue = () => {
    setShowInterstitial(false);
    setCurrentIndex(0);
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
  };

  const handleNext = () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  };

  const toggleAnchor = (suggestion: string) => {
    setSelectedAnchors(prev => {
      if (prev.includes(suggestion)) {
        return prev.filter(a => a !== suggestion);
      }
      if (prev.length >= 3) return prev;
      return [...prev, suggestion];
    });
  };

  const handleAnchorContinue = async () => {
    try {
      const defaultTimes = ['09:00', '14:00', '18:00'];
      const anchor_actions = selectedAnchors.map((text, i) => ({
        text,
        time: defaultTimes[i],
        enabled: true,
      }));
      await preferencesAPI.update({ anchor_actions });
    } catch (error) {
      console.error('Failed to save anchors from onboarding:', error);
    }
    const nextIndex = 1;
    setCurrentIndex(nextIndex);
    flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const handleSkip = async () => {
    await storage.setOnboardingComplete();
    router.replace('/(tabs)');
  };

  const handleLetsGo = async () => {
    await storage.setOnboardingComplete();
    router.replace('/(tabs)');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const renderProgressDots = () => (
    <View style={styles.progressContainer}>
      {ONBOARDING_DATA.map((_, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;
        return (
          <View
            key={index}
            style={[
              styles.progressDot,
              isDone && styles.progressDotDone,
              isActive && styles.progressDotActive,
            ]}
          />
        );
      })}
    </View>
  );

  const renderOnboardingCard = ({ item }: any) => {
    // Step 1 — Notifications
    if (item.isNotificationStep) {
      return (
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>

            <View style={styles.notificationFeatures}>
              {item.features.map((feature: any, idx: number) => (
                <View key={idx} style={styles.featureRow}>
                  <Ionicons name={feature.icon} size={20} color="#5FAD8E" />
                  <Text style={styles.featureRowText}>{feature.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.enableButton} onPress={requestNotifications}>
              <Text style={styles.enableButtonText}>Enable notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={skipNotifications} style={styles.skipLinkContainer}>
              <Text style={styles.skipLinkText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Step 2 — Anchor action
    if (item.isAnchorStep) {
      return (
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>

            {selectedAnchors.length > 0 && (
              <Text style={styles.anchorSelectionHint}>
                {selectedAnchors.length}/3 selected
              </Text>
            )}

            <View style={styles.suggestionsGrid}>
              {SUGGESTED_ANCHORS.map((suggestion, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.chip,
                    selectedAnchors.includes(suggestion) && styles.chipSelected,
                    selectedAnchors.length >= 3 && !selectedAnchors.includes(suggestion) && styles.chipDisabled,
                  ]}
                  onPress={() => toggleAnchor(suggestion)}
                >
                  <Text style={[styles.chipText, selectedAnchors.includes(suggestion) && styles.chipTextSelected]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      );
    }

    // Step 3 — What to expect
    if (item.isExpectStep) {
      return (
        <View style={styles.card}>
          <View style={styles.cardContent}>
            {/* Pulsing dot */}
            <Animated.View style={[styles.expectDotOuter, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.expectDotMid}>
                <View style={styles.expectDotCore} />
              </View>
            </Animated.View>

            <Text style={styles.expectTitle}>{item.title}</Text>
            <Text style={styles.expectBody}>
              For the next day or two, Koan is building your baseline. Here's what to expect.
            </Text>

            {/* Timeline */}
            <View style={styles.timeline}>
              {/* Event 1 */}
              <View style={styles.timelineEvent}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, styles.timelineDotActive]} />
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineRight}>
                  <Text style={styles.timelineTime}>TODAY</Text>
                  <Text style={styles.timelineTitle}>Your anchor reminder</Text>
                  <Text style={styles.timelineSubtitle}>
                    You'll receive your first reminder at 9:00 am tomorrow.
                  </Text>
                </View>
              </View>

              {/* Event 2 */}
              <View style={styles.timelineEvent}>
                <View style={styles.timelineLeft}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineRight}>
                  <Text style={styles.timelineTime}>DAYS 1–2</Text>
                  <Text style={styles.timelineTitle}>Pattern learning</Text>
                  <Text style={styles.timelineSubtitle}>
                    Koan watches quietly. No nudges yet — just listening.
                  </Text>
                </View>
              </View>

              {/* Event 3 */}
              <View style={styles.timelineEvent}>
                <View style={styles.timelineLeft}>
                  <View style={styles.timelineDot} />
                </View>
                <View style={styles.timelineRight}>
                  <Text style={styles.timelineTime}>WITHIN 48 HOURS</Text>
                  <Text style={styles.timelineTitle}>Your first nudge</Text>
                  <Text style={styles.timelineSubtitle}>
                    When a pattern is clear enough to say something useful, Koan will.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress dots (hidden under interstitial but rendered for layout) */}
      {renderProgressDots()}

      {/* Swipeable slides */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_DATA}
        renderItem={renderOnboardingCard}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />

      {/* Bottom navigation */}
      {!showInterstitial && (
        <View style={styles.buttonContainer}>
          {currentIndex === 2 ? (
            // Step 3 (expect): Let's go only
            <TouchableOpacity style={styles.letsGoButton} onPress={handleLetsGo}>
              <Text style={styles.letsGoText}>Let's go</Text>
            </TouchableOpacity>
          ) : currentIndex === 0 ? (
            // Step 1 (anchor): Skip + Continue
            <>
              <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextButton, selectedAnchors.length === 0 && styles.nextButtonDisabled]}
                onPress={handleAnchorContinue}
                disabled={selectedAnchors.length === 0}
              >
                <Text style={styles.nextText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          ) : null /* Step 2 (notifications): navigation is in the card */}
        </View>
      )}

      {/* Interstitial overlay — absolute, full-screen, zIndex 10 */}
      {showInterstitial && (
        <View style={styles.interstitial}>
          <Text style={styles.interstitialLabel}>HOW IT WORKS</Text>

          <View style={styles.interstitialContent}>
            <View style={styles.interstitialLine}>
              <Text style={styles.interstitialLineTitle}>Koan watches quietly.</Text>
              <Text style={styles.interstitialLineBody}>
                Health signals, phone pickups, app switches, meeting density. Nothing personal. Nothing invasive.
              </Text>
            </View>
            <View style={[styles.interstitialLine, styles.interstitialLineBorder]}>
              <Text style={styles.interstitialLineTitle}>Patterns emerge.</Text>
              <Text style={styles.interstitialLineBody}>
                After a few days, your rhythm becomes clear — when you focus well, when you drift.
              </Text>
            </View>
            <View style={[styles.interstitialLine, styles.interstitialLineBorder]}>
              <Text style={styles.interstitialLineTitle}>A nudge arrives.</Text>
              <Text style={styles.interstitialLineBody}>
                Short. Calm. At exactly the right moment. Then silence again.
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={handleInterstitialContinue} style={styles.continueButton}>
            <Text style={styles.continueText}>
              Continue <Text style={styles.continueArrow}>→</Text>
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  // Progress dots
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  progressDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E6E6E4',
  },
  progressDotDone: {
    backgroundColor: 'rgba(95,173,142,0.4)',
    width: 5,
  },
  progressDotActive: {
    backgroundColor: '#5FAD8E',
    width: 20,
    borderRadius: 10,
  },
  // Cards (FlatList slides)
  card: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 8,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 30,
  },
  description: {
    fontSize: 13,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  // Notification step
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
  featureRowText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#3A3A3A',
  },
  enableButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 14,
    width: '100%',
    alignItems: 'center',
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  skipLinkContainer: {
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
  },
  // Anchor step
  suggestionsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#D9F7EB',
    borderColor: 'rgba(95,173,142,0.4)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
  },
  chipTextSelected: {
    color: '#5FAD8E',
    fontWeight: '400',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  anchorSelectionHint: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5FAD8E',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  // Expect step (step 3)
  expectDotOuter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    alignSelf: 'center',
  },
  expectDotMid: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(168,215,240,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expectDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5FAD8E',
  },
  expectTitle: {
    fontFamily: 'Georgia',
    fontSize: 21,
    fontWeight: '500',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
  },
  expectBody: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
  },
  // Timeline
  timeline: {
    width: '100%',
  },
  timelineEvent: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
  },
  timelineLeft: {
    width: 20,
    alignItems: 'center',
    flexShrink: 0,
    paddingTop: 2,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D9F7EB',
    borderWidth: 1.5,
    borderColor: '#5FAD8E',
  },
  timelineDotActive: {
    backgroundColor: '#5FAD8E',
    borderColor: '#5FAD8E',
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: '#E6E6E4',
    marginVertical: 4,
    minHeight: 14,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 4,
  },
  timelineTime: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06 * 10,
    textTransform: 'uppercase',
    color: '#5FAD8E',
    marginBottom: 2,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#3A3A3A',
    marginBottom: 2,
    lineHeight: 18,
  },
  timelineSubtitle: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.6,
    lineHeight: 16,
  },
  // Bottom navigation
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 8,
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: '#3A3A3A',
    opacity: 0.5,
    fontSize: 15,
    fontWeight: '500',
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#5FAD8E',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#B0D9C7',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  letsGoButton: {
    flex: 1,
    backgroundColor: '#5FAD8E',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letsGoText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Interstitial overlay
  interstitial: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFDFA',
    zIndex: 10,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  interstitialLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
    color: '#5FAD8E',
    opacity: 0.8,
    alignSelf: 'center',
    marginBottom: 20,
  },
  interstitialContent: {},
  interstitialLine: {
    paddingVertical: 18,
  },
  interstitialLineBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  interstitialLineTitle: {
    fontFamily: 'Georgia',
    fontSize: 19,
    fontStyle: 'italic',
    fontWeight: '400',
    color: '#3A3A3A',
    marginBottom: 6,
  },
  interstitialLineBody: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
    lineHeight: 19,
  },
  continueButton: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  continueText: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  continueArrow: {
    color: '#5FAD8E',
    fontSize: 14,
    opacity: 1,
  },
});
