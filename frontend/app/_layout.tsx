import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { NotificationProvider } from '../contexts/NotificationContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="learn-more" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </NotificationProvider>
    </AuthProvider>
  );
}
