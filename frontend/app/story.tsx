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
];

const TYPING_SPEED = 22;

function delayAfterChar(char: string, nextChar?: string): number {
  return TYPING_SPEED;
}

interface StoryProps {
  onContinue: () => void;
}

export default function Story({ onContinue }: StoryProps) {
  const [completedParagraphs, setCompletedParagraphs] = useState<string[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [done, setDone] = useState(false);
  const continueAnim = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<ScrollView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for use inside closures
  const doneRef = useRef(false);
  const skippedRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const showContinue = () => {
    Animated.timing(continueAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    doneRef.current = true;
    setDone(true);
  };

  useEffect(() => {
    if (skippedRef.current) return;

    const paragraph = PARAGRAPHS[currentParagraphIndex];
    if (!paragraph) return;

    let charIndex = currentText.length;

    const typeNext = () => {
      if (skippedRef.current) return;

      if (charIndex >= paragraph.length) {
        // Paragraph done — pause then advance
        timeoutRef.current = setTimeout(() => {
          if (skippedRef.current) return;
          const nextIndex = currentParagraphIndex + 1;
          setCompletedParagraphs(prev => [...prev, paragraph]);
          setCurrentText('');
          if (nextIndex >= PARAGRAPHS.length) {
            setCurrentParagraphIndex(nextIndex);
            showContinue();
          } else {
            setCurrentParagraphIndex(nextIndex);
          }
        }, 600);
        return;
      }

      const char = paragraph[charIndex];
      const nextChar = paragraph[charIndex + 1];
      const delay = charIndex === 0 ? TYPING_SPEED : delayAfterChar(paragraph[charIndex - 1], char);

      timeoutRef.current = setTimeout(() => {
        if (skippedRef.current) return;
        charIndex++;
        setCurrentText(paragraph.slice(0, charIndex));
      }, delay);
    };

    typeNext();

    return () => clearTimer();
  }, [currentText, currentParagraphIndex]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [currentText, completedParagraphs, done]);

  const skipToEnd = () => {
    skippedRef.current = true;
    clearTimer();
    setTimeout(() => {
      setCompletedParagraphs(PARAGRAPHS);
      setCurrentText('');
      setCurrentParagraphIndex(PARAGRAPHS.length);
      showContinue();
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const handleScreenTap = () => {
    if (!doneRef.current) {
      skipToEnd();
    }
  };

  const isTypingDone = currentParagraphIndex >= PARAGRAPHS.length;

  return (
    <TouchableWithoutFeedback onPress={handleScreenTap}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={true}
          scrollEventThrottle={16}
        >
          {completedParagraphs.map((text, i) => (
            <Text key={i} style={styles.paragraph}>
              {text}
            </Text>
          ))}

          {!isTypingDone && currentText.length > 0 && (
            <Text style={styles.paragraph}>
              {currentText}
            </Text>
          )}

          {done && (
            <Animated.View style={{ opacity: continueAnim, alignItems: 'flex-end', marginTop: 8 }}>
              <Text style={styles.continueText} onPress={onContinue}>
                Continue →
              </Text>
            </Animated.View>
          )}
        </ScrollView>
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
    paddingVertical: 60,
    paddingHorizontal: 36,
  },
  paragraph: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 28,
    color: '#3A3A3A',
    textAlign: 'left',
    marginBottom: 24,
  },
  continueText: {
    fontSize: 12,
    color: '#5FAD8E',
  },
});
