import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { storage } from '../services/storage';
import * as Notifications from 'expo-notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_DATA = [
  {
    id: '1',
    icon: 'leaf-outline',
    title: 'Welcome to Koan',
    description: 'A different kind of productivity app',
    features: [
      'No constant pings',
      'No tracking or dashboards',
      'Just gentle nudges',
      'At the right moments',
    ],
  },
  {
    id: '2',
    icon: 'notifications-outline',
    title: 'Koan works through small, subtle moments',
    description: 'Most of Koan\'s magic happens through short, gentle notifications delivered at the right time. They\'re quiet, respectful, and designed to help you realign - not interrupt.',
    features: [
      { icon: 'volume-off', text: 'Silent by default' },
      { icon: 'time-outline', text: 'Delivered at the right time' },
      { icon: 'shield-outline', text: 'Private and respectful' },
    ],
    isNotificationStep: true,
  },
  {
    id: '3',
    icon: 'heart-outline',
    title: 'Choose Your Mode',
    description: 'Select how you want to experience Koan',
    isModeSelection: true,
  },
];

export default function OnboardingNew() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState('standard');
  const flatListRef = useRef<FlatList>(null);
  const hasNavigatedToLanding = useRef(false);

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
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
      
      if (status === 'granted') {
        Alert.alert(
          'Notifications Enabled', 
          'You can adjust notification settings anytime in Settings.',
          [{ text: 'OK', onPress: () => handleNext() }]
        );
      } else if (status === 'denied') {
        Alert.alert(
          'Notifications Disabled', 
          'You can enable them later in Settings.',
          [{ text: 'OK', onPress: () => handleNext() }]
        );
      } else {
        // User dismissed without choosing
        handleNext();
      }
    } catch (error) {
      console.error('Failed to request notifications:', error);
      handleNext();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const renderOnboardingCard = ({ item, index }: any) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <Ionicons name={item.icon} size={64} color="#A8D7F0" />
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>

          {/* Step 1: Features List */}
          {item.id === '1' && (
            <View style={styles.featureList}>
              {item.features.map((feature: string, idx: number) => (
                <View key={idx} style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#5FAD8E" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Step 2: Notification Features */}
          {item.isNotificationStep && (
            <>
              <View style={styles.notificationFeatures}>
                {item.features.map((feature: any, idx: number) => (
                  <View key={idx} style={styles.featureRow}>
                    <Ionicons name={feature.icon} size={20} color="#5FAD8E" />
                    <Text style={styles.featureRowText}>{feature.text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.enableButton}
                onPress={() => {
                  Alert.alert(
                    'Enable Notifications?',
                    'Koan sends gentle, silent notifications at the right moments. You can adjust settings anytime.',
                    [
                      { text: 'Not Now', style: 'cancel', onPress: () => handleNext() },
                      { text: 'Enable', onPress: requestNotifications }
                    ]
                  );
                }}
              >
                <Text style={styles.enableButtonText}>Enable Notifications</Text>
              </TouchableOpacity>

              <Text style={styles.subtleText}>You can choose how subtle they are.</Text>
            </>
          )}

          {/* Step 3: Mode Selection */}
          {item.isModeSelection && (
            <View style={styles.modeContainer}>
              <ModeCard
                icon="flame-outline"
                title="Standard Mode"
                description="Smart nudges based on patterns"
                selected={selectedMode === 'standard'}
                onPress={() => setSelectedMode('standard')}
              />
              <ModeCard
                icon="volume-low-outline"
                title="Whisper Mode"
                description="Ultra-rare, low-frequency nudges"
                selected={selectedMode === 'whisper'}
                onPress={() => setSelectedMode('whisper')}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        {ONBOARDING_DATA.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              index === currentIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Swipeable Cards */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_DATA}
        renderItem={renderOnboardingCard}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        scrollEventThrottle={16}
      />

      {/* Bottom Navigation */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextText}>
            {currentIndex === ONBOARDING_DATA.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Text style={styles.timeEstimate}>Takes about 30 seconds</Text>
    </SafeAreaView>
  );
}

function ModeCard({ icon, title, description, selected, onPress }: {
  icon: string;
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
      <Ionicons
        name={icon}
        size={32}
        color={selected ? '#5FAD8E' : '#3A3A3A'}
      />
      <Text style={[styles.modeTitle, selected && styles.modeTitleSelected]}>
        {title}
      </Text>
      <Text style={styles.modeDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E6E6E4',
  },
  progressDotActive: {
    backgroundColor: '#5FAD8E',
    width: 24,
  },
  card: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  cardContent: {
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
    width: '100%',
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
    alignItems: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#5FAD8E',
    fontWeight: '500',
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
  featureRowText: {
    fontSize: 15,
    color: '#3A3A3A',
    fontWeight: '500',
  },
  enableButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtleText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
  },
  modeContainer: {
    width: '100%',
    gap: 16,
  },
  modeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E6E6E4',
  },
  modeCardSelected: {
    borderColor: '#5FAD8E',
    backgroundColor: '#D9F7EB',
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3A',
    marginTop: 12,
    marginBottom: 4,
  },
  modeTitleSelected: {
    color: '#3A3A3A',
  },
  modeDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    marginTop: 16,
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
    marginBottom: 20,
  },
});
