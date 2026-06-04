import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LearnMoreScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <Text style={styles.headerBrand}>Koan</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeButton}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Section 1: Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>
            Everything you need to know,{' '}
            <Text style={styles.heroTitleItalic}>you already know.</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            Subtle nudges when they matter. Silence when they don't. No dashboards, no streaks, no noise.
          </Text>
        </View>

        {/* Section 2: How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Koan watches quietly</Text>
              <Text style={styles.stepBody}>Sleep, movement, recovery, meeting density. Nothing personal.</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Patterns emerge</Text>
              <Text style={styles.stepBody}>After a few days your rhythm becomes clear — when you focus, when you drift.</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>A nudge arrives</Text>
              <Text style={styles.stepBody}>Short. Calm. At exactly the right moment. Then silence again.</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>A weekly reflection</Text>
              <Text style={styles.stepBody}>Every Sunday, Koan surfaces what it noticed — not as charts or scores, but as a single quiet observation.</Text>
            </View>
          </View>
        </View>

        {/* Section 3: Why Koan */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHY KOAN</Text>
          
          <View style={styles.comparisonGrid}>
            {/* Other Apps Column */}
            <View style={styles.comparisonColumnLeft}>
              <Text style={styles.columnTitle}>OTHER APPS</Text>
              
              <View style={[styles.comparisonRow, styles.comparisonRowFirst]}>
                <View style={styles.iconCircleGray}>
                  <Text style={styles.iconTextGray}>✕</Text>
                </View>
                <Text style={styles.comparisonText}>Dashboards you stop checking</Text>
              </View>

              <View style={styles.comparisonRow}>
                <View style={styles.iconCircleGray}>
                  <Text style={styles.iconTextGray}>✕</Text>
                </View>
                <Text style={styles.comparisonText}>Streaks that punish a missed day</Text>
              </View>

              <View style={styles.comparisonRow}>
                <View style={styles.iconCircleGray}>
                  <Text style={styles.iconTextGray}>✕</Text>
                </View>
                <Text style={styles.comparisonText}>Pings that interrupt your focus</Text>
              </View>
            </View>

            {/* Koan Column */}
            <View style={styles.comparisonColumnRight}>
              <Text style={[styles.columnTitle, styles.columnTitleGreen]}>KOAN</Text>
              
              <View style={[styles.comparisonRow, styles.comparisonRowFirst]}>
                <View style={styles.iconCircleGreen}>
                  <Text style={styles.iconTextGreen}>✓</Text>
                </View>
                <Text style={styles.comparisonText}>One sentence, once a week</Text>
              </View>

              <View style={styles.comparisonRow}>
                <View style={styles.iconCircleGreen}>
                  <Text style={styles.iconTextGreen}>✓</Text>
                </View>
                <Text style={styles.comparisonText}>No gamification, ever</Text>
              </View>

              <View style={styles.comparisonRow}>
                <View style={styles.iconCircleGreen}>
                  <Text style={styles.iconTextGreen}>✓</Text>
                </View>
                <Text style={styles.comparisonText}>Rare, well-timed nudges only</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 4: Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRICING</Text>
          
          <View style={styles.pricingCard}>
            <Text style={styles.price}>$9.99</Text>
            <Text style={styles.period}>per month</Text>
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>30-DAY FREE TRIAL</Text>
            </View>

            <View style={[styles.featureRow, styles.featureRowFirst]}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>AI nudges based on your patterns</Text>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>Anchor actions with daily reminders</Text>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>Weekly behavioral insight</Text>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>Cancel anytime</Text>
            </View>
          </View>
        </View>

        {/* Bottom padding for scroll */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed Footer */}
      <View style={styles.footer}>
        <View style={styles.footerGradient} />
        <View style={styles.footerContent}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => router.push('/?auth=signup')}
          >
            <Text style={styles.primaryButtonText}>Start free trial</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => router.push('/?auth=login')}>
            <Text style={styles.secondaryButton}>Already have an account? Sign in</Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E4',
  },
  headerBrand: {
    fontFamily: 'Georgia',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.3,
    color: '#3A3A3A',
  },
  closeButton: {
    fontSize: 13,
    color: 'rgba(58,58,58,0.55)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 100,
  },
  heroSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E4',
    marginBottom: 16,
  },
  heroTitle: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 27,
    marginBottom: 10,
    color: '#3A3A3A',
  },
  heroTitleItalic: {
    fontStyle: 'italic',
    color: '#5FAD8E',
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#5FAD8E',
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#5FAD8E',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 2,
  },
  stepBody: {
    fontSize: 11.5,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 18,
  },
  comparisonGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  comparisonColumnLeft: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(58,58,58,0.03)',
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  comparisonColumnRight: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#D9F7EB',
    borderWidth: 1,
    borderColor: 'rgba(95,173,142,0.25)',
  },
  columnTitle: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 12,
  },
  columnTitleGreen: {
    color: '#5FAD8E',
    opacity: 1,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(58,58,58,0.06)',
  },
  comparisonRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  iconCircleGray: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: 'rgba(58,58,58,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTextGray: {
    fontSize: 9,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  iconCircleGreen: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: 'rgba(95,173,142,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTextGreen: {
    fontSize: 9,
    color: '#5FAD8E',
  },
  comparisonText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '300',
    color: '#3A3A3A',
    lineHeight: 16,
  },
  pricingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#5FAD8E',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  price: {
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '400',
    color: '#3A3A3A',
  },
  period: {
    fontSize: 12,
    fontWeight: '300',
    color: '#3A3A3A',
    opacity: 0.7,
    marginBottom: 10,
  },
  trialBadge: {
    backgroundColor: '#D9F7EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 14,
  },
  trialBadgeText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#5FAD8E',
  },
  featureRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E4',
    alignItems: 'center',
  },
  featureRowFirst: {
    borderTopWidth: 0,
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#5FAD8E',
  },
  featureText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
    textAlign: 'left',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerGradient: {
    height: 40,
    backgroundColor: 'transparent',
  },
  footerContent: {
    backgroundColor: '#FAFDFA',
    padding: 22,
    paddingTop: 10,
    paddingBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButtonText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  secondaryButton: {
    fontSize: 12,
    fontWeight: '300',
    color: 'rgba(58,58,58,0.55)',
    textAlign: 'center',
  },
});
