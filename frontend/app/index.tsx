import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { behaviorAPI, nudgeAPI, patternsAPI, preferencesAPI, subscriptionAPI } from '../services/api';
import { storage } from '../services/storage';

// Auth Screens
function LoginScreen({ onSwitchToSignup, onLogin }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      onLogin();
    } catch (error: any) {
      Alert.alert('Login Failed', error.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.authContainer}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Subtle behavioral nudges for corporate life</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onSwitchToSignup} style={styles.linkButton}>
            <Text style={styles.linkText}>Don't have an account? Sign up</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SignupScreen({ onSwitchToLogin, onSignup }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name);
      onSignup();
    } catch (error: any) {
      Alert.alert('Signup Failed', error.response?.data?.detail || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.authContainer}>
          <Text style={styles.title}>Start Your Journey</Text>
          <Text style={styles.subtitle}>7-day free trial • No metrics • Just nudges</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#888"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Free Trial</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onSwitchToLogin} style={styles.linkButton}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Main Dashboard
function DashboardScreen() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [anchorAction, setAnchorAction] = useState('close one loop');
  const [weeklyNarrative, setWeeklyNarrative] = useState('');
  const [trialDays, setTrialDays] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prefs, patterns, subscription] = await Promise.all([
        preferencesAPI.get(),
        patternsAPI.getWeekly(),
        subscriptionAPI.getStatus(),
      ]);

      setAnchorAction(prefs.anchor_action || 'close one loop');
      setWeeklyNarrative(patterns.narrative || 'Building your pattern baseline...');
      setTrialDays(subscription.trial_days_remaining || 0);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleAnchorAction = async () => {
    setLoading(true);
    try {
      await nudgeAPI.triggerAnchor();
      Alert.alert('Nudge Sent', 'Your anchor action reminder has been created');
    } catch (error) {
      Alert.alert('Error', 'Could not trigger nudge');
    } finally {
      setLoading(false);
    }
  };

  const simulatePhoneBehavior = async () => {
    try {
      await behaviorAPI.recordPhoneBehavior('pickup', { source: 'manual_test' });
      Alert.alert('Recorded', 'Phone behavior logged');
    } catch (error) {
      console.error('Failed to record behavior:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.dashboardContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
            <TouchableOpacity onPress={logout}>
              <Ionicons name="log-out-outline" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Trial Status */}
          {user?.subscription_status === 'trial' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Free Trial</Text>
              <Text style={styles.cardText}>{trialDays} days remaining</Text>
            </View>
          )}

          {/* Anchor Action */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Anchor Action</Text>
            <Text style={styles.cardSubtitle}>{anchorAction}</Text>
            <TouchableOpacity style={styles.anchorButton} onPress={handleAnchorAction} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#5B9FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#5B9FFF" />
                  <Text style={styles.anchorButtonText}>Do It Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Weekly Narrative */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This Week's Insight</Text>
            <Text style={styles.narrativeText}>{weeklyNarrative}</Text>
          </View>

          {/* Test Buttons */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Test Features</Text>
            <TouchableOpacity style={styles.testButton} onPress={simulatePhoneBehavior}>
              <Text style={styles.testButtonText}>Simulate Phone Pickup</Text>
            </TouchableOpacity>
          </View>

          {/* Philosophy */}
          <View style={styles.philosophyCard}>
            <Text style={styles.philosophyText}>
              No dashboards. No metrics. No gamification. Just subtle, well-timed nudges based on your
              actual patterns.
            </Text>
          </View>
        </View>
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

// Main App
function AppContent() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    checkOnboarding();
  }, [user]);

  const checkOnboarding = async () => {
    if (user) {
      const complete = await storage.isOnboardingComplete();
      setOnboardingComplete(complete);
      if (!complete) {
        // Auto-complete onboarding for MVP
        await storage.setOnboardingComplete();
        setOnboardingComplete(true);
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#5B9FFF" />
      </View>
    );
  }

  if (!user) {
    return showLogin ? (
      <LoginScreen
        onSwitchToSignup={() => setShowLogin(false)}
        onLogin={() => setOnboardingComplete(false)}
      />
    ) : (
      <SignupScreen
        onSwitchToLogin={() => setShowLogin(true)}
        onSignup={() => setOnboardingComplete(false)}
      />
    );
  }

  return <DashboardScreen />;
}

export default function Index() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  authContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  dashboardContainer: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 40,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#5B9FFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 20,
    color: '#5B9FFF',
    marginBottom: 16,
  },
  cardText: {
    fontSize: 16,
    color: '#888',
  },
  anchorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1a2e',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5B9FFF',
  },
  anchorButtonText: {
    color: '#5B9FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  narrativeText: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 24,
  },
  testButton: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  testButtonText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  philosophyCard: {
    backgroundColor: '#0f1a2e',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1a3a5f',
  },
  philosophyText: {
    fontSize: 14,
    color: '#7a9fc8',
    lineHeight: 22,
    textAlign: 'center',
  },
});
