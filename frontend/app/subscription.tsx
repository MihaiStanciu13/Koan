import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Purchases, { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI, { CUSTOMER_CENTER_RESULT } from 'react-native-purchases-ui';
import { subscriptionAPI } from '../services/api';

const ENTITLEMENT_ID = 'Koan Premium';

const FEATURES = [
  'AI nudges based on your patterns',
  'Anchor actions with daily reminders',
  'Weekly behavioral insight',
  'Cancel anytime',
];

type Plan = 'monthly' | 'yearly' | 'lifetime';

export default function SubscriptionScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>('yearly');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // configure must be called before any other Purchases method
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';
    if (apiKey) {
      Purchases.configure({ apiKey });
    }
    // Check existing entitlement and fetch offerings in parallel
    Promise.all([checkEntitlement(), fetchOfferings()]);
  }, []);

  const checkEntitlement = async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const isPremiumActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      setIsPremium(isPremiumActive);
    } catch {
      // Non-fatal: proceed without entitlement info
    }
  };

  const fetchOfferings = async () => {
    setLoadingOfferings(true);
    setError(null);
    try {
      const offerings = await Purchases.getOfferings();
      setOffering(offerings.current);
      // Default plan selection: yearly → monthly → lifetime
      if (!offerings.current?.annual) {
        if (offerings.current?.monthly) {
          setPlan('monthly');
        } else if (offerings.current?.lifetime) {
          setPlan('lifetime');
        }
      }
    } catch (e: any) {
      setError('Could not load subscription options. Please try again.');
    } finally {
      setLoadingOfferings(false);
    }
  };

  const monthlyPackage = offering?.monthly ?? null;
  const yearlyPackage = offering?.annual ?? null;
  const lifetimePackage = offering?.lifetime ?? null;

  const selectedPackage: PurchasesPackage | null =
    plan === 'yearly' ? yearlyPackage :
    plan === 'lifetime' ? lifetimePackage :
    monthlyPackage;

  const handleSubscribe = async () => {
    if (!selectedPackage) return;
    setPurchasing(true);
    setError(null);
    try {
      await Purchases.purchasePackage(selectedPackage);
      // Verify entitlement is now active
      const customerInfo = await Purchases.getCustomerInfo();
      const nowPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      if (nowPremium) {
        await subscriptionAPI.activate();
        setIsPremium(true);
      }
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
      const nowPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      if (nowPremium) {
        await subscriptionAPI.activate();
        setIsPremium(true);
      } else {
        setError('No previous purchases found for this account.');
      }
    } catch (e: any) {
      setError(e.message ?? 'Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleManageSubscription = async () => {
    setManagingSubscription(true);
    try {
      await RevenueCatUI.presentCustomerCenter();
      // Re-check entitlement in case the user cancelled or downgraded
      await checkEntitlement();
    } catch {
      // Non-fatal: Customer Center dismissed or unavailable
    } finally {
      setManagingSubscription(false);
    }
  };

  // Per-month breakdown for yearly plan
  const yearlyPerMonth = (() => {
    const price = yearlyPackage?.product.price;
    if (!price) return null;
    const perMonth = price / 12;
    const symbol = yearlyPackage?.product.currencyCode === 'USD' ? '$' : '';
    return `${symbol}${perMonth.toFixed(2)}/month`;
  })();

  const savingsPct = (() => {
    const yearly = yearlyPackage?.product.price;
    const monthly = monthlyPackage?.product.price;
    if (!yearly || !monthly) return null;
    const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
    return pct > 0 ? pct : null;
  })();

  const selectedPriceString = selectedPackage?.product.priceString ?? '—';
  const selectedPeriodLabel =
    plan === 'yearly' ? '/year' :
    plan === 'lifetime' ? ' one-time' :
    '/month';

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
      ) : isPremium ? (
        /* ── Subscribed state ───────────────────────────────────────── */
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.subscribedContainer}>
            <Text style={styles.subscribedTitle}>You're subscribed</Text>
            <Text style={styles.subscribedSubtitle}>
              {'Koan Premium is active on your account.'}
            </Text>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Manage subscription — Customer Center */}
          <TouchableOpacity
            style={[styles.subscribeButton, managingSubscription && styles.buttonDisabled]}
            onPress={handleManageSubscription}
            activeOpacity={0.85}
            disabled={managingSubscription}
          >
            {managingSubscription ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.subscribeButtonText}>Manage subscription</Text>
            )}
          </TouchableOpacity>

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
      ) : (
        /* ── Purchase state ─────────────────────────────────────────── */
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

            {yearlyPackage && (
              <TouchableOpacity
                style={[styles.togglePill, plan === 'yearly' && styles.togglePillActive]}
                onPress={() => setPlan('yearly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, plan === 'yearly' && styles.toggleTextActive]}>
                  Yearly
                </Text>
                {savingsPct != null && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>Save {savingsPct}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {lifetimePackage && (
              <TouchableOpacity
                style={[styles.togglePill, plan === 'lifetime' && styles.togglePillActive]}
                onPress={() => setPlan('lifetime')}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, plan === 'lifetime' && styles.toggleTextActive]}>
                  Lifetime
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{selectedPriceString}</Text>
            <Text style={styles.pricePeriod}>{selectedPeriodLabel}</Text>
          </View>

          {plan === 'yearly' && yearlyPerMonth != null && (
            <Text style={styles.annualSavings}>
              {yearlyPerMonth}
              {savingsPct != null ? ` — save ${savingsPct}%` : ''}
            </Text>
          )}

          {/* Trial badge */}
          {plan !== 'lifetime' && (
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>14-DAY FREE TRIAL</Text>
            </View>
          )}

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

            {plan === 'yearly' && (
              <View style={[styles.featureRow, styles.featureRowBorder]}>
                <View style={[styles.featureDot, styles.featureDotGreen]} />
                <Text style={[styles.featureText, styles.featureTextGreen]}>
                  Best value · price locked for your first year
                </Text>
              </View>
            )}

            {plan === 'lifetime' && (
              <View style={[styles.featureRow, styles.featureRowBorder]}>
                <View style={[styles.featureDot, styles.featureDotGreen]} />
                <Text style={[styles.featureText, styles.featureTextGreen]}>
                  Pay once, use forever
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
                {plan === 'yearly'
                  ? 'Start free trial — best value'
                  : plan === 'lifetime'
                  ? 'Get lifetime access'
                  : 'Start free trial'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.finePrint}>
            {plan === 'yearly'
              ? 'Cancel anytime. Renews annually.'
              : plan === 'lifetime'
              ? 'One-time purchase. No recurring charges.'
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

  // Subscribed state
  subscribedContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  subscribedTitle: {
    fontFamily: 'Georgia',
    fontSize: 26,
    color: '#5FAD8E',
    marginBottom: 12,
    textAlign: 'center',
  },
  subscribedSubtitle: {
    fontFamily: 'Georgia',
    fontSize: 14,
    color: '#5a7868',
    lineHeight: 22,
    textAlign: 'center',
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
