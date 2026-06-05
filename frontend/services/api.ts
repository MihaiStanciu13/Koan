import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { router } from 'expo-router';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://koan-production.up.railway.app';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// On 401: token is expired or invalid — clear it and redirect to landing
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      router.replace('/landing');
    }
    return Promise.reject(error);
  }
);

export interface SignupData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  subscription_status: string;
  trial_ends?: string;
  created_at?: string;
}

export const authAPI = {
  signup: async (data: SignupData) => {
    const response = await api.post('/auth/signup', data);
    return response.data;
  },
  login: async (data: LoginData) => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  deleteAccount: async () => {
    const response = await api.delete('/auth/account');
    return response.data;
  },
};

export const behaviorAPI = {
  recordPhoneBehavior: async (event_type: string, metadata: any = {}) => {
    const response = await api.post('/behavior/phone', { event_type, metadata });
    return response.data;
  },
  getSummary: async (days: number = 7) => {
    const response = await api.get(`/behavior/summary?days=${days}`);
    return response.data;
  },
};

export const nudgeAPI = {
  getPending: async () => {
    const response = await api.get('/nudges/pending');
    return response.data;
  },
  getCount: async () => {
    const response = await api.get('/nudges/count');
    return response.data.count || 0;
  },
  markDelivered: async (nudge_id: string) => {
    const response = await api.post(`/nudges/${nudge_id}/delivered`);
    return response.data;
  },
  markOpened: async (nudge_id: string) => {
    const response = await api.post(`/nudges/${nudge_id}/opened`);
    return response.data;
  },
  triggerAnchor: async () => {
    const response = await api.post('/nudges/trigger-anchor');
    return response.data;
  },
  getPatternNudge: () =>
    api.get('/nudges/pattern-nudge').then(r => r.data),
  // Home "Today" card. tz_offset = minutes east of UTC so the backend can
  // decide Sunday-vs-weekday and per-day featuring in the user's local time.
  getTodayCard: () => {
    const tzOffset = -new Date().getTimezoneOffset();
    return api.get(`/nudges/today-card?tz_offset=${tzOffset}`).then(r => r.data);
  },
};

export const preferencesAPI = {
  get: async () => {
    const response = await api.get('/preferences');
    return response.data;
  },
  update: async (updates: any) => {
    const response = await api.patch('/preferences', updates);
    return response.data;
  },
};

export const patternsAPI = {
  getWeekly: async () => {
    const response = await api.get('/patterns/weekly');
    return response.data;
  },
};

export const subscriptionAPI = {
  getStatus: async () => {
    const response = await api.get('/subscription/status');
    return response.data;
  },
  createCheckout: async () => {
    const response = await api.post('/subscription/create-checkout');
    return response.data;
  },
  activate: async () => {
    const response = await api.post('/subscription/activate');
    return response.data;
  },
  checkTrial: () => api.get('/subscription/check-trial').then(r => r.data),
};

export const adaptiveNudgeAPI = {
  evaluate: async (signal_type: string, strength: number, metadata: any = {}) => {
    const response = await api.post('/adaptive-nudges/evaluate', {
      signal_type,
      strength,
      metadata,
    });
    return response.data;
  },
  checkFallback: async () => {
    const response = await api.get('/adaptive-nudges/fallback');
    return response.data;
  },
  recordInteraction: async (nudge_id: string, action: string) => {
    const response = await api.post(`/adaptive-nudges/${nudge_id}/interaction?action=${action}`);
    return response.data;
  },
  checkMilestones: async () => {
    const response = await api.get('/adaptive-nudges/milestones');
    return response.data;
  },
  getPersonalizedNudges: async () => {
    const response = await api.get('/adaptive-nudges/personalized');
    return response.data;
  },
};

export const calendarAPI = {
  getAuthUrl: () =>
    api.get('/integrations/calendar/auth-url').then(r => r.data),
  getStatus: () =>
    api.get('/integrations/calendar/status').then(r => r.data),
  disconnect: () =>
    api.delete('/integrations/calendar/disconnect').then(r => r.data),
  getToday: () =>
    api.get('/integrations/calendar/today').then(r => r.data),
};

export const microsoftAPI = {
  getAuthUrl: () =>
    api.get('/integrations/microsoft/auth-url').then(r => r.data),
  getStatus: () =>
    api.get('/integrations/microsoft/status').then(r => r.data),
  disconnect: () =>
    api.delete('/integrations/microsoft/disconnect').then(r => r.data),
  getToday: () =>
    api.get('/integrations/microsoft/today').then(r => r.data),
};

export const healthAPI = {
  recordSignal: (data: any) =>
    api.post('/health/signals', data).then(r => r.data),
  getSignals: (days = 7) =>
    api.get(`/health/signals?days=${days}`).then(r => r.data),
};

export default api;
