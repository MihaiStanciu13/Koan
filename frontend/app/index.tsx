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
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../services/storage';

// Login Screen with Koan Branding
function LoginScreen({ onSwitchToSignup }: any) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
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

          <Text style={styles.title}>Begin Your Practice</Text>
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

// Main App Router
export default function Index() {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(true);
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

  return showLogin ? (
    <LoginScreen onSwitchToSignup={() => setShowLogin(false)} />
  ) : (
    <SignupScreen onSwitchToLogin={() => setShowLogin(true)} />
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
});
