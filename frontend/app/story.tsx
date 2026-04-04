import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PARAGRAPHS = [
  "My grandparents lived past ninety.",
  "They never tracked their steps. Never counted calories. Never wore a watch that measured their sleep.",
  "They moved every day. Ate real food. Went to bed when it got dark. Did word puzzles and looked up words in dictionaries. Had people they loved nearby.",
  "They lived moderately. They lived well.",
  "In the highlands of Sardinia, in the Greek island of Icaria, in the blue zones scattered across the world — people live this way well into their hundreds. Not because of supplements or routines. Because of rhythm.",
  "Our ancestors lived this way too. They walked long distances. Ate what the season offered. Rested when the light faded. Stress was short and sharp — not the slow, chronic kind we carry now.",
  "Somewhere along the way, we made this complicated.",
  "Koan is a small attempt to make it simple again.",
  "—",
];

const FADE_DURATION = 800;
const GAP_BETWEEN = 400;

interface StoryProps {
  onContinue: () => void;
}

export default function Story({ onContinue }: StoryProps) {
  const [animationComplete, setAnimationComplete] = useState(false);

  const paragraphAnims = useRef(
    PARAGRAPHS.map(() => new Animated.Value(0))
  ).current;
  const continueAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  // Ref for synchronous check inside handleScreenTap (state update is async)
  const isCompleteRef = useRef(false);

  useEffect(() => {
    runAnimation();
    return () => {
      animationRef.current?.stop();
    };
  }, []);

  const runAnimation = () => {
    const sequence: Animated.CompositeAnimation[] = [];

    PARAGRAPHS.forEach((_, i) => {
      if (i > 0) sequence.push(Animated.delay(GAP_BETWEEN));
      sequence.push(
        Animated.timing(paragraphAnims[i], {
          toValue: 1,
          duration: FADE_DURATION,
          useNativeDriver: true,
        })
      );
    });

    sequence.push(Animated.delay(GAP_BETWEEN));
    sequence.push(
      Animated.timing(continueAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      })
    );

    const anim = Animated.sequence(sequence);
    animationRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) {
        isCompleteRef.current = true;
        setAnimationComplete(true);
      }
    });
  };

  const skipToEnd = () => {
    animationRef.current?.stop();
    animationRef.current = null;
    paragraphAnims.forEach(a => a.setValue(1));
    continueAnim.setValue(1);
    isCompleteRef.current = true;
    setAnimationComplete(true);
  };

  const handleScreenTap = () => {
    if (!isCompleteRef.current) {
      skipToEnd();
    } else {
      onContinue();
    }
  };

  return (
    <TouchableWithoutFeedback onPress={handleScreenTap}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={animationComplete}
          // Prevent scroll gesture from consuming the tap during animation
          scrollEventThrottle={16}
        >
          {PARAGRAPHS.map((text, i) => (
            <Animated.Text
              key={i}
              style={[
                text === '—' ? styles.separator : styles.paragraph,
                i > 0 && styles.paragraphSpacing,
                { opacity: paragraphAnims[i] },
              ]}
            >
              {text}
            </Animated.Text>
          ))}
        </ScrollView>

        {/* Continue button — absolutely pinned to bottom-right, inside safe area */}
        <Animated.View
          style={[styles.continueWrapper, { opacity: continueAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.continueText}>Continue →</Text>
        </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 36,
  },
  paragraph: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 28,
    color: '#3A3A3A',
    textAlign: 'center',
  },
  paragraphSpacing: {
    marginTop: 28,
  },
  separator: {
    fontFamily: 'Georgia',
    fontSize: 17,
    color: '#3A3A3A',
    opacity: 0.3,
    textAlign: 'center',
  },
  continueWrapper: {
    position: 'absolute',
    bottom: 32,
    right: 32,
  },
  continueText: {
    fontSize: 12,
    color: '#5FAD8E',
    opacity: 0.7,
  },
});
