import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../services/storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

// Required for expo-auth-session to close the browser on redirect
WebBrowser.maybeCompleteAuthSession();

// Google OAuth client ID — set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your .env file.
// Create credentials at console.cloud.google.com → APIs & Services → Credentials.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  'https://koan-production.up.railway.app';

// ── Icons ─────────────────────────────────────────────────────────────────────

function AppleIcon() {
  return (
    <Svg width={17} height={20} viewBox="0 0 24 28">
      <Path
        d="M20.23 22.2c-.95 1.42-1.96 2.81-3.5 2.84-1.53.03-2.02-.91-3.76-.91-1.75 0-2.29.88-3.74.94-1.5.06-2.63-1.5-3.6-2.9C3.05 19.14 1.5 14 3.53 10.5c1-1.74 2.78-2.84 4.72-2.87 1.47-.03 2.86 1 3.76 1 .9 0 2.58-1.22 4.35-1.04.74.03 2.83.3 4.17 2.27l-.1.07c-2.52 1.49-2.12 5.09.35 6.45-.58 1.4-1.21 2.74-2.55 3.82zM14.02 4c-.17-2.6 1.9-4.67 4.29-4.87.33 2.96-2.68 5.16-4.29 4.87z"
        fill="white"
      />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function OrDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { loginWithToken } = useAuth();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Google OAuth — expo-auth-session
  // EXPO_PUBLIC_GOOGLE_CLIENT_ID must be set in your .env file (see .env.example)
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  });

  // Check Apple Sign In availability on mount
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.authentication?.accessToken;
      if (accessToken) {
        exchangeGoogleToken(accessToken);
      } else {
        setGoogleLoading(false);
        Alert.alert('Google Sign In', 'Could not retrieve access token. Please try again.');
      }
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      setGoogleLoading(false);
    }
  }, [response]);

  const exchangeGoogleToken = async (accessToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Google sign in failed');
      }
      const data = await res.json();
      // Store JWT under 'auth_token' — same key used by the axios interceptor in services/api.ts
      await storage.setAuthToken(data.access_token);
      await loginWithToken(data.access_token, data.user);
    } catch (e: any) {
      Alert.alert('Google Sign In Failed', e.message ?? 'Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Not configured', 'Google Sign In is not configured yet. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your .env file.');
      return;
    }
    setGoogleLoading(true);
    await promptAsync();
    // loading state cleared in the response useEffect
  };

  const handleApple = async () => {
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;
      if (!identityToken) throw new Error('No identity token returned by Apple');

      const res = await fetch(`${API_URL}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity_token: identityToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Apple sign in failed');
      }
      const data = await res.json();
      // Store JWT under 'auth_token' — same key used by the axios interceptor in services/api.ts
      await storage.setAuthToken(data.access_token);
      await loginWithToken(data.access_token, data.user);
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign In Failed', e.message ?? 'Please try again.');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  // Email signup: navigates to index route (defined in _layout.tsx as "index") with auth=signup param
  const handleEmailSignup = () =>
    router.push({ pathname: '/', params: { auth: 'signup' } } as any);

  // Login: navigates to index route (defined in _layout.tsx as "index") with auth=login param
  const handleLogin = () =>
    router.push({ pathname: '/', params: { auth: 'login' } } as any);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Hero — brand block + headline + subline, vertically centered */}
        <View style={styles.heroSection}>
          <View style={styles.brand}>
            <Text style={styles.wordmark}>Koan</Text>
            <View style={styles.brandDot} />
          </View>

          {/* Headline */}
          <Text style={styles.headline}>
            {'Everything\nyou really need to know,\nyou already know.'}
          </Text>

          {/* Subline */}
          <Text style={styles.subline}>
            {'Create an account to start\nlistening with Koan.'}
          </Text>
        </View>

        {/* Apple button */}
        <TouchableOpacity
          style={[styles.appleButton, appleLoading && styles.buttonDisabled]}
          onPress={handleApple}
          activeOpacity={0.85}
          disabled={appleLoading}
        >
          <View style={styles.buttonIconLeft}>
            {appleLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <AppleIcon />
            )}
          </View>
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </TouchableOpacity>

        {/* Inline message when Apple Sign In is unavailable (Expo Go / simulator) */}
        {!appleAvailable && (
          <Text style={styles.appleUnavailableText}>
            Apple Sign In requires a development build
          </Text>
        )}

        <View style={styles.buttonGap} />

        {/* Google button */}
        <TouchableOpacity
          style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogle}
          activeOpacity={0.85}
          disabled={googleLoading || !request}
        >
          <View style={styles.buttonIconLeft}>
            {googleLoading ? (
              <ActivityIndicator size="small" color="#1a2e24" />
            ) : (
              <GoogleIcon />
            )}
          </View>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Divider */}
        <OrDivider />

        {/* Email signup button */}
        <TouchableOpacity style={styles.emailButton} onPress={handleEmailSignup} activeOpacity={0.8}>
          <Text style={styles.emailButtonText}>Create account with email</Text>
        </TouchableOpacity>

        {/* Log in link — anchors to bottom via marginTop auto on loginLink style */}
        <TouchableOpacity style={styles.loginLink} onPress={handleLogin}>
          <Text style={styles.loginLinkText}>
            Already have an account?{' '}
            <Text style={styles.loginLinkHighlight}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 32,
  },
  heroSection: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  brand: {
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontFamily: 'Georgia',
    fontSize: 36,
    fontWeight: '400',
    color: '#1a2e24',
    textAlign: 'center',
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5FAD8E',
  },
  headline: {
    fontFamily: 'Georgia',
    fontSize: 19,
    color: '#1a2e24',
    lineHeight: 28,
    textAlign: 'center',
  },
  subline: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#5a7868',
    lineHeight: 21,
    textAlign: 'center',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a2e24',
    borderRadius: 50,
    paddingVertical: 13,
    width: '100%',
  },
  buttonIconLeft: {
    position: 'absolute',
    left: 20,
  },
  appleButtonText: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#FFFFFF',
  },
  appleUnavailableText: {
    fontSize: 11,
    color: '#8aab98',
    textAlign: 'center',
    marginTop: 6,
  },
  buttonGap: {
    height: 10,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d0ddd4',
    borderRadius: 50,
    paddingVertical: 13,
    width: '100%',
  },
  googleButtonText: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#1a2e24',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: '#d0ddd4',
  },
  dividerText: {
    fontSize: 11,
    color: '#8aab98',
    marginHorizontal: 12,
  },
  emailButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5FAD8E',
    borderRadius: 50,
    paddingVertical: 13,
    width: '100%',
    backgroundColor: 'transparent',
  },
  emailButtonText: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#5FAD8E',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  loginLinkText: {
    fontSize: 11,
    color: '#8aab98',
  },
  loginLinkHighlight: {
    color: '#5FAD8E',
  },
});
