import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';
import Svg, { Rect } from 'react-native-svg';
import { storage } from '../services/storage';
import { calendarAPI, microsoftAPI, preferencesAPI } from '../services/api';
import { requestHealthKitPermissions } from '../services/healthKit';
import Spacer from '../components/Spacer';

const GCalIcon = ({ size = 32 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Rect width="48" height="48" rx="8" fill="#ffffff"/>
    <Rect x="6" y="6" width="36" height="36" rx="4" fill="#ffffff" stroke="#E0E0E0" strokeWidth="1"/>
    <Rect x="6" y="6" width="36" height="13" rx="4" fill="#1A73E8"/>
    <Rect x="6" y="14" width="36" height="5" fill="#1A73E8"/>
    <Rect x="13" y="28" width="5" height="2" rx="1" fill="#1A73E8"/>
    <Rect x="13" y="32" width="5" height="2" rx="1" fill="#1A73E8"/>
    <Rect x="22" y="25" width="4" height="9" rx="1" fill="#34A853"/>
    <Rect x="30" y="28" width="5" height="2" rx="1" fill="#EA4335"/>
    <Rect x="30" y="32" width="5" height="2" rx="1" fill="#EA4335"/>
  </Svg>
);

const MS365Icon = ({ size = 32 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Rect width="48" height="48" rx="8" fill="#ffffff"/>
    <Rect x="7" y="7" width="15" height="15" rx="2" fill="#F35325"/>
    <Rect x="25" y="7" width="15" height="15" rx="2" fill="#81BC06"/>
    <Rect x="7" y="25" width="15" height="15" rx="2" fill="#05A6F0"/>
    <Rect x="25" y="25" width="15" height="15" rx="2" fill="#FFBA08"/>
  </Svg>
);

const ANCHOR_CHIPS = [
  'Close one loop',
  'Three deep breaths',
  'Write one thought',
  'Drink water',
  'Stand and stretch',
  'Clear one notification',
  '5 min walk',
  '5 min meditation',
  "One thing I'm grateful for",
  'Top priority for tomorrow',
];

export default function Onboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [healthConnected, setHealthConnected] = useState(false);
  const [gCalConnected, setGCalConnected] = useState(false);
  const [msConnected, setMsConnected] = useState(false);
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([]);

  const haloScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(haloScale, { toValue: 1.22, duration: 3500, useNativeDriver: true }),
          Animated.timing(haloScale, { toValue: 1, duration: 3500, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(haloOpacity, { toValue: 0.48, duration: 3500, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.25, duration: 3500, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  const handleConnectHealth = async () => {
    try {
      await requestHealthKitPermissions();
      setHealthConnected(true);
      try {
        const prefs = await preferencesAPI.get();
        const existing: string[] = prefs.connected_tools || [];
        if (!existing.includes('apple_health')) {
          await preferencesAPI.update({ connected_tools: [...existing, 'apple_health'] });
        }
      } catch {
        // non-fatal
      }
    } catch {
      Alert.alert('Apple Health is only available on iOS.');
    }
  };

  const handleConnectGCal = async () => {
    try {
      const { auth_url } = await calendarAPI.getAuthUrl();
      const result = await WebBrowser.openAuthSessionAsync(auth_url, 'koan://calendar-connected');
      if (result.type !== 'success') return;
      const status = await calendarAPI.getStatus();
      if (status.connected) {
        setGCalConnected(true);
        try {
          const prefs = await preferencesAPI.get();
          const existing: string[] = prefs.connected_tools || [];
          if (!existing.includes('gcalendar')) {
            await preferencesAPI.update({ connected_tools: [...existing, 'gcalendar'] });
          }
        } catch {
          // non-fatal
        }
      }
    } catch {
      Alert.alert('Error', 'Could not connect Google Calendar. Please try again.');
    }
  };

  const handleConnectMicrosoft = async () => {
    try {
      const { auth_url } = await microsoftAPI.getAuthUrl();
      const result = await WebBrowser.openAuthSessionAsync(auth_url, 'koan://microsoft-connected');
      if (result.type !== 'success') return;
      const status = await microsoftAPI.getStatus();
      if (status.connected) {
        setMsConnected(true);
        try {
          const prefs = await preferencesAPI.get();
          const existing: string[] = prefs.connected_tools || [];
          if (!existing.includes('microsoft365')) {
            await preferencesAPI.update({ connected_tools: [...existing, 'microsoft365'] });
          }
        } catch {
          // non-fatal
        }
      }
    } catch {
      Alert.alert('Error', 'Could not connect Microsoft 365. Please try again.');
    }
  };

  const handleEnableNotifications = async () => {
    await Notifications.requestPermissionsAsync();
    setCurrentStep(4);
  };

  const toggleAnchor = (chip: string) => {
    setSelectedAnchors(prev => {
      if (prev.includes(chip)) return prev.filter(a => a !== chip);
      if (prev.length >= 3) return prev;
      return [...prev, chip];
    });
  };

  const handleAnchorContinue = async () => {
    if (selectedAnchors.length > 0) {
      try {
        const defaultTimes = ['09:00', '14:00', '18:00'];
        const anchor_actions = selectedAnchors.map((text, i) => ({
          text,
          time: defaultTimes[i],
          enabled: true,
        }));
        await preferencesAPI.update({ anchor_actions });
      } catch (error) {
        console.error('Failed to save anchors:', error);
        // Don't block navigation on failure
      }
    }
    setCurrentStep(5);
  };

  const handleBegin = async () => {
    await storage.setOnboardingComplete();
    router.replace('/(tabs)');
  };

  // ── Header ──────────────────────────────────────────────────────────────

  const renderHeader = () => {
    if (currentStep === 5) {
      return (
        <View style={styles.headerCentered}>
          <Text style={styles.wordmarkCentered}>Koan</Text>
        </View>
      );
    }
    return (
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {currentStep > 0 && (
            <TouchableOpacity
              onPress={() => setCurrentStep(prev => prev - 1)}
              hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={22} color="#3A3A3A" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.wordmark}>Koan</Text>
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                i < currentStep && styles.dotDone,
                i === currentStep && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  // ── Screen 0: Welcome ────────────────────────────────────────────────────

  const renderWelcome = () => (
    <>
      <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
      <View style={styles.videoBlock}>
        <View style={styles.playButton}>
          <View style={styles.playTriangle} />
        </View>
        <Text style={styles.videoLabel}>2 MIN INTRO</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'space-evenly' }}>
        <View style={styles.interstitialLine}>
          <Text style={styles.interstitialTitle}>Koan watches quietly.</Text>
          <Text style={styles.interstitialBody}>
            Health signals, phone pickups, app switches, meeting density. Nothing personal.
          </Text>
        </View>
        <View style={[styles.interstitialLine, styles.interstitialLineBorder]}>
          <Text style={styles.interstitialTitle}>Patterns emerge.</Text>
          <Text style={styles.interstitialBody}>
            After a few days, your rhythm becomes clear — when you focus, when you drift.
          </Text>
        </View>
        <View style={[styles.interstitialLine, styles.interstitialLineBorder]}>
          <Text style={styles.interstitialTitle}>A nudge arrives.</Text>
          <Text style={styles.interstitialBody}>
            Short. Calm. At exactly the right moment. Then silence again.
          </Text>
        </View>
        <View style={[styles.interstitialLine, styles.interstitialLineBorder]}>
          <Text style={styles.interstitialTitle}>Each week, a reflection.</Text>
          <Text style={styles.interstitialBody}>
            A quiet observation in Insights, every Sunday.
          </Text>
        </View>
      </View>
    </>
  );

  // ── Screen 1: Phone signals ──────────────────────────────────────────────

  const renderPhoneSignals = () => (
    <>
      <Text style={styles.sectionLabel}>WHAT KOAN PAYS ATTENTION TO</Text>
      <Text style={styles.screenSubtitle}>
        From your phone, always — no setup needed. From Apple Health, optionally.
      </Text>
      <View style={styles.alwaysOnCard}>
        <Text style={styles.alwaysOnHeader}>Always on · Phone signals</Text>
        {[
          {
            name: 'Phone pickups',
            desc: 'How often you reach for your phone, and your first pickup each morning.',
          },
          {
            name: 'Screen time patterns',
            desc: 'Total usage, app categories, and how your attention is distributed.',
          },
          {
            name: 'App switching',
            desc: 'Context-switching frequency — a key signal for focus drift.',
          },
        ].map((signal, i) => (
          <View key={i} style={[styles.signalRow, i > 0 && styles.signalRowBorder]}>
            <View style={styles.signalDot} />
            <View style={styles.signalTextBlock}>
              <Text style={styles.signalName}>{signal.name}</Text>
              <Text style={styles.signalDesc}>{signal.desc}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <View style={[styles.emojiIconContainer, { backgroundColor: '#FFF0F0' }]}>
            <Text style={styles.emojiIcon}>❤️</Text>
          </View>
          <View style={styles.integrationInfo}>
            <Text style={styles.integrationName}>Apple Health</Text>
            <Text style={styles.integrationSubtext}>Sleep · Activity · HRV · Read-only</Text>
          </View>
        </View>
        <Text style={styles.integrationDesc}>
          Koan uses health signals to understand energy and recovery — not to count steps. Raw data never leaves your device.
        </Text>
        <TouchableOpacity
          style={[styles.connectButton, healthConnected && styles.connectedButton]}
          onPress={handleConnectHealth}
          disabled={healthConnected}
          activeOpacity={0.8}
        >
          <Text style={[styles.connectButtonText, healthConnected && styles.connectedButtonText]}>
            {healthConnected ? '✓ Connected' : 'Connect Apple Health'}
          </Text>
        </TouchableOpacity>
      </View>
      <Spacer minHeight={16} />
    </>
  );

  // ── Screen 2: Work tools ─────────────────────────────────────────────────

  const renderWorkTools = () => (
    <>
      <Text style={styles.sectionLabel}>WORK TOOLS</Text>
      <Text style={styles.screenSubtitle}>
        Connect what you use. Koan reads meeting load and rhythm — never schedules, never edits.
      </Text>
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <View style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden' }}>
            <GCalIcon size={32} />
          </View>
          <View style={styles.integrationInfo}>
            <Text style={styles.integrationName}>Google Calendar</Text>
            <Text style={styles.integrationSubtext}>Read-only · OAuth</Text>
          </View>
        </View>
        <Text style={styles.integrationDesc}>
          Detects back-to-back meetings, transition time, and heavy days.
        </Text>
        <TouchableOpacity
          style={[styles.connectButton, gCalConnected && styles.connectedButton]}
          onPress={handleConnectGCal}
          disabled={gCalConnected}
          activeOpacity={0.8}
        >
          <Text style={[styles.connectButtonText, gCalConnected && styles.connectedButtonText]}>
            {gCalConnected ? '✓ Connected' : 'Connect Google Calendar'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.integrationCard}>
        <View style={styles.integrationHeader}>
          <View style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden' }}>
            <MS365Icon size={32} />
          </View>
          <View style={styles.integrationInfo}>
            <Text style={styles.integrationName}>Microsoft 365</Text>
            <Text style={styles.integrationSubtext}>Outlook · Teams · Read-only</Text>
          </View>
        </View>
        <Text style={styles.integrationDesc}>
          Same signals from Outlook calendar and Teams meeting load.
        </Text>
        <TouchableOpacity
          style={[styles.connectButton, msConnected && styles.connectedButton]}
          onPress={handleConnectMicrosoft}
          disabled={msConnected}
          activeOpacity={0.8}
        >
          <Text style={[styles.connectButtonText, msConnected && styles.connectedButtonText]}>
            {msConnected ? '✓ Connected' : 'Connect Microsoft 365'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.connectionNote}>
        Connect one, both, or neither. You can add more in Settings.
      </Text>
      <Spacer minHeight={16} />
    </>
  );

  // ── Screen 3: Notifications ──────────────────────────────────────────────

  const renderNotifications = () => (
    <>
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <Text style={styles.screenTitle}>One nudge, when it matters</Text>
      <Text style={styles.screenSubtitle}>
        Koan nudges rarely — only when a pattern is clear enough to say something useful. Never on a schedule.
      </Text>
      <View style={styles.nudgePreviewCard}>
        <Text style={styles.nudgePreviewLabel}>PREVIEW NUDGE</Text>
        <Text style={styles.nudgePreviewText}>
          "You've had six meetings before noon three days running. Consider protecting tomorrow morning."
        </Text>
      </View>
      <View style={styles.infoCard}>
        <View style={styles.infoCardRow}>
          <View style={styles.infoDot} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>Silent by default</Text>
            <Text style={styles.infoCardBody}>
              No sound. No badge count. A quiet banner that respects your focus.
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.infoCard}>
        <View style={styles.infoCardRow}>
          <View style={styles.infoDot} />
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>Quiet hours respected</Text>
            <Text style={styles.infoCardBody}>
              No nudges after 10 pm or before 7 am. Adjustable in Settings.
            </Text>
          </View>
        </View>
      </View>
      <Spacer minHeight={16} />
    </>
  );

  // ── Screen 4: Anchor ─────────────────────────────────────────────────────

  const renderAnchor = () => (
    <>
      <Text style={styles.sectionLabel}>ANCHOR</Text>
      <Text style={styles.screenTitle}>Set your anchor</Text>
      <Text style={styles.screenSubtitle}>
        A small, repeatable action that grounds your day. Select up to 3.
      </Text>
      <View style={{
        backgroundColor: '#D9F7EB',
        borderRadius: 12,
        padding: 13,
        borderWidth: 1,
        borderColor: 'rgba(95,173,142,0.25)',
        marginBottom: 10,
        marginTop: 8,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#2D6B4E', marginBottom: 4 }}>
          Anchors vs nudges
        </Text>
        <Text style={{ fontSize: 11.5, fontWeight: '300', color: '#3A3A3A', opacity: 0.8, lineHeight: 18 }}>
          Nudges come from Koan — triggered by patterns it observes. An anchor comes from you: a small commitment you want to protect each day. Koan will remind you, and notice when life gets in the way.
        </Text>
      </View>
      <Text style={styles.selectionCounter}>
        {selectedAnchors.length > 0 ? `${selectedAnchors.length}/3 selected` : ''}
      </Text>
      <View style={styles.chipGrid}>
        {ANCHOR_CHIPS.map((chip, i) => {
          const isSelected = selectedAnchors.includes(chip);
          const isDisabled = selectedAnchors.length >= 3 && !isSelected;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.chip, isSelected && styles.chipSelected, isDisabled && styles.chipDisabled]}
              onPress={() => toggleAnchor(chip)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{chip}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Spacer minHeight={16} />
    </>
  );

  // ── Screen 5: Ready ──────────────────────────────────────────────────────

  const renderReady = () => (
    <View style={styles.readyBody}>
      <View style={styles.dotContainer}>
        <Animated.View
          style={[
            styles.dotHalo,
            { transform: [{ scale: haloScale }], opacity: haloOpacity },
          ]}
        />
        <View style={styles.dotCore} />
      </View>
      <Text style={styles.readyTitle}>Koan is ready.</Text>
      <Text style={styles.readySubtitle}>
        It will listen quietly. You won't hear from it until it has something worth saying.
      </Text>
      <View style={styles.trialPill}>
        <Text style={styles.trialPillLabel}>14-DAY FREE TRIAL</Text>
        <Text style={styles.trialPillSub}>Full access · No credit card required</Text>
      </View>
    </View>
  );

  // ── Footer buttons (rendered inside pinned footer View) ──────────────────

  const renderFooterButtons = () => {
    switch (currentStep) {
      case 0:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentStep(1)} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Continue →</Text>
          </TouchableOpacity>
        );
      case 1:
        return (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentStep(2)} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostButton} onPress={() => setCurrentStep(2)} activeOpacity={0.6}>
              <Text style={styles.ghostButtonText}>Skip Apple Health</Text>
            </TouchableOpacity>
          </>
        );
      case 2:
        return (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentStep(3)} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostButton} onPress={() => setCurrentStep(3)} activeOpacity={0.6}>
              <Text style={styles.ghostButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </>
        );
      case 3:
        return (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={handleEnableNotifications} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Enable notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostButton} onPress={() => setCurrentStep(4)} activeOpacity={0.6}>
              <Text style={styles.ghostButtonText}>Not now</Text>
            </TouchableOpacity>
          </>
        );
      case 4:
        return (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, selectedAnchors.length === 0 && styles.primaryButtonDisabled]}
              onPress={handleAnchorContinue}
              disabled={selectedAnchors.length === 0}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostButton} onPress={() => setCurrentStep(5)} activeOpacity={0.6}>
              <Text style={styles.ghostButtonText}>Set this later</Text>
            </TouchableOpacity>
          </>
        );
      case 5:
        return (
          <>
            <TouchableOpacity style={styles.beginButton} onPress={handleBegin} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Begin</Text>
            </TouchableOpacity>
            <Text style={styles.settingsNote}>Adjust everything anytime in Settings</Text>
          </>
        );
      default:
        return null;
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        {renderHeader()}
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {currentStep === 0 && renderWelcome()}
          {currentStep === 1 && renderPhoneSignals()}
          {currentStep === 2 && renderWorkTools()}
          {currentStep === 3 && renderNotifications()}
          {currentStep === 4 && renderAnchor()}
          {currentStep === 5 && renderReady()}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8, gap: 6 }}>
          {renderFooterButtons()}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  headerCentered: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerLeft: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'Georgia',
    fontSize: 17,
    color: '#3A3A3A',
  },
  wordmarkCentered: {
    fontFamily: 'Georgia',
    fontSize: 17,
    color: '#3A3A3A',
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E6E6E4',
  },
  dotDone: {
    backgroundColor: 'rgba(95,173,142,0.35)',
  },
  dotActive: {
    width: 20,
    height: 5,
    borderRadius: 10,
    backgroundColor: '#5FAD8E',
  },

  // ── Section label ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#5FAD8E',
    marginBottom: 16,
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 5,
  },
  screenSubtitle: {
    fontSize: 11.5,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
    lineHeight: 20,
    marginBottom: 10,
  },

  // ── Welcome screen ───────────────────────────────────────────────────────
  videoBlock: {
    width: '100%',
    alignSelf: 'stretch',
    height: 128,
    backgroundColor: '#EEF0EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    flexShrink: 0,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5FAD8E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    marginLeft: 2,
  },
  videoLabel: {
    marginTop: 8,
    fontSize: 9,
    textTransform: 'uppercase',
    color: '#3A3A3A',
    opacity: 0.4,
    letterSpacing: 0.8,
  },
  interstitialLine: {
    paddingVertical: 4,
  },
  interstitialLineBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  interstitialTitle: {
    fontFamily: 'Georgia',
    fontSize: 15.5,
    fontStyle: 'italic',
    fontWeight: '400',
    color: '#3A3A3A',
    marginBottom: 3,
  },
  interstitialBody: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
    lineHeight: 19,
  },

  // ── Integration cards ────────────────────────────────────────────────────
  alwaysOnCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(95,173,142,0.25)',
    marginBottom: 9,
  },
  alwaysOnHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2D6B4E',
    marginBottom: 8,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    gap: 8,
  },
  signalRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(95,173,142,0.15)',
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5FAD8E',
    marginTop: 3,
    flexShrink: 0,
  },
  signalTextBlock: {
    flex: 1,
  },
  signalName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 2,
  },
  signalDesc: {
    fontSize: 10.5,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
    lineHeight: 16,
  },
  integrationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    marginBottom: 9,
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  emojiIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emojiIcon: {
    fontSize: 16,
  },
  integrationInfo: {
    flex: 1,
  },
  integrationName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 1,
  },
  integrationSubtext: {
    fontSize: 10,
    color: '#3A3A3A',
    opacity: 0.45,
  },
  integrationDesc: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
    lineHeight: 17,
    marginBottom: 8,
  },
  connectionNote: {
    fontSize: 10,
    color: '#3A3A3A',
    opacity: 0.38,
    textAlign: 'center',
    marginTop: 4,
  },

  // ── Connect button (outline) ─────────────────────────────────────────────
  connectButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#5FAD8E',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#5FAD8E',
    fontSize: 15,
    fontWeight: '600',
  },
  connectedButton: {
    backgroundColor: '#D9F7EB',
    borderWidth: 1,
    borderColor: 'rgba(95,173,142,0.3)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  connectedButtonText: {
    color: '#5FAD8E',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Notifications screen ─────────────────────────────────────────────────
  nudgePreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    marginBottom: 10,
  },
  nudgePreviewLabel: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#3A3A3A',
    opacity: 0.4,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  nudgePreviewText: {
    fontFamily: 'Georgia',
    fontSize: 12.5,
    fontStyle: 'italic',
    color: '#3A3A3A',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(95,173,142,0.25)',
    marginBottom: 9,
  },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5FAD8E',
    marginTop: 3,
    flexShrink: 0,
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 2,
  },
  infoCardBody: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 17,
  },

  // ── Anchor screen ────────────────────────────────────────────────────────
  selectionCounter: {
    fontSize: 11,
    color: '#5FAD8E',
    fontWeight: '400',
    marginTop: 5,
    minHeight: 16,
    marginBottom: 2,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#D9F7EB',
    borderColor: 'rgba(95,173,142,0.4)',
  },
  chipDisabled: {
    opacity: 0.3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
  },
  chipTextSelected: {
    color: '#5FAD8E',
    fontWeight: '400',
  },

  // ── Ready screen ─────────────────────────────────────────────────────────
  readyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dotHalo: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#A8D4BC',
  },
  dotCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5FAD8E',
  },
  readyTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '400',
    color: '#3A3A3A',
    textAlign: 'center',
    marginBottom: 8,
  },
  readySubtitle: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.6,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  trialPill: {
    width: '100%',
    backgroundColor: '#D9F7EB',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  trialPillLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#5FAD8E',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  trialPillSub: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.65,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#B0D9C7',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  beginButton: {
    backgroundColor: '#2D6B4E',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },
  ghostButtonText: {
    color: '#3A3A3A',
    fontSize: 13,
  },
  settingsNote: {
    fontSize: 10,
    color: '#3A3A3A',
    opacity: 0.38,
    textAlign: 'center',
  },
});
