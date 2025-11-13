import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Subtle pulsing animation for the dot
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.3,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.landingScroll}>
        {/* Hero - Section 1 */}
        <View style={styles.landingHero}>
          {/* Subtle animated dot with halo */}
          <View style={styles.dotContainer}>
            <Animated.View style={[styles.dotHalo, { 
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            }]} />
            <View style={styles.dotCenter} />
          </View>

          <Text style={styles.brandName}>Koan</Text>
          
          <Text style={styles.heroTitle}>
            Everything you need to know,{'\n'}you already know.
          </Text>
          
          <Text style={styles.heroSubtitle}>
            We just help you remember.
          </Text>
          
          <TouchableOpacity style={styles.ctaButton} onPress={onGetStarted}>
            <Text style={styles.ctaButtonText}>Start Free 7-Day Trial</Text>
          </TouchableOpacity>
          
          <Text style={styles.ctaSubtext}>No credit card required</Text>

          {/* Scroll indicator */}
          <View style={styles.scrollIndicator}>
            <Ionicons name="chevron-down" size={20} color="#3A3A3A" style={{ opacity: 0.4 }} />
          </View>
        </View>

        {/* What Koan Does - Section 2 */}
        <View style={styles.whatSection}>
          <Text style={styles.whatTitle}>Calm clarity for busy minds.</Text>
          <Text style={styles.whatSubtitle}>
            Subtle nudges at the right moment — no dashboards, no noise.
          </Text>
        </View>

        {/* How Koan Works - Section 2 continued */}
        <View style={styles.howSection}>
          <View style={styles.howCard}>
            <Text style={styles.howCardTitle}>Observes patterns</Text>
            <Text style={styles.howCardText}>
              Phone rhythm + your corporate tools (Outlook, Slack, Teams, Gmail, Calendar).
              Always metadata, never content.
            </Text>
          </View>

          <View style={styles.howCard}>
            <Text style={styles.howCardTitle}>Finds the right moment</Text>
            <Text style={styles.howCardText}>
              Nudges only appear when timing truly helps.
            </Text>
          </View>

          <View style={styles.howCard}>
            <Text style={styles.howCardTitle}>Keeps things simple</Text>
            <Text style={styles.howCardText}>
              Short, subtle reminders. Nothing more.
            </Text>
          </View>
        </View>

        {/* Pricing - Section 4 */}
        <View style={styles.pricingSection}>
          <Text style={styles.pricingAmount}>$9.99 / month after trial</Text>
          <Text style={styles.pricingCancel}>Cancel anytime.</Text>
          <Text style={styles.pricingPrivacy}>
            Koan analyzes metadata only — never message or email content.
          </Text>
        </View>

        {/* Footer - Section 5 */}
        <View style={styles.footer}>
          <Text style={styles.footerLink}>Terms</Text>
          <Text style={styles.footerDivider}>·</Text>
          <Text style={styles.footerLink}>Privacy</Text>
          <Text style={styles.footerDivider}>·</Text>
          <Text style={styles.footerLink}>Support</Text>
        </View>
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
  // Landing page styles - Minimal & Calm
  landingScroll: {
    paddingBottom: 40,
  },
  landingHero: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  dotContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  dotHalo: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#A8D7F0',
  },
  dotCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#A8D7F0',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 48,
  },
  ctaButton: {
    backgroundColor: '#A8D7F0',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  ctaSubtext: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.5,
    marginTop: 12,
  },
  whatSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    backgroundColor: '#FAFDFA',
  },
  whatTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  whatSubtitle: {
    fontSize: 15,
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 24,
  },
  howSection: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 48,
  },
  howCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 8,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  howCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 12,
  },
  howCardText: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    lineHeight: 21,
  },
  pricingSection: {
    alignItems: 'center',
    backgroundColor: '#D9F7EB',
    paddingVertical: 32,
    paddingHorizontal: 32,
    marginHorizontal: 32,
    marginTop: 24,
    marginBottom: 48,
    borderRadius: 8,
  },
  pricingAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
  },
  pricingCancel: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 24,
  },
  pricingPrivacy: {
    fontSize: 11,
    color: '#3A3A3A',
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  footerLink: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.5,
  },
  footerDivider: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.3,
  },
});
