import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Purchases, { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { subscriptionAPI } from '../services/api';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

const FEATURES = [
  'AI nudges based on your patterns',
  'Anchor actions with daily reminders',
  'Weekly behavioral insight',
  'Cancel anytime',
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (REVENUECAT_API_KEY) {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    }
    fetchOfferings();
  }, []);

  const fetchOfferings = async () => {
    setLoadingOfferings(true);
    setError(null);
    try {
      const offerings = await Purchases.getOfferings();
      setOffering(offerings.current);
      // Default to annual if available, otherwise monthly
      if (!offerings.current?.annual && offerings.current?.monthly) {
        setPlan('monthly');
      }
    } catch (e: any) {
      setError('Could not load subscription options. Please try again.');
    } finally {
      setLoadingOfferings(false);
    }
  };

  const selectedPackage: PurchasesPackage | null | undefined =
    plan === 'annual' ? offering?.annual : offering?.monthly;

  const annualPackage = offering?.annual;
  const monthlyPackage = offering?.monthly;

  const handleSubscribe = async () => {
    if (!selectedPackage) return;
    setPurchasing(true);
    setError(null);
    try {
      await Purchases.purchasePackage(selectedPackage);
      // Notify backend to flip subscription_status → ACTIVE
      await subscriptionAPI.activate();
      router.replace('/(tabs)');
    } catch (e: any) {
      if (!e.userCancelled) {
        setError(e.message ?? 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;
      if (hasActive) {
        await subscriptionAPI.activate();
        router.replace('/(tabs)');
      } else {
        setError('No previous purchases found for this account.');
      }
    } catch (e: any) {
      setError(e.message ?? 'Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // Derive display strings from RevenueCat package, or fall back to placeholders
  const annualPriceString = annualPackage?.product.priceString ?? '—';
  const monthlyPriceString = monthlyPackage?.product.priceString ?? '—';

  const selectedPriceString = plan === 'annual' ? annualPriceString : monthlyPriceString;

  // Compute per-month equivalent for annual to show savings blurb
  const annualPerMonth = (() => {
    const price = annualPackage?.product.price;
    if (!price) return null;
    const perMonth = price / 12;
    const symbol = annualPackage?.product.currencyCode === 'USD' ? '$' : '';
    return `${symbol}${perMonth.toFixed(2)}/month`;
  })();

  const savingsPct = (() => {
    const annual = annualPackage?.product.price;
    const monthly = monthlyPackage?.product.price;
    if (!annual || !monthly) return null;
    const pct = Math.round((1 - annual / (monthly * 12)) * 100);
    return pct > 0 ? pct : null;
  })();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3A3A3A" />
        </TouchableOpacity>
      </View>

      {loadingOfferings ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5FAD8E" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Plan toggle */}
          <View style={styles.toggleRow}>
            {monthlyPackage && (
              <TouchableOpacity
                style={[styles.togglePill, plan === 'monthly' && styles.togglePillActive]}
                onPress={() => setPlan('monthly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, plan === 'monthly' && styles.toggleTextActive]}>
                  Monthly
                </Text>
              </TouchableOpacity>
            )}

            {annualPackage && (
              <TouchableOpacity
                style={[styles.togglePill, plan === 'annual' && styles.togglePillActive]}
                onPress={() => setPlan('annual')}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, plan === 'annual' && styles.toggleTextActive]}>
                  Annual
                </Text>
                {savingsPct != null && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>Save {savingsPct}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{selectedPriceString}</Text>
            <Text style={styles.pricePeriod}>{plan === 'annual' ? '/year' : '/month'}</Text>
          </View>

          {plan === 'annual' && annualPerMonth != null && (
            <Text style={styles.annualSavings}>
              {annualPerMonth}
              {savingsPct != null ? ` — save ${savingsPct}%` : ''}
            </Text>
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

          {/* Error message */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.subscribeButton, (purchasing || !selectedPackage) && styles.buttonDisabled]}
            onPress={handleSubscribe}
            activeOpacity={0.85}
            disabled={purchasing || !selectedPackage}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.subscribeButtonText}>
                {plan === 'annual' ? 'Start free trial — best value' : 'Start free trial'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.finePrint}>
            {plan === 'annual'
              ? 'Cancel anytime. Renews annually.'
              : 'Cancel anytime. No commitment.'}
          </Text>

          {/* Restore */}
          <TouchableOpacity
            style={styles.restoreLink}
            onPress={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color="#8aab98" />
            ) : (
              <Text style={styles.restoreLinkText}>Restore purchases</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Error
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    textAlign: 'center',
    marginBottom: 16,
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
  buttonDisabled: {
    opacity: 0.6,
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
    minHeight: 36,
    justifyContent: 'center',
  },
  restoreLinkText: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
  },
});
