import React, { useState } from 'react';
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

const COMING_SOON_STUB = () =>
  Alert.alert('Coming soon', 'RevenueCat integration coming soon.');

export default function SubscriptionScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — back button only, no title */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3A3A3A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.togglePill, plan === 'monthly' && styles.togglePillActive]}
            onPress={() => setPlan('monthly')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, plan === 'monthly' && styles.toggleTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.togglePill, plan === 'annual' && styles.togglePillActive]}
            onPress={() => setPlan('annual')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, plan === 'annual' && styles.toggleTextActive]}>
              Annual
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 33%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Price */}
        <View style={styles.priceBlock}>
          <Text style={styles.price}>
            {plan === 'annual' ? '$79.99' : '$9.99'}
          </Text>
          <Text style={styles.pricePeriod}>
            {plan === 'annual' ? '/year' : '/month'}
          </Text>
        </View>

        {plan === 'annual' && (
          <Text style={styles.annualSavings}>$6.67/month — save 33%</Text>
        )}

        {/* Trial badge */}
        <View style={styles.trialBadge}>
          <Text style={styles.trialBadgeText}>14-DAY FREE TRIAL</Text>
        </View>

        {/* Feature list */}
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

          {plan === 'annual' && (
            <View style={[styles.featureRow, styles.featureRowBorder]}>
              <View style={[styles.featureDot, styles.featureDotGreen]} />
              <Text style={[styles.featureText, styles.featureTextGreen]}>
                Best value · price locked for your first year
              </Text>
            </View>
          )}
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.subscribeButton} onPress={COMING_SOON_STUB}>
          <Text style={styles.subscribeButtonText}>
            {plan === 'annual' ? 'Start free trial — best value' : 'Start free trial'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.finePrint}>
          {plan === 'annual'
            ? 'Cancel anytime. Renews annually.'
            : 'Cancel anytime. No commitment.'}
        </Text>

        {/* Restore */}
        <TouchableOpacity style={styles.restoreLink} onPress={COMING_SOON_STUB}>
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

  // Plan toggle
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 36,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  togglePillActive: {
    backgroundColor: '#5FAD8E',
    borderColor: '#5FAD8E',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3A3A3A',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  saveBadge: {
    backgroundColor: '#D9F7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5FAD8E',
  },

  // Price
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  price: {
    fontFamily: 'Georgia',
    fontSize: 44,
    fontWeight: '400',
    color: '#3A3A3A',
    lineHeight: 50,
  },
  pricePeriod: {
    fontSize: 16,
    fontWeight: '400',
    color: '#3A3A3A',
    opacity: 0.55,
    marginBottom: 6,
    marginLeft: 4,
  },
  annualSavings: {
    fontSize: 13,
    color: '#5FAD8E',
    marginBottom: 16,
  },

  // Trial badge
  trialBadge: {
    backgroundColor: '#D9F7EB',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 28,
  },
  trialBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5FAD8E',
    letterSpacing: 0.5,
  },

  // Features
  featuresCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    marginBottom: 28,
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
  featureDotGreen: {
    backgroundColor: '#5FAD8E',
  },
  featureText: {
    fontSize: 15,
    color: '#3A3A3A',
    lineHeight: 22,
    flex: 1,
  },
  featureTextGreen: {
    color: '#5FAD8E',
  },

  // CTA
  subscribeButton: {
    width: '100%',
    backgroundColor: '#5FAD8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  finePrint: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.45,
    textAlign: 'center',
    marginBottom: 28,
  },

  // Restore
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
