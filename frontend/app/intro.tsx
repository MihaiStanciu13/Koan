import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const { width: screenWidth } = Dimensions.get('window');

type HeadlinePart = { text: string; italic: boolean };

const SCREENS: {
  headlineParts: HeadlinePart[];
  body: string;
  buttonLabel: string;
  buttonFilled: boolean;
}[] = [
  {
    headlineParts: [
      { text: 'Somewhere along the way, living well became a ', italic: false },
      { text: 'project', italic: true },
      { text: '.', italic: false },
    ],
    body: 'A score to improve.\nA streak to protect.\nA goal to hit by Sunday.',
    buttonLabel: 'Continue',
    buttonFilled: false,
  },
  {
    headlineParts: [
      { text: 'The healthiest people in the world never tracked ', italic: false },
      { text: 'anything', italic: true },
      { text: '.', italic: false },
    ],
    body: 'In Sardinia. In Icaria.\nThey moved, ate, rested,\nand connected — without\ncounting a single step.',
    buttonLabel: 'Continue',
    buttonFilled: false,
  },
  {
    headlineParts: [
      { text: 'People have always known ', italic: false },
      { text: 'this', italic: true },
      { text: '.', italic: false },
    ],
    body: 'You probably do too.\n\nKoan is here to remind you\nof what you already know —\nwhen you most need\nto hear it.',
    buttonLabel: 'Continue',
    buttonFilled: false,
  },
  {
    headlineParts: [
      { text: 'Koan ', italic: false },
      { text: 'listens', italic: true },
      { text: '. And speaks only when something is worth saying.', italic: false },
    ],
    body: 'No streaks. No scores.\nJust quiet observation —\nand a nudge, when the\nmoment is right.',
    buttonLabel: 'Begin',
    buttonFilled: true,
  },
];

export default function IntroScreen() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  // Breathing dot animation (same as splash.tsx)
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.25)).current;

  // Horizontal slide animation for content transitions
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, []);

  const screen = SCREENS[step];

  const handleButton = () => {
    // New content starts off-screen to the right, then slides in
    slideAnim.setValue(screenWidth);
    if (step < SCREENS.length - 1) {
      setStep(step + 1);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(() => router.replace('/landing'));
    }
  };

  const handleLogIn = () => {
    router.navigate({ pathname: '/', params: { auth: 'login' } } as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Breathing dot — not animated with slide, stays fixed */}
        <View style={styles.iconContainer}>
          <View style={styles.dotContainer}>
            <Animated.View
              style={[
                styles.dotHalo,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <View style={styles.dotCore} />
          </View>
        </View>

        {/* Headline + body — slides on step change */}
        <Animated.View style={[styles.content, { transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.headline}>
            {screen.headlineParts.map((part, i) => (
              <Text key={i} style={part.italic ? styles.headlineAccent : undefined}>
                {part.text}
              </Text>
            ))}
          </Text>
          <Text style={styles.body}>{screen.body}</Text>
        </Animated.View>

        {/* Bottom: button, optional log-in link, progress dots */}
        <View style={styles.bottom}>
          <TouchableOpacity
            style={screen.buttonFilled ? styles.buttonFilled : styles.buttonOutline}
            onPress={handleButton}
            activeOpacity={0.75}
          >
            <Text style={screen.buttonFilled ? styles.buttonFilledText : styles.buttonOutlineText}>
              {screen.buttonLabel}
            </Text>
          </TouchableOpacity>

          {step === 0 && (
            <TouchableOpacity onPress={handleLogIn} style={styles.loginLink}>
              <Text style={styles.loginLinkText}>Already have an account? Log in</Text>
            </TouchableOpacity>
          )}

          <View style={styles.progressDots}>
            {SCREENS.map((_, i) => (
              <View
                key={i}
                style={[styles.progressDot, i === step ? styles.progressDotActive : styles.progressDotInactive]}
              />
            ))}
          </View>
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
  inner: {
    flex: 1,
    paddingHorizontal: 32,
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
  },
  dotContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headline: {
    fontFamily: 'Georgia',
    fontSize: 22,
    color: '#1a2e24',
    textAlign: 'center',
    lineHeight: 30,
  },
  headlineAccent: {
    fontStyle: 'italic',
    color: '#5FAD8E',
  },
  body: {
    fontFamily: 'Georgia',
    fontSize: 14,
    color: '#5a7868',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
  },
  bottom: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#5FAD8E',
    borderRadius: 50,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  buttonOutlineText: {
    fontFamily: 'Georgia',
    fontSize: 16,
    color: '#5FAD8E',
  },
  // Begin button matches splash.tsx exactly
  buttonFilled: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  buttonFilledText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  loginLink: {
    marginTop: 10,
  },
  loginLinkText: {
    fontSize: 12,
    color: '#8aab98',
    textAlign: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  progressDot: {
    width: 5,
    height: 5,
    borderRadius: 50,
  },
  progressDotInactive: {
    backgroundColor: '#c5ddd0',
  },
  progressDotActive: {
    backgroundColor: '#5FAD8E',
  },
});
