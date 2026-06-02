import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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
  try {
    Purchases.configure({ apiKey: rcKey });
    console.log('[RevenueCat] configure complete');
  } catch (e) {
    console.error('[RevenueCat] configure failed:', e);
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
