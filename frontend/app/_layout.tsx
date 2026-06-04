import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import Purchases from 'react-native-purchases';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { storage } from '../services/storage';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Configure RevenueCat once at module load, before any child component can call it.
if (Platform.OS === 'ios') {
  const rcKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';
  console.log('[RevenueCat] configuring with key prefix:', rcKey.slice(0, 12) || '(empty — EXPO_PUBLIC_REVENUECAT_API_KEY not set)');
  console.log('[RC-DEBUG] configure CALLED | keyLength:', rcKey.length, '| keyPrefix:', rcKey.slice(0, 8), '| looksLikeAppl:', rcKey.startsWith('appl_'), '| ts:', new Date().toISOString());
  try {
    Purchases.configure({ apiKey: rcKey });
    console.log('[RevenueCat] configure complete');
    console.log('[RC-DEBUG] configure COMPLETE (anonymous app user id — no explicit appUserID passed) | ts:', new Date().toISOString());
  } catch (e: any) {
    console.error('[RevenueCat] configure failed:', e);
    console.log('[RC-DEBUG] configure FAILED | code:', e?.code, '| message:', e?.message, '| full:', JSON.stringify(e));
  }
}

function RootLayoutNav() {
  const { isAuthenticated, isExpired, loading } = useAuth();
  // Track previous auth value so we can detect false → true transitions.
  // This covers the login-from-/landing case where app/index.tsx isn't mounted.
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (isAuthenticated && isExpired) {
      router.replace('/subscription');
      wasAuthenticated.current = true;
      return;
    }

    if (isAuthenticated && !isExpired) {
      // NOTE: HealthKit observers are intentionally NOT registered here.
      // Touching the react-native-health native module before the user has
      // explicitly authorized HealthKit (via "Connect Apple Health") crashes
      // the app on launch with NSRangeException on the AppleHealthKitQueue.
      // Background delivery for already-authorized users is handled natively
      // in AppDelegate.swift; JS observers are only registered immediately
      // after a successful initHealthKit during the connect flow.

      // If auth just became true (e.g. login from /landing where index.tsx
      // isn't mounted), navigate to the correct destination ourselves.
      if (!wasAuthenticated.current) {
        storage.isOnboardingComplete().then((done) => {
          router.replace(done ? '/(tabs)' : '/onboarding');
        });
      }
    }

    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, isExpired, loading]);

  // Root ready gate: until the auth/token check resolves, render a blank
  // background-colored view instead of the navigator. This prevents the Stack
  // from mounting and painting its default initial route (index) before we
  // know where the user should go — the race that caused the screen flash on
  // first open, after auth, and before the first onboarding screen.
  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#FAFDFA' }} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFDFA' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="intro" />
      <Stack.Screen name="landing" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="learn-more" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <RootLayoutNav />
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default RootLayout;
