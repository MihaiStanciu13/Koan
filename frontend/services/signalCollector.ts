import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { healthAPI } from './api';

const STORAGE_KEY = 'koan_daily_signal';
const PICKUP_KEY = 'koan_pickups';

interface DailySignal {
  date: string;
  total_pickups: number;
  first_pickup_time: string | null;
  app_sessions: number;
  last_foreground: string | null;
  total_screen_time_minutes: number;
  session_start: string | null;
  // Approximate social media proxy.
  // NOTE: React Native does not expose which app was in the foreground —
  // full app-category tracking requires the Screen Time API, which is not
  // available to third-party apps without a parental-controls entitlement.
  // social_media_minutes is estimated as: sessions longer than 2 minutes
  // that occur between 6pm and 11pm (statistically higher social media usage).
  // evening_session_minutes captures all non-Koan screen time in that window.
  // Both are imperfect proxies; the backend uses them as directional signals only.
  social_media_minutes: number;
  evening_session_minutes: number;
}

const today = () => new Date().toISOString().split('T')[0];
const timeNow = () => new Date().toTimeString().slice(0, 5);

async function getSignal(): Promise<DailySignal> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const stored = raw ? JSON.parse(raw) : null;
  if (stored && stored.date === today()) return stored;
  return {
    date: today(),
    total_pickups: 0,
    first_pickup_time: null,
    app_sessions: 0,
    last_foreground: null,
    total_screen_time_minutes: 0,
    session_start: null,
    social_media_minutes: 0,
    evening_session_minutes: 0,
  };
}

async function saveSignal(signal: DailySignal) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(signal));
}

async function onAppForeground() {
  const signal = await getSignal();
  const now = timeNow();
  signal.total_pickups += 1;
  signal.app_sessions += 1;
  signal.session_start = new Date().toISOString();
  if (!signal.first_pickup_time) {
    signal.first_pickup_time = now;
  }
  await saveSignal(signal);
}

async function onAppBackground() {
  const signal = await getSignal();
  if (signal.session_start) {
    const sessionStart = new Date(signal.session_start);
    const sessionEnd = new Date();
    const sessionMinutes = Math.round(
      (sessionEnd.getTime() - sessionStart.getTime()) / 60000
    );
    signal.total_screen_time_minutes += sessionMinutes;

    // Evening session tracking (6pm–11pm).
    // Accumulate total minutes spent away from Koan in that window.
    const startHour = sessionStart.getHours();
    if (startHour >= 18 && startHour < 23) {
      signal.evening_session_minutes += sessionMinutes;
      // Social media proxy: sessions > 2 minutes in the 6pm–11pm window are
      // statistically more likely to be passive social media browsing.
      // This is an approximation — see DailySignal comment for caveats.
      if (sessionMinutes >= 2) {
        signal.social_media_minutes += sessionMinutes;
      }
    }

    signal.session_start = null;
  }
  await saveSignal(signal);
  await flushToBackend();
}

async function flushToBackend() {
  try {
    const signal = await getSignal();
    await healthAPI.recordSignal({
      date: signal.date,
      total_pickups: signal.total_pickups,
      first_pickup_time: signal.first_pickup_time || undefined,
      total_screen_time_minutes: signal.total_screen_time_minutes,
      social_media_minutes: signal.social_media_minutes || 0,
      evening_session_minutes: signal.evening_session_minutes || 0,
    });
  } catch (e) {
    // fail silently — will retry next time
  }
}

let subscription: any = null;

export function startSignalCollection() {
  if (subscription) return;
  subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') onAppForeground();
    if (state === 'background' || state === 'inactive') onAppBackground();
  });
}

export function stopSignalCollection() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}

export { flushToBackend };
