import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

export default function LandingPage() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <View style={styles.logoSymbol}>
              <View style={styles.logoDot} />
            </View>
          </View>
          
          <Text style={styles.brandName}>Koan</Text>
          
          <Text style={styles.heroTitle}>
            Everything you need to know,{'\n'}you already know.
          </Text>
          
          <Text style={styles.heroSubtitle}>
            We just help you remember.
          </Text>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.ctaText}>Start Free 14-Day Trial</Text>
            <Ionicons name="arrow-forward" size={18} color="#3A3A3A" />
          </TouchableOpacity>

          <Text style={styles.trialNote}>No credit card required</Text>
        </View>

        {/* Value Proposition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calm clarity. Subtle intelligence. Zero noise.</Text>
          <Text style={styles.sectionDescription}>
            Koan delivers behavioral nudges when they matter—helping corporate professionals
            act on what they already know without dashboards, metrics, or motivational clichés.
          </Text>
        </View>

        {/* What You Get */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What You Get</Text>
          
          <FeatureCard
            icon="notifications-off-outline"
            title="No Constant Pings"
            description="Subtle, well-timed nudges. Not endless notifications."
          />
          
          <FeatureCard
            icon="bar-chart-outline"
            title="No Tracking Dashboards"
            description="We observe patterns, not metrics. No charts, no numbers."
          />
          
          <FeatureCard
            icon="trophy-outline"
            title="No Gamification"
            description="No points, badges, or streaks. Just gentle course-corrections."
          />
          
          <FeatureCard
            icon="bulb-outline"
            title="AI-Powered Intelligence"
            description="Smart nudges generated with context and timing that matters."
          />
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How It Works</Text>
          
          <StepCard
            number="1"
            title="We Learn Your Patterns"
            description="Phone pickups, app switches, meeting density, email spikes—lightweight signals only."
          />
          
          <StepCard
            number="2"
            title="We Detect What Matters"
            description="Context-switch fatigue, energy drift, late-night work, meeting recovery needs."
          />
          
          <StepCard
            number="3"
            title="We Nudge at the Right Moment"
            description="Brief, calm reminders: 'Return to focus.' 'Take a moment before switching tasks.'"
          />
        </View>

        {/* Workplace Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Connects With Your Work Tools</Text>
          <Text style={styles.sectionDescription}>
            Gmail • Outlook • Slack • Microsoft Teams • Google Calendar
          </Text>
          <Text style={styles.privacyNote}>
            🔒 We never read your messages or emails. Only high-level patterns.
          </Text>
        </View>

        {/* Micro-Modes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Adapts to Your Work Style</Text>
          
          <ModeCard
            title="Focus Mode"
            description="Minimal interruptions for deep work"
          />
          
          <ModeCard
            title="Meeting-Heavy"
            description="Recovery nudges between meetings"
          />
          
          <ModeCard
            title="Travel Mode"
            description="Ultra-rare, essential nudges only"
          />
          
          <ModeCard
            title="Whisper Mode"
            description="Maximum subtlety, lowest frequency"
          />
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Simple Pricing</Text>
          
          <View style={styles.pricingCard}>
            <Text style={styles.pricingAmount}>$9.99</Text>
            <Text style={styles.pricingPeriod}>per month</Text>
            <Text style={styles.pricingTrial}>7-day free trial</Text>
            <Text style={styles.pricingNote}>Cancel anytime. No questions asked.</Text>
          </View>
        </View>

        {/* Final CTA */}
        <View style={styles.finalCTA}>
          <Text style={styles.finalCTATitle}>Begin Your Practice</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.ctaText}>Start Free Trial</Text>
            <Ionicons name="arrow-forward" size={18} color="#3A3A3A" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Designed for corporate professionals who are overloaded by dashboards,
            notifications, and metrics.
          </Text>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function FeatureCard({ icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={24} color="#A8D7F0" />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
      </View>
    </View>
  );
}

function ModeCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.modeCard}>
      <View style={styles.modeDot} />
      <View style={styles.modeContent}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoSymbol: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#A8D7F0',
  },
  brandName: {
    fontSize: 40,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A8D7F0',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  trialNote: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.6,
    marginTop: 12,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 20,
  },
  sectionDescription: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 24,
    textAlign: 'center',
  },
  privacyNote: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 12,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 20,
  },
  stepCard: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#A8D7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 6,
  },
  stepDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 20,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E4',
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A8D7F0',
    marginRight: 16,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  pricingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#A8D7F0',
  },
  pricingAmount: {
    fontSize: 48,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  pricingPeriod: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.7,
    marginBottom: 16,
  },
  pricingTrial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#A8D7F0',
    marginBottom: 8,
  },
  pricingNote: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  finalCTA: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  finalCTATitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#D9F7EB',
  },
  footerText: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
});
