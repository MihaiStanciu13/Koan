import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const FEATURES = [
  'AI nudges based on your patterns',
  'Anchor actions with daily reminders',
  'Weekly behavioral insight',
  'Cancel anytime',
];

export default function SubscriptionScreen() {
  const router = useRouter();

  const handleSubscribe = () => {
    Alert.alert('Coming soon', 'Subscription payments are coming soon.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3A3A3A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Upgrade to Koan</Text>

        <View style={styles.priceBlock}>
          <Text style={styles.price}>$9.99</Text>
          <Text style={styles.pricePeriod}>/month</Text>
        </View>

        <View style={styles.featuresCard}>
          {FEATURES.map((feature, idx) => (
            <View
              key={idx}
              style={[styles.featureRow, idx > 0 && styles.featureRowBorder]}
            >
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
          <Text style={styles.subscribeButtonText}>Subscribe</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreLink} onPress={handleSubscribe}>
          <Text style={styles.restoreLinkText}>Restore purchases</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '400',
    color: '#3A3A3A',
    textAlign: 'center',
    marginBottom: 32,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 36,
  },
  price: {
    fontSize: 52,
    fontWeight: '700',
    color: '#3A3A3A',
    lineHeight: 56,
  },
  pricePeriod: {
    fontSize: 18,
    fontWeight: '400',
    color: '#3A3A3A',
    opacity: 0.55,
    marginBottom: 8,
    marginLeft: 4,
  },
  featuresCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    marginBottom: 32,
    overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
  },
  featureRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0EE',
  },
  featureDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#5FAD8E',
    flexShrink: 0,
  },
  featureText: {
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 22,
  },
  subscribeButton: {
    width: '100%',
    backgroundColor: '#5FAD8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  restoreLink: {
    paddingVertical: 8,
  },
  restoreLinkText: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
  },
});
