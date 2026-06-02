import { Platform } from 'react-native';
import { healthAPI } from './api';

// Lazy-load so module init doesn't crash if native module isn't registered
let AppleHealthKit: any = null;
let HealthKitAvailable = false;

if (Platform.OS === 'ios') {
  try {
    // react-native-health uses module.exports (CommonJS) — no .default property.
    AppleHealthKit = require('react-native-health');
    HealthKitAvailable = AppleHealthKit != null;
    console.log('[HealthKit] module load result — AppleHealthKit:', typeof AppleHealthKit, '| HealthKitAvailable:', HealthKitAvailable, '| hasConstants:', AppleHealthKit?.Constants != null);
  } catch (e) {
    console.error('[HealthKit] react-native-health require() threw — native module is not linked or registered. Error:', e);
    HealthKitAvailable = false;
  }
} else {
  console.log('[HealthKit] skipping module load — Platform.OS is:', Platform.OS);
}

const buildPermissions = () => {
  if (!HealthKitAvailable) return null;
  return {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.Steps,
        AppleHealthKit.Constants.Permissions.SleepAnalysis,
        AppleHealthKit.Constants.Permissions.HeartRateVariability,
        AppleHealthKit.Constants.Permissions.RestingHeartRate,
        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
        AppleHealthKit.Constants.Permissions.OxygenSaturation,
        AppleHealthKit.Constants.Permissions.RespiratoryRate,
        AppleHealthKit.Constants.Permissions.MindfulSession,
        AppleHealthKit.Constants.Permissions.Workout,
      ],
      write: [],
    },
  };
};

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    throw new Error('NOT_IOS');
  }
  if (!HealthKitAvailable) {
    throw new Error('MODULE_UNAVAILABLE');
  }
  const permissions = buildPermissions();
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (error: string) => {
      if (error) {
        reject(new Error(`INIT_FAILED: ${error}`));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Register HKObserverQuery observers for key health types so iOS can wake
 * the app in the background when new data arrives. Safe to call on every
 * app launch — duplicate registrations are ignored by HealthKit.
 */
export function registerHealthKitObservers(): void {
  if (Platform.OS !== 'ios' || !HealthKitAvailable) return;
  const observedTypes = [
    AppleHealthKit.Constants.Permissions.Steps,
    AppleHealthKit.Constants.Permissions.SleepAnalysis,
    AppleHealthKit.Constants.Permissions.HeartRateVariability,
    AppleHealthKit.Constants.Permissions.RestingHeartRate,
    AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
  ];
  observedTypes.forEach((type) => {
    try {
      AppleHealthKit.setObserver({ type }, () => {
        // Collect and forward data whenever HealthKit wakes us
        collectAndSendHealthData().catch(() => {});
      });
    } catch (e) {
      console.warn(`HealthKit observer registration failed for ${type}:`, e);
    }
  });
}

export async function collectAndSendHealthData(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!HealthKitAvailable) return;

  const now = new Date();
  const startOfYesterday = new Date(now);
  startOfYesterday.setDate(now.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(now);
  endOfYesterday.setDate(now.getDate() - 1);
  endOfYesterday.setHours(23, 59, 59, 999);

  const options = {
    startDate: startOfYesterday.toISOString(),
    endDate: endOfYesterday.toISOString(),
  };

  const getAsync = <T>(fn: (opts: any, cb: (err: string, res: T) => void) => void, opts: any): Promise<T | null> =>
    new Promise((resolve) => fn(opts, (err, res) => resolve(err ? null : res)));

  // Steps
  let steps: number | undefined;
  try {
    const res = await getAsync<HealthValue>(AppleHealthKit.getStepCount.bind(AppleHealthKit), options);
    if (res?.value != null) steps = Math.round(res.value);
  } catch {}

  // Resting heart rate
  let resting_heart_rate: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getRestingHeartRateSamples.bind(AppleHealthKit), { ...options, limit: 1, ascending: false });
    if (res && res.length > 0 && res[0].value != null) resting_heart_rate = Math.round(res[0].value);
  } catch {}

  // HRV
  let hrv_ms: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getHeartRateVariabilitySamples.bind(AppleHealthKit), { ...options, limit: 1, ascending: false });
    if (res && res.length > 0 && res[0].value != null) hrv_ms = Math.round(res[0].value * 1000);
  } catch {}

  // Sleep
  let sleep_duration_minutes: number | undefined;
  let sleep_start: string | undefined;
  let sleep_deep_minutes: number | undefined;
  let sleep_rem_minutes: number | undefined;
  let sleep_core_minutes: number | undefined;
  let sleep_efficiency: number | undefined;
  try {
    const res = await getAsync<any[]>(AppleHealthKit.getSleepSamples.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const sumMs = (samples: any[]) => samples.reduce((acc, s) =>
        acc + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);

      const deepSamples = res.filter(s => s.value === 'DEEP');
      const remSamples = res.filter(s => s.value === 'ASLEEP' && s.sourceId?.includes('REM'));
      const coreSamples = res.filter(s => s.value === 'ASLEEP' || s.value === 'CORE');
      const allAsleep = res.filter(s => s.value !== 'INBED' && s.value !== 'AWAKE');

      sleep_duration_minutes = Math.round(sumMs(allAsleep) / 60000);
      sleep_start = res[0]?.startDate
        ? new Date(res[0].startDate).toTimeString().slice(0, 5)
        : undefined;

      if (deepSamples.length > 0) sleep_deep_minutes = Math.round(sumMs(deepSamples) / 60000);
      if (remSamples.length > 0) sleep_rem_minutes = Math.round(sumMs(remSamples) / 60000);
      if (coreSamples.length > 0) sleep_core_minutes = Math.round(sumMs(coreSamples) / 60000);

      if (sleep_duration_minutes && sleep_duration_minutes > 0) {
        const asleep = (sleep_deep_minutes ?? 0) + (sleep_rem_minutes ?? 0) + (sleep_core_minutes ?? 0);
        if (asleep > 0) sleep_efficiency = Math.round((asleep / sleep_duration_minutes) * 100);
      }
    }
  } catch {}

  // SpO2
  let spo2_avg: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getOxygenSaturationSamples.bind(AppleHealthKit), { ...options, limit: 1, ascending: false });
    if (res && res.length > 0 && res[0].value != null) spo2_avg = Math.round(res[0].value * 100);
  } catch {}

  // Respiratory rate
  let respiratory_rate_avg: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getRespiratoryRateSamples.bind(AppleHealthKit), { ...options, limit: 1, ascending: false });
    if (res && res.length > 0 && res[0].value != null) respiratory_rate_avg = Math.round(res[0].value);
  } catch {}

  // Workouts
  let workout_minutes: number | undefined;
  try {
    const res = await getAsync<any[]>(AppleHealthKit.getSamples.bind(AppleHealthKit), { ...options, type: 'Workout' });
    if (res && res.length > 0) {
      const totalMs = res.reduce((acc, w) =>
        acc + (new Date(w.endDate).getTime() - new Date(w.startDate).getTime()), 0);
      workout_minutes = Math.round(totalMs / 60000);
    }
  } catch {}

  // Mindful minutes
  let mindful_minutes: number | undefined;
  try {
    const res = await getAsync<any[]>(AppleHealthKit.getMindfulSession.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const totalMs = res.reduce((acc, m) =>
        acc + (new Date(m.endDate).getTime() - new Date(m.startDate).getTime()), 0);
      mindful_minutes = Math.round(totalMs / 60000);
    }
  } catch {}

  const date = startOfYesterday.toISOString().split('T')[0];

  try {
    await healthAPI.recordSignal({
      date,
      steps,
      resting_heart_rate,
      hrv_ms,
      sleep_duration_minutes,
      sleep_start,
      sleep_deep_minutes,
      sleep_rem_minutes,
      sleep_core_minutes,
      sleep_efficiency,
      spo2_avg,
      respiratory_rate_avg,
      workout_minutes,
      mindful_minutes,
    });
  } catch (e) {
    console.warn('Failed to send health data to backend:', e);
  }
}
