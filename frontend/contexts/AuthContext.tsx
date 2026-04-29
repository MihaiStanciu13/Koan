import React, { createContext, useState, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import Purchases from 'react-native-purchases';
import { authAPI, subscriptionAPI, User } from '../services/api';
import { storage } from '../services/storage';

const RC_ENTITLEMENT = 'premium';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isExpired: boolean;
  isPremium: boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

// Identify the current user to RevenueCat so purchases are tied to the Koan
// account. Called after every successful auth (login, signup, checkAuth).
async function rcLogIn(userId: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo.entitlements.active[RC_ENTITLEMENT] !== undefined;
  } catch (e) {
    console.warn('RevenueCat logIn failed:', e);
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await storage.getAuthToken();
      if (token) {
        const userData = await authAPI.getMe();
        try {
          const trialCheck = await subscriptionAPI.checkTrial();
          if (trialCheck.trial_expired) {
            userData.subscription_status = 'expired';
          }
        } catch {
          // Non-fatal: proceed with data from getMe
        }
        setUser(userData);

        // Identify user to RevenueCat and fetch fresh entitlement status.
        const premium = await rcLogIn(userData.id);
        setIsPremium(premium);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      await storage.removeAuthToken();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authAPI.login({ email, password });
    await storage.setAuthToken(response.access_token);
    setUser(response.user);
    const premium = await rcLogIn(response.user.id);
    setIsPremium(premium);
  };

  const signup = async (email: string, password: string, name: string) => {
    const response = await authAPI.signup({ email, password, name });
    await storage.setAuthToken(response.access_token);
    setUser(response.user);
    const premium = await rcLogIn(response.user.id);
    setIsPremium(premium);
  };

  const loginWithToken = async (token: string, user: User) => {
    await storage.setAuthToken(token);
    setUser(user);
    const premium = await rcLogIn(user.id);
    setIsPremium(premium);
  };

  const logout = async () => {
    try {
      await storage.removeAuthToken();
    } catch (e) {
      // ignore — proceed with logout regardless
    }
    if (Platform.OS === 'ios') {
      try { await Purchases.logOut(); } catch {}
    }
    setUser(null);
    setIsPremium(false);
    await storage.clearOnboardingComplete();
    router.replace('/landing');
  };

  const refreshAuth = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        loginWithToken,
        logout,
        isAuthenticated: !!user,
        isExpired: user?.subscription_status === 'expired',
        isPremium,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
