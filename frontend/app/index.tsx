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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../services/storage';
import StoryScreen from './story';

// Login Screen with Koan Branding
function LoginScreen({ onSwitchToSignup, onBack }: any) {
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
          // Mark onboarding complete before login to avoid race condition
          await storage.setOnboardingComplete();
          await login(savedEmail, savedPassword);
          // Navigation handled by useEffect in Index
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
      // Mark onboarding complete BEFORE login to avoid race condition
      await storage.setOnboardingComplete();

      await login(email, password);

      // Save credentials for biometric login (only on successful login)
      if (biometricAvailable) {
        await SecureStore.setItemAsync('biometric_email', email);
        await SecureStore.setItemAsync('biometric_password', password);
      }
      // Navigation is handled by useEffect in Index when user state changes
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
          {/* Back button */}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          )}

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
              <Ionicons name="finger-print" size={24} color="#5FAD8E" />
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
function SignupScreen({ onSwitchToLogin, onBack }: any) {
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
      // Navigation will be handled by useEffect in main component
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
          {/* Back button */}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          )}

          {/* Logo / Brand Mark */}
          <View style={styles.logoContainer}>
            <View style={styles.logoSymbol}>
              <View style={styles.logoDot} />
            </View>
            <Text style={styles.brandName}>Koan</Text>
          </View>

          <Text style={styles.title}>Begin your practice</Text>
          <Text style={styles.tagline}>14 days free, then $9.99/month</Text>

          {/* Trial note banner */}
          <View style={styles.trialBanner}>
            <View style={styles.trialDot} />
            <Text style={styles.trialBannerText}>14-day free trial · No credit card required</Text>
          </View>

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

// Landing Page Screen — minimal, for returning logged-out users
function LandingPageScreen({ onGetStarted, onSignIn }: any) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 3000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.6, duration: 3000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.3, duration: 3000, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Koan brand — top left */}
      <View style={styles.landingHeader}>
        <Text style={styles.landingBrandWord}>Koan</Text>
      </View>

      {/* Centered hero content */}
      <View style={styles.landingHero}>
        {/* Animated dot */}
        <View style={styles.dotContainer}>
          <Animated.View
            style={[
              styles.dotHalo,
              { transform: [{ scale: pulseAnim }], opacity: opacityAnim },
            ]}
          />
          <View style={styles.dotCenter} />
        </View>

        <Text style={styles.heroTitle}>
          Everything you need to know,{'\n'}you already know.
        </Text>

        <Text style={styles.heroSubtitle}>We just help you remember.</Text>

        {/* Three pills */}
        <View style={styles.pillsContainer}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>No dashboards</Text>
          </View>
          <Text style={styles.pillDivider}>·</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>No streaks</Text>
          </View>
          <Text style={styles.pillDivider}>·</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>No noise</Text>
          </View>
        </View>

        {/* CTAs */}
        <TouchableOpacity style={styles.ctaButton} onPress={onGetStarted}>
          <Text style={styles.ctaButtonText}>Start free trial</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSignIn} style={styles.linkButton}>
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

// Main App Router
export default function Index() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState<boolean | null>(null); // null = landing, true = login, false = signup
  const [showStory, setShowStory] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams<{ auth?: string; showStory?: string }>();
  const previousUserRef = useRef(user);
  const splashChecked = useRef(false);

  // Handle URL query params (e.g., from learn-more screen /?auth=login or /?auth=signup)
  useEffect(() => {
    if (params.auth === 'login') {
      setShowLogin(true);
    } else if (params.auth === 'signup') {
      setShowLogin(false);
    } else if (params.showStory === '1') {
      setShowStory(true);
    }
  }, [params.auth, params.showStory]);

  // Route unauthenticated users: intro on first open, /landing for returning logged-out users
  useEffect(() => {
    if (!loading && !user && !splashChecked.current) {
      splashChecked.current = true;
      storage.hasSplashSeen().then((seen) => {
        if (!seen) {
          storage.setSplashSeen();
          router.push('/intro');
        } else {
          router.replace('/landing');
        }
      });
    }
  }, [loading, user]);

  // Handle navigation when user state changes
  useEffect(() => {
    if (!loading) {
      if (user) {
        checkOnboardingAndNavigate();
      } else if (previousUserRef.current !== null && user === null) {
        // User just logged out — reset all screen state to landing page
        setShowStory(false);
        setShowLogin(null);
        setCheckingOnboarding(false);
      }
    }
    previousUserRef.current = user;
  }, [user, loading]);

  const checkOnboardingAndNavigate = async () => {
    if (checkingOnboarding) return;

    setCheckingOnboarding(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const onboardingComplete = await storage.isOnboardingComplete();

      if (onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    } catch (error) {
      console.error('Navigation error:', error);
      router.replace('/onboarding');
    } finally {
      setCheckingOnboarding(false);
    }
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoSymbol}>
          <View style={styles.logoDot} />
        </View>
        <ActivityIndicator size="large" color="#5FAD8E" style={{ marginTop: 20 }} />
      </View>
    );
  }

  // User is logged in — show loading while navigating
  if (user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoSymbol}>
          <View style={styles.logoDot} />
        </View>
        <ActivityIndicator size="large" color="#5FAD8E" style={{ marginTop: 20 }} />
      </View>
    );
  }

  // First-time user — show story after intro
  if (showStory) {
    return (
      <StoryScreen
        onContinue={() => {
          setShowStory(false);
          setShowLogin(false);
        }}
      />
    );
  }

  // User is NOT logged in — show landing/login/signup
  if (showLogin === null) {
    return (
      <LandingPageScreen
        onGetStarted={() => setShowLogin(false)}
        onSignIn={() => setShowLogin(true)}
      />
    );
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
    backgroundColor: '#5FAD8E',
  },
  brandName: {
    fontSize: 32,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 48,
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
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
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
  backButton: {
    position: 'absolute',
    top: 20,
    left: 22,
    zIndex: 10,
  },
  backButtonText: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D9F7EB',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  trialDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#5FAD8E',
  },
  trialBannerText: {
    fontSize: 11,
    fontWeight: '300',
    color: '#3A3A3A',
  },
  // Landing page
  landingHeader: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  landingBrandWord: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '400',
    color: '#3A3A3A',
    letterSpacing: 0.3,
  },
  landingHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  dotContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dotHalo: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5FAD8E',
  },
  dotCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5FAD8E',
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
    marginBottom: 24,
  },
  pillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 11,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  pillDivider: {
    fontSize: 11,
    color: '#3A3A3A',
    opacity: 0.4,
  },
  ctaButton: {
    backgroundColor: '#5FAD8E',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
