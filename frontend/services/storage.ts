import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const storage = {
  // Auth
  setAuthToken: async (token: string) => {
    await SecureStore.setItemAsync('auth_token', token);
  },
  getAuthToken: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync('auth_token');
  },
  removeAuthToken: async () => {
    await SecureStore.deleteItemAsync('auth_token');
  },
  
  // User
  setUser: async (user: any) => {
    await AsyncStorage.setItem('user', JSON.stringify(user));
  },
  getUser: async (): Promise<any | null> => {
    const user = await AsyncStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  removeUser: async () => {
    await AsyncStorage.removeItem('user');
  },
  
  // Onboarding
  setOnboardingComplete: async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
  },
  isOnboardingComplete: async (): Promise<boolean> => {
    const complete = await AsyncStorage.getItem('onboarding_complete');
    return complete === 'true';
  },
  
  // Splash
  setSplashSeen: async () => {
    await AsyncStorage.setItem('splash_seen', 'true');
  },
  hasSplashSeen: async (): Promise<boolean> => {
    const seen = await AsyncStorage.getItem('splash_seen');
    return seen === 'true';
  },

  // Clear all
  clearAll: async () => {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      // Fallback: remove keys individually if clear() fails on native
      console.warn('AsyncStorage.clear() failed, using individual removal:', error);
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('onboarding_complete');
      await AsyncStorage.removeItem('hasSeenWelcomeVideo');
    }
  },
  
  // Clear auth only (for logout) - keep onboarding & UI flags
  clearAuth: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await AsyncStorage.removeItem('user');
  },
};
