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
import { useRouter, Redirect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../services/storage';

// Login Screen with Koan Branding
function LoginScreen({ onSwitchToSignup }: any) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in to Koan',
        fallbackLabel: 'Use password',
      });

      if (result.success) {
        const savedEmail = await SecureStore.getItemAsync('biometric_email');
        const savedPassword = await SecureStore.getItemAsync('biometric_password');
        
        if (savedEmail && savedPassword) {
          setLoading(true);
          await login(savedEmail, savedPassword);
          const onboardingComplete = await storage.isOnboardingComplete();
          if (onboardingComplete) {
            router.replace('/(tabs)');
          } else {
            router.replace('/onboarding');
          }
        } else {
          Alert.alert('No Saved Credentials', 'Please log in with email and password first');
        }
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      
      // Save credentials for biometric login (only on successful login)
      if (biometricAvailable) {
        await SecureStore.setItemAsync('biometric_email', email);
        await SecureStore.setItemAsync('biometric_password', password);
      }
      
      // Check if onboarding is complete
      const onboardingComplete = await storage.isOnboardingComplete();
      if (onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
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
          {/* Logo / Brand Mark */}
          <View style={styles.logoContainer}>
            <View style={styles.logoSymbol}>
              <View style={styles.logoDot} />
            </View>
            <Text style={styles.brandName}>Koan</Text>
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.tagline}>Everything you need to know, you already know.</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#3A3A3A" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#3A3A3A80"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#3A3A3A" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#3A3A3A80"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#3A3A3A" />
            ) : (
              <Text style={styles.primaryButtonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {biometricAvailable && (
            <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin} disabled={loading}>
              <Ionicons name="finger-print" size={24} color="#A8D7F0" />
              <Text style={styles.biometricText}>Use Face ID / Touch ID</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onSwitchToSignup} style={styles.linkButton}>
            <Text style={styles.linkText}>New to Koan? Create account</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ScrollView>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

// Signup Screen with Koan Branding
function SignupScreen({ onSwitchToLogin }: any) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Required', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name);
      // After signup, always go to onboarding
      router.replace('/onboarding');
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
          {/* Logo / Brand Mark */}
          <View style={styles.logoContainer}>
            <View style={styles.logoSymbol}>
              <View style={styles.logoDot} />
            </View>
            <Text style={styles.brandName}>Koan</Text>
          </View>

          <Text style={styles.title}>Let's begin your journey toward clarity</Text>
          <Text style={styles.tagline}>7-day free trial • Cancel anytime</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#3A3A3A" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#3A3A3A80"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#3A3A3A" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#3A3A3A80"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#3A3A3A" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#3A3A3A80"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#3A3A3A" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Free Trial</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onSwitchToLogin} style={styles.linkButton}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ScrollView>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

// Landing Page Screen
function LandingPageScreen({ onGetStarted }: any) {
  const router = useRouter();
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.landingScroll}>
        {/* Hero */}
        <View style={styles.landingHero}>
          <View style={styles.logoSymbol}>
            <View style={styles.logoDot} />
          </View>
          <Text style={styles.brandName}>Koan</Text>
          <Text style={styles.landingTitle}>
            Everything you need to know,{'\n'}you already know.
          </Text>
          <Text style={styles.landingSubtitle}>We just help you remember.</Text>
          
          <TouchableOpacity style={styles.primaryButton} onPress={onGetStarted}>
            <Text style={styles.primaryButtonText}>Start Free 7-Day Trial</Text>
            <Ionicons name="arrow-forward" size={18} color="#3A3A3A" />
          </TouchableOpacity>
          
          <Text style={styles.trialNote}>No credit card required</Text>
        </View>

        {/* Value Props */}
        <View style={styles.landingFeatures}>
          <Text style={styles.landingFeaturesTitle}>
            Calm clarity. Subtle intelligence. Zero noise.
          </Text>
          
          <View style={styles.featureRow}>
            <Ionicons name="notifications-off-outline" size={24} color="#A8D7F0" />
            <Text style={styles.featureText}>No constant pings</Text>
          </View>
          
          <View style={styles.featureRow}>
            <Ionicons name="bar-chart-outline" size={24} color="#A8D7F0" />
            <Text style={styles.featureText}>No tracking dashboards</Text>
          </View>
          
          <View style={styles.featureRow}>
            <Ionicons name="trophy-outline" size={24} color="#A8D7F0" />
            <Text style={styles.featureText}>No gamification</Text>
          </View>
          
          <View style={styles.featureRow}>
            <Ionicons name="sparkles" size={24} color="#A8D7F0" />
            <Text style={styles.featureText}>Just gentle course-corrections</Text>
          </View>
        </View>

        {/* Pricing */}
        <View style={styles.landingPricing}>
          <Text style={styles.pricingAmount}>$9.99</Text>
          <Text style={styles.pricingPeriod}>per month after trial</Text>
        </View>

        {/* Footer */}
        <Text style={styles.landingFooter}>
          For corporate professionals who are overloaded by dashboards, notifications, and metrics.
        </Text>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

// Main App Router
export default function Index() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState<boolean | null>(null); // null = landing, true = login, false = signup
  const [isRedirecting, setIsRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuthAndRedirect();
  }, [user, loading]);

  const checkAuthAndRedirect = async () => {
    if (!loading && user && !isRedirecting) {
      setIsRedirecting(true);
      // Add a small delay to prevent flash
      await new Promise(resolve => setTimeout(resolve, 100));
      const onboardingComplete = await storage.isOnboardingComplete();
      if (onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }
  };

  if (loading || isRedirecting) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoSymbol}>
          <View style={styles.logoDot} />
        </View>
        <ActivityIndicator size="large" color="#A8D7F0" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (user) {
    // Still redirecting, show loading
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoSymbol}>
          <View style={styles.logoDot} />
        </View>
        <ActivityIndicator size="large" color="#A8D7F0" style={{ marginTop: 20 }} />
      </View>
    );
  }

  // Show landing page, login, or signup
  if (showLogin === null) {
    // Show landing page
    return <LandingPageScreen onGetStarted={() => setShowLogin(false)} />;
  }

  return showLogin ? (
    <LoginScreen onSwitchToSignup={() => setShowLogin(false)} onBack={() => setShowLogin(null)} />
  ) : (
    <SignupScreen onSwitchToLogin={() => setShowLogin(true)} onBack={() => setShowLogin(null)} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoSymbol: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D9F7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#A8D7F0',
  },
  brandName: {
    fontSize: 32,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: '#3A3A3A',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#A8D7F0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#3A3A3A',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#3A3A3A',
    opacity: 0.7,
    fontSize: 14,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9F7EB',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  biometricText: {
    color: '#3A3A3A',
    fontSize: 15,
    fontWeight: '600',
  },
  // Landing page styles
  landingScroll: {
    paddingBottom: 40,
  },
  landingHero: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  landingTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  landingSubtitle: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
  },
  landingFeatures: {
    paddingHorizontal: 32,
    marginBottom: 40,
  },
  landingFeaturesTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#3A3A3A',
  },
  landingPricing: {
    alignItems: 'center',
    backgroundColor: '#D9F7EB',
    paddingVertical: 24,
    marginHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
  },
  pricingAmount: {
    fontSize: 40,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  pricingPeriod: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  landingFooter: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
