import { Platform } from 'react-native';
import * as ReactNativeDeviceActivity from 'react-native-device-activity';

// ── Screen Time via DeviceActivityMonitor threshold events ───────────────────
//
// This is the lightweight, App-Store-reviewable monitor path (NOT the sandboxed
// DeviceActivityReport scene, which stays deferred to the v1.1 spike).
//
// HONEST-SIGNAL CONSTRAINTS:
//  - iOS categories are NOT nameable. `FamilyActivitySelection` is an opaque,
//    user-picked token from the system FamilyActivityPicker. We use a SINGLE
//    combined bucket: the user picks the apps/categories that distract them,
//    and we attach minute thresholds to that one selection. A crossing means
//    "your chosen-apps limit was crossed" — there is no per-category label.
//  - Thresholds are coarse (crossed / not-crossed), never exact minute counts.
//  - The already-shipped ActivityMonitorExtension persists eventDidReachThreshold
//    to App Group UserDefaults; getEvents() reads them back here. No new native
//    code is required.

export const SCREEN_TIME_SELECTION_ID = 'koan_distracting_apps';
const ACTIVITY_NAME = 'koan_daily';

// Single combined bucket: the union of the intended social (30/60),
// entertainment (60/120) and games (30/90) tiers. One activity, four events —
// well under the ~20-activity iOS limit (events do not count as activities).
const THRESHOLD_MINUTES = [30, 60, 90, 120];

const DAILY_SCHEDULE = {
  intervalStart: { hour: 0, minute: 0, second: 0 },
  intervalEnd: { hour: 23, minute: 59, second: 59 },
  repeats: true,
};

export async function requestScreenTimeAuthorization(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    await ReactNativeDeviceActivity.requestAuthorization('individual');
    return true;
  } catch (e) {
    console.warn('Screen Time authorization failed:', e);
    return false;
  }
}

// AuthorizationStatus values from the library are numeric: 0=notDetermined, 1=denied, 2=approved.
export async function getScreenTimeAuthorizationStatus(): Promise<'notDetermined' | 'denied' | 'approved'> {
  if (Platform.OS !== 'ios') return 'notDetermined';
  try {
    const status = ReactNativeDeviceActivity.getAuthorizationStatus();
    if (status === 2) return 'approved';
    if (status === 1) return 'denied';
    return 'notDetermined';
  } catch {
    return 'notDetermined';
  }
}

// True once the user has picked a non-empty distracting-apps selection via the
// FamilyActivityPicker (persisted under SCREEN_TIME_SELECTION_ID by the library).
export function hasScreenTimeSelection(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    const token = ReactNativeDeviceActivity.getFamilyActivitySelectionId(SCREEN_TIME_SELECTION_ID);
    return typeof token === 'string' && token.length > 0;
  } catch {
    return false;
  }
}

// Register the daily threshold events against the user's picked selection.
// Returns false (no monitoring) if the user hasn't picked any apps yet — there
// is no "entire device" option; events must reference a real selection token.
export async function registerScreenTimeThresholds(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const selection = ReactNativeDeviceActivity.getFamilyActivitySelectionId(SCREEN_TIME_SELECTION_ID);
    if (!selection) {
      console.log('[ScreenTime] no selection yet — skipping threshold registration');
      return false;
    }
    const events = THRESHOLD_MINUTES.map((minutes) => ({
      familyActivitySelection: selection,
      threshold: { minute: minutes },
      eventName: `limit_${minutes}`,
    }));
    await ReactNativeDeviceActivity.startMonitoring(ACTIVITY_NAME, DAILY_SCHEDULE, events);
    console.log('[ScreenTime] registered', events.length, 'threshold events on selection');
    return true;
  } catch (e) {
    console.warn('[ScreenTime] threshold registration failed:', e);
    return false;
  }
}

export type ThresholdCrossing = {
  event_name: string;       // e.g. "limit_60"
  threshold_minutes: number; // e.g. 60
  crossed_at: string;        // ISO timestamp
};

// Read the threshold events that fired TODAY from the monitor extension's
// persisted store. Coarse signal: which limits were crossed, and when.
export function getScreenTimeThresholdsCrossedToday(): ThresholdCrossing[] {
  if (Platform.OS !== 'ios') return [];
  try {
    const events = ReactNativeDeviceActivity.getEvents(ACTIVITY_NAME);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return events
      .filter((e) => e.callbackName === 'eventDidReachThreshold' && !!e.eventName)
      .filter((e) => e.lastCalledAt && new Date(e.lastCalledAt) >= startOfToday)
      .map((e) => {
        const match = /limit_(\d+)/.exec(e.eventName || '');
        return {
          event_name: e.eventName as string,
          threshold_minutes: match ? parseInt(match[1], 10) : 0,
          crossed_at: new Date(e.lastCalledAt).toISOString(),
        };
      });
  } catch (e) {
    console.warn('[ScreenTime] getEvents read failed:', e);
    return [];
  }
}

// Backwards-compatible name retained for callers; now registers real threshold
// events instead of the previous empty-events monitoring.
export async function startDailyMonitoring(): Promise<void> {
  await registerScreenTimeThresholds();
}
