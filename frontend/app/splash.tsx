import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

interface SplashScreenProps {
  onDone: () => void;
  onBegin: () => void;
}

export default function SplashScreen({ onDone, onBegin }: SplashScreenProps) {
  const router = useRouter();

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const trialOpacity = useRef(new Animated.Value(0)).current;
  const learnMoreOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    // Breathing dot animation
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.25, duration: 3500, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.55, duration: 3500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 3500, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.25, duration: 3500, useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Staggered fade-in sequence
    // logo: 0–600ms
    // content: 800–1400ms
    // button+trial: 1600–2200ms (parallel)
    // learn more: 3500ms (after 1300ms delay)
    Animated.sequence([
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(contentOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(buttonOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(trialOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.delay(1300),
      Animated.timing(learnMoreOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Brand — top left */}
        <Animated.View style={[styles.topSection, { opacity: logoOpacity }]}>
          <Text style={styles.brand}>Koan</Text>
        </Animated.View>

        {/* Center — dot + tagline */}
        <View style={styles.centerSection}>
          <View style={styles.dotContainer}>
            <Animated.View
              style={[
                styles.dotHalo,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <View style={styles.dotCore} />
          </View>

          <Animated.View style={{ opacity: contentOpacity, alignItems: 'center' }}>
            <Text style={styles.tagline}>
              Everything you need to know,{'\n'}
              <Text style={styles.taglineAccent}>you already know.</Text>
            </Text>
          </Animated.View>
        </View>

        {/* Bottom — CTAs */}
        <View style={styles.bottomSection}>
          <Animated.View style={[{ width: '100%' }, { opacity: buttonOpacity }]}>
            <TouchableOpacity style={styles.beginButton} onPress={onBegin}>
              <Text style={styles.beginButtonText}>Begin</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.Text style={[styles.trialNote, { opacity: trialOpacity }]}>
            14 days free · No credit card required
          </Animated.Text>

          <Animated.View style={{ opacity: learnMoreOpacity }}>
            <TouchableOpacity onPress={() => router.push('/learn-more')}>
              <Text style={styles.learnMoreLink}>Learn more about Koan ↓</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'flex-start',
  },
  brand: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0.3,
    color: '#3A3A3A',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  dotContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  dotHalo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#A8D4BC',
  },
  dotCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#5FAD8E',
  },
  tagline: {
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '400',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 14,
  },
  taglineAccent: {
    fontStyle: 'italic',
    color: '#5FAD8E',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSection: {
    alignItems: 'center',
    gap: 14,
  },
  beginButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  beginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  trialNote: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
  },
  learnMoreLink: {
    fontSize: 11,
    color: 'rgba(95,173,142,0.7)',
    textAlign: 'center',
  },
});
