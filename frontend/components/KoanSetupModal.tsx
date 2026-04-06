import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { requestHealthKitPermissions } from '../services/healthKit';
import { calendarAPI, microsoftAPI } from '../services/api';

interface KoanSetupModalProps {
  visible: boolean;
  onComplete: () => void;
}

export default function KoanSetupModal({ visible, onComplete }: KoanSetupModalProps) {
  const [step, setStep] = useState(1);

  const advance = () => setStep(s => s + 1);

  const handleHealthKit = async () => {
    try {
      await requestHealthKitPermissions();
    } catch {
      // proceed regardless
    }
    advance();
  };

  const handleCalendar = async (provider: 'google' | 'microsoft') => {
    try {
      const { auth_url } = provider === 'google'
        ? await calendarAPI.getAuthUrl()
        : await microsoftAPI.getAuthUrl();
      const redirectUri = provider === 'google'
        ? 'koan://calendar-connected'
        : 'koan://microsoft-connected';
      await WebBrowser.openAuthSessionAsync(auth_url, redirectUri);
    } catch {
      // fail silently
    }
    advance();
  };

  const handleNotifications = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // proceed regardless
    }
    advance();
  };

  const renderDots = () => (
    <View style={styles.dots}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
      ))}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.serifTitle}>Welcome to Koan</Text>
            <View style={styles.videoPlaceholder}>
              <Ionicons name="play-circle" size={72} color="#FFFFFF" />
            </View>
            <Text style={styles.body}>Two minutes that explain everything.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={advance}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={advance} style={styles.linkContainer}>
              <Text style={styles.linkText}>Skip video</Text>
            </TouchableOpacity>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>What Koan pays attention to</Text>
            <Text style={styles.body}>
              {"Koan notices how you use your phone — how often you pick it up, when you switch between apps, how late you're on it. This stays on your device and is only used to know when something is worth saying.\n\nIf you allow it, Koan can also read from Apple Health — your sleep, movement, and heart rate. This unlocks pattern detection based on how your body is actually doing. We never write to Health, and this data is never shared."}
            </Text>
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.primaryButton} onPress={handleHealthKit}>
                <Text style={styles.primaryButtonText}>Allow Apple Health</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={advance}
              style={[styles.linkContainer, Platform.OS !== 'ios' && { marginTop: 8 }]}
            >
              <Text style={styles.linkText}>Not now</Text>
            </TouchableOpacity>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your calendar</Text>
            <Text style={styles.body}>
              {"If you connect your calendar, Koan can see your meeting load and schedule density. This unlocks nudges about recovery time and work-life balance. We read event titles and times only — never content or attendees."}
            </Text>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => handleCalendar('google')}
            >
              <Text style={styles.outlineButtonText}>Connect Google Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineButton, styles.outlineButtonSpaced]}
              onPress={() => handleCalendar('microsoft')}
            >
              <Text style={styles.outlineButtonText}>Connect Microsoft 365</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={advance} style={styles.linkContainer}>
              <Text style={styles.linkText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>How Koan speaks to you</Text>
            <Text style={styles.body}>
              {"Koan speaks through notifications. Without this, it can observe but never reach you. Nudges are rare and deliberate — you will not be bombarded."}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleNotifications}>
              <Text style={styles.primaryButtonText}>Enable notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={advance} style={styles.linkContainer}>
              <Text style={styles.linkText}>Not now</Text>
            </TouchableOpacity>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContainerCentered}>
            <Text style={styles.serifTitleLarge}>Koan is ready.</Text>
            <Text style={styles.bodyCenter}>
              It will take a few days to learn your patterns. The first nudge will arrive when there is something worth saying.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onComplete}>
              <Text style={styles.primaryButtonText}>Begin</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>
        {step < 5 && renderDots()}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
  },
  stepContainer: {
    flex: 1,
  },
  stepContainerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serifTitle: {
    fontFamily: 'Georgia',
    fontSize: 32,
    fontWeight: '400',
    color: '#3A3A3A',
    marginBottom: 32,
    lineHeight: 40,
  },
  serifTitleLarge: {
    fontFamily: 'Georgia',
    fontSize: 36,
    fontWeight: '400',
    color: '#3A3A3A',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 44,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 24,
    lineHeight: 32,
  },
  videoPlaceholder: {
    backgroundColor: '#D9F7EB',
    borderRadius: 16,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  body: {
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 24,
    opacity: 0.8,
    marginBottom: 32,
  },
  bodyCenter: {
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 24,
    opacity: 0.7,
    marginBottom: 40,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  outlineButtonSpaced: {
    marginTop: 12,
    marginBottom: 4,
  },
  outlineButtonText: {
    color: '#5FAD8E',
    fontSize: 16,
    fontWeight: '500',
  },
  linkContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  linkText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.5,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E6E6E4',
  },
  dotActive: {
    backgroundColor: '#5FAD8E',
    width: 20,
    borderRadius: 10,
  },
});
