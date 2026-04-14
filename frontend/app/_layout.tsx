import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableInExpoDevelopment: false,
  debug: false,
  tracesSampleRate: 0.2,
});

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

export default Sentry.wrap(RootLayout);
