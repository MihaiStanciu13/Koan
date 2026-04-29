import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import Purchases from 'react-native-purchases';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { NotificationProvider } from '../contexts/NotificationContext';

// Configure RevenueCat once at module load, before any child component can call it.
if (Platform.OS === 'ios') {
  try {
    Purchases.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? 'test_xFJjPWiXVyCwvUPcGfRCoKnWzJF',
    });
  } catch (e) {
    console.warn('RevenueCat configure failed:', e);
  }
}

function RootLayoutNav() {
  const { isAuthenticated, isExpired, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated && isExpired) {
      router.replace('/subscription');
    }
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
    <AuthProvider>
      <NotificationProvider>
        <RootLayoutNav />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default RootLayout;
