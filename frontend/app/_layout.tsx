import React, { useEffect } from 'react';
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
  // SINGLE navigation authority for authenticated lifecycle routing. index.tsx
  // no longer redirects authenticated users — it only presents the logged-out
  // intro/landing/login/signup screens. Keeping all "where does this user go"
  // logic here kills the two-controller race that caused the flicker and the
  // paywall flash.
  const { isAuthenticated, isExpired, isPremium, loading } = useAuth();

  useEffect(() => {
    // "Fully resolved" gate: `loading` stays true until checkAuth() has both the
    // account (getMe + checkTrial → isExpired) AND the entitlement (RevenueCat
    // logIn → isPremium). We never route — or paint anything but the splash —
    // before both are known.
    if (loading) return;

    // Unauthenticated: index.tsx owns intro vs. landing presentation. Not our job.
    if (!isAuthenticated) return;

    // Lapsed = backend says expired AND RevenueCat has no active entitlement.
    // Gating on !isPremium means a paying user whose backend status lags the
    // RevenueCat webhook is NOT walled (kills the flash for paying users).
    const lapsed = isExpired && !isPremium;

    if (lapsed) {
      // HARD WALL. Paywall only; no onboarding / new-user flow under any
      // condition (even a fresh install of an already-expired account). The
      // only exits are purchase/restore, enforced by the paywall's own
      // beforeRemove/back guards (edeb44a).
      router.replace('/subscription');
      return;
    }

    // new / trial / active (or premium-by-RevenueCat): onboarding if incomplete,
    // otherwise Home.
    storage.isOnboardingComplete().then((done) => {
      router.replace(done ? '/(tabs)' : '/onboarding');
    });
  }, [isAuthenticated, isExpired, isPremium, loading]);

  // Root ready gate: until BOTH auth and subscription state are known, render a
  // neutral splash instead of the navigator. This stops the Stack from mounting
  // and painting its default initial route (index) before we know where the
  // user should go — the race that caused the screen flash on first open, after
  // auth, and before the first onboarding screen.
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
