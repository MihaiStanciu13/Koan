import React, { createContext, useState, useContext, useEffect } from 'react';
import { router } from 'expo-router';
import { authAPI, subscriptionAPI, User } from '../services/api';
import { storage } from '../services/storage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isExpired: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
  };

  const signup = async (email: string, password: string, name: string) => {
    const response = await authAPI.signup({ email, password, name });
    await storage.setAuthToken(response.access_token);
    setUser(response.user);
  };

  const loginWithToken = async (token: string, user: User) => {
    await storage.setAuthToken(token);
    setUser(user);
  };

  const logout = async () => {
    try {
      await storage.removeAuthToken();
    } catch (e) {
      // ignore — proceed with logout regardless
    }
    setUser(null);
    await storage.clearOnboardingComplete();
    router.replace('/');
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
