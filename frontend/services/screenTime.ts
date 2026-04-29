import { Platform } from 'react-native';
import * as ReactNativeDeviceActivity from 'react-native-device-activity';

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
// We map them to descriptive strings for readability across callers.
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

// Starts a daily DeviceActivity monitoring schedule (midnight → 23:59, repeating).
// Safe to call repeatedly — skips if koan_daily is already registered.
// No threshold events are configured here; the schedule activates the
// ActivityMonitorExtension so it fires intervalDidStart/intervalDidEnd callbacks.
export async function startDailyMonitoring(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const active = ReactNativeDeviceActivity.getActivities();
    if (active.includes('koan_daily')) return;
    await ReactNativeDeviceActivity.startMonitoring(
      'koan_daily',
      {
        intervalStart: { hour: 0, minute: 0, second: 0 },
        intervalEnd: { hour: 23, minute: 59, second: 59 },
        repeats: true,
      },
      []
    );
  } catch (e) {
    console.warn('DeviceActivity startMonitoring failed:', e);
  }
}
