import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthValue } from 'react-native-health';
import { healthAPI } from './api';

// Persisted across launches: set once the user successfully authorizes
// HealthKit. Lets us safely collect data on later cold launches (when the
// session flag is false) without touching the native module for users who
// never authorized.
const HEALTHKIT_AUTHORIZED_KEY = 'koan_healthkit_authorized';

async function persistHealthKitAuthorized(): Promise<void> {
  try {
    await AsyncStorage.setItem(HEALTHKIT_AUTHORIZED_KEY, 'true');
  } catch (e) {
    console.warn('[HealthKit] failed to persist authorization flag:', e);
  }
}

async function wasHealthKitPreviouslyAuthorized(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HEALTHKIT_AUTHORIZED_KEY)) === 'true';
  } catch {
    return false;
  }
}

// Lazy-load so module init doesn't crash if native module isn't registered
let AppleHealthKit: any = null;
let HealthKitAvailable = false;

// Tracks whether initHealthKit has SUCCEEDED in the current app session.
// Native observer registration (setObserver) must never run before this is
// true — calling setObserver on uninitialized types crashes the native
// module with NSRangeException on com.facebook.react.AppleHealthKitQueue.
let healthKitInitialized = false;

// Stronger gate than healthKitInitialized: flips true only after a single test
// getter (getStepCount) actually succeeds, proving the native HKHealthStore is
// fully settled and queryable. ALL production data collection and background
// delivery (observer) setup must gate on this, not just healthKitInitialized.
let isHealthKitFullyReady = false;

// Delay before any post-init native interaction, to let native HealthKit state
// settle after the authorization sheet is dismissed. Calling setObserver /
// getters immediately inside the initHealthKit success callback is a known
// trigger for NSRangeException on com.facebook.react.AppleHealthKitQueue.
const POST_INIT_SETTLE_MS = 2000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

/**
 * Resolve true only if the native module is loaded AND HealthKit data is
 * actually available on this device (e.g. false on iPad). Bails safely on
 * any error so callers never crash.
 */
async function isHealthKitAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !HealthKitAvailable || typeof AppleHealthKit?.isAvailable !== 'function') {
    return false;
  }
  return new Promise((resolve) => {
    try {
      AppleHealthKit.isAvailable((err: any, available: boolean) => {
        if (err) {
          console.error('[HealthKit] isAvailable() returned error:', err);
          resolve(false);
        } else {
          resolve(!!available);
        }
      });
    } catch (e) {
      console.error('[HealthKit] isAvailable() threw synchronously:', e);
      resolve(false);
    }
  });
}

// Read-only permission set. Each constant is looked up by key and filtered so
// any value that is undefined on the current iOS version / library build is
// dropped before reaching the native module (an undefined entry is a known
// trigger for the initHealthKit NSRangeException crash).
const DESIRED_READ_KEYS = [
  'Steps',
  'SleepAnalysis',
  'HeartRateVariability',
  'RestingHeartRate',
  'ActiveEnergyBurned',
  'OxygenSaturation',
  'RespiratoryRate',
  'MindfulSession',
  'Workout',
  // Expanded signals (no new permission asks beyond what HealthKit groups).
  // TimeInDaylight and AppleStandHour are intentionally omitted — they do not
  // exist in this react-native-health version (outdoor time is derived from
  // workouts; stand hours from AppleStandTime).
  'BasalEnergyBurned',
  'WalkingHeartRateAverage',
  'Vo2Max',
  'EnvironmentalAudioExposure',
  'AppleStandTime',
];

const buildPermissions = () => {
  if (!HealthKitAvailable) return null;
  const P = AppleHealthKit?.Constants?.Permissions;
  if (!P) {
    console.error('[HealthKit] Constants.Permissions is unavailable — cannot build permissions object');
    return null;
  }
  const read: string[] = [];
  for (const key of DESIRED_READ_KEYS) {
    const v = P[key];
    if (typeof v === 'string' && v.length > 0) {
      read.push(v);
    } else {
      console.warn(`[HealthKit] permission constant "${key}" not found in this library version — skipping`);
    }
  }
  console.log('[HealthKit] buildPermissions — requested:', DESIRED_READ_KEYS.length, '| valid:', read.length, '|', read);
  if (read.length === 0) return null;
  return {
    permissions: {
      read,
      write: [] as string[],
    },
  };
};

/**
 * Request HealthKit read permissions. MUST only be called on explicit user
 * action (e.g. tapping "Connect Apple Health") — never automatically on app
 * launch. Verifies availability and a non-empty, valid permission set before
 * touching the native module.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    throw new Error('NOT_IOS');
  }
  if (!HealthKitAvailable || typeof AppleHealthKit?.initHealthKit !== 'function') {
    throw new Error('MODULE_UNAVAILABLE');
  }

  // Guard: bail early if HealthKit is not available on this device.
  const available = await isHealthKitAvailable();
  if (!available) {
    console.error('[HealthKit] isAvailable() returned false — HealthKit is not supported on this device');
    throw new Error('MODULE_UNAVAILABLE');
  }

  const permissions = buildPermissions();
  if (!permissions || permissions.permissions.read.length === 0) {
    console.error('[HealthKit] no valid permission constants — aborting initHealthKit to avoid native crash');
    throw new Error('NO_VALID_PERMISSIONS');
  }

  return new Promise((resolve, reject) => {
    try {
      AppleHealthKit.initHealthKit(permissions, (error: string) => {
        if (error) {
          reject(new Error(`INIT_FAILED: ${error}`));
        } else {
          healthKitInitialized = true;
          // Persist so later cold launches know the user authorized HealthKit.
          void persistHealthKitAuthorized();
          resolve(true);
        }
      });
    } catch (e) {
      // Native exceptions usually aren't catchable in JS, but guard anyway.
      console.error('[HealthKit] initHealthKit threw synchronously:', e);
      reject(new Error('INIT_THREW'));
    }
  });
}

/**
 * Read the HealthKit authorization status for a SINGLE permission type.
 * Returns the numeric status (0 = NotDetermined, 1 = SharingDenied,
 * 2 = SharingAuthorized) or null if it cannot be determined. Fully wrapped —
 * never throws. Querying status for a denied type and then registering an
 * observer on it is a known NSRangeException trigger, so callers must check
 * this and skip non-authorized types.
 */
async function getAuthStatusForType(type: string): Promise<number | null> {
  if (!HealthKitAvailable || typeof AppleHealthKit?.getAuthStatus !== 'function') {
    return null;
  }
  return new Promise((resolve) => {
    try {
      AppleHealthKit.getAuthStatus(
        { permissions: { read: [type], write: [] } },
        (err: any, results: any) => {
          if (err) {
            console.error('[HealthKit] post-init failure — getAuthStatus error for', type, ':', err);
            resolve(null);
          } else {
            const status = results?.permissions?.read?.[0];
            resolve(typeof status === 'number' ? status : null);
          }
        }
      );
    } catch (e) {
      console.error('[HealthKit] post-init failure — getAuthStatus threw for', type, ':', e);
      resolve(null);
    }
  });
}

/**
 * Verification chain to prove the native store is fully settled and queryable.
 * Primary probe: getStepCount must succeed. Secondary probe: one expanded
 * getter (getActiveEnergyBurned) is exercised to confirm the store handles a
 * newly-added type — a "no data" error there is tolerated (many users lack
 * active-energy samples); only a thrown exception or a failing primary probe
 * blocks readiness. On success flips isHealthKitFullyReady. Never throws.
 */
async function runHealthKitTestGetter(): Promise<boolean> {
  if (!HealthKitAvailable || typeof AppleHealthKit?.getStepCount !== 'function') {
    return false;
  }

  // Primary probe — getStepCount.
  const primaryOk = await new Promise<boolean>((resolve) => {
    try {
      AppleHealthKit.getStepCount({}, (err: any) => {
        if (err) {
          console.error('[HealthKit] post-init failure — test getter (getStepCount) returned error:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (e) {
      console.error('[HealthKit] post-init failure — test getter (getStepCount) threw:', e);
      resolve(false);
    }
  });
  if (!primaryOk) return false;

  // Secondary probe — one expanded getter (active energy). Tolerates "no data".
  if (typeof AppleHealthKit?.getActiveEnergyBurned === 'function') {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    await new Promise<void>((resolve) => {
      try {
        AppleHealthKit.getActiveEnergyBurned(
          { startDate: startOfToday.toISOString(), endDate: now.toISOString() },
          (err: any) => {
            if (err) console.log('[HealthKit] secondary probe (getActiveEnergyBurned) returned no data/err (tolerated):', err);
            resolve();
          }
        );
      } catch (e) {
        console.error('[HealthKit] post-init failure — secondary probe (getActiveEnergyBurned) threw:', e);
        resolve();
      }
    });
  }

  isHealthKitFullyReady = true;
  console.log('[HealthKit] test getters passed — isHealthKitFullyReady = true');
  return true;
}

/**
 * Register HKObserverQuery observers for key health types so iOS can wake the
 * app in the background when new data arrives.
 *
 * Defensive: no-op unless isHealthKitFullyReady (test getter passed). For each
 * type it first checks getAuthStatus and only registers when the type is
 * explicitly authorized — denied/undetermined types are skipped silently, as
 * they are a known NSRangeException trigger. Every native call is individually
 * wrapped; a failure on one type never affects the others or crashes.
 */
export async function registerHealthKitObservers(): Promise<void> {
  if (Platform.OS !== 'ios' || !HealthKitAvailable) return;
  if (!isHealthKitFullyReady) {
    console.log('[HealthKit] skipping observer registration — HealthKit not fully ready (test getter has not passed)');
    return;
  }
  const P = AppleHealthKit?.Constants?.Permissions;
  if (!P) return;
  const SHARING_AUTHORIZED = 2;
  const observedTypes = ['Steps', 'SleepAnalysis', 'HeartRateVariability', 'RestingHeartRate', 'ActiveEnergyBurned']
    .map((key) => P[key])
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);

  for (const type of observedTypes) {
    try {
      const status = await getAuthStatusForType(type);
      if (status !== SHARING_AUTHORIZED) {
        console.log('[HealthKit] skipping observer for', type, '— status not authorized:', status);
        continue;
      }
      AppleHealthKit.setObserver({ type }, () => {
        // Collect and forward data whenever HealthKit wakes us
        collectAndSendHealthData().catch(() => {});
      });
    } catch (e) {
      console.error('[HealthKit] post-init failure — observer registration failed for', type, ':', e);
      // continue silently to the next type
    }
  }
}

/**
 * Post-authorization finalization. MUST be the only thing that touches native
 * HealthKit after a successful initHealthKit. Deferred by POST_INIT_SETTLE_MS
 * so it never runs inside the init success callback chain (the crash window).
 * Runs the test getter to set isHealthKitFullyReady, then registers observers.
 * Fire-and-forget; never throws.
 */
export function finalizeHealthKitSetup(): void {
  if (Platform.OS !== 'ios' || !HealthKitAvailable) return;
  setTimeout(() => {
    (async () => {
      try {
        const ready = await runHealthKitTestGetter();
        if (!ready) {
          console.error('[HealthKit] post-init failure — finalize aborted, test getter did not pass');
          return;
        }
        await registerHealthKitObservers();
      } catch (e) {
        console.error('[HealthKit] post-init failure — finalize threw:', e);
      }
    })();
  }, POST_INIT_SETTLE_MS);
}

export async function collectAndSendHealthData(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!HealthKitAvailable) return;

  // Production collection gates on isHealthKitFullyReady (a passed test getter),
  // not just healthKitInitialized. This runs automatically on the home tab at
  // launch, so for a user who never connected we skip silently — touching the
  // native module before init risks the same NSRangeException crash.
  if (!isHealthKitFullyReady) {
    if (!healthKitInitialized) {
      const previouslyAuthorized = await wasHealthKitPreviouslyAuthorized();
      if (!previouslyAuthorized) {
        console.log('[HealthKit] collectAndSendHealthData skipped — not authorized this session and no persisted authorization');
        return;
      }
      // Authorized in a prior session, but HKHealthStore isn't set up this
      // session yet. Re-run the safe init path (no re-prompt for already-
      // authorized users; this is NOT the setObserver path that crashed).
      try {
        await requestHealthKitPermissions();
      } catch (e) {
        console.warn('[HealthKit] re-init for previously-authorized user failed; skipping collection:', e);
        return;
      }
      // Let native state settle before the first query after a fresh init.
      await delay(POST_INIT_SETTLE_MS);
    }
    // Prove the store is queryable before reading production data.
    const ready = await runHealthKitTestGetter();
    if (!ready) {
      console.error('[HealthKit] post-init failure — collectAndSendHealthData skipped, test getter did not pass');
      return;
    }
  }

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

  // Each native getter invocation is individually wrapped: if the native call
  // throws synchronously, resolve null instead of letting it crash the chain.
  const getAsync = <T>(fn: (opts: any, cb: (err: string, res: T) => void) => void, opts: any): Promise<T | null> =>
    new Promise((resolve) => {
      try {
        fn(opts, (err, res) => resolve(err ? null : res));
      } catch (e) {
        console.error('[HealthKit] post-init failure — native getter threw:', e);
        resolve(null);
      }
    });

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

  // ── Expanded signals (no new permission asks) ──────────────────────────────
  // Each block is independently try/caught and skips silently on failure.

  // Outdoor time (minutes). TimeInDaylight is not exposed by this library
  // version, so derive from outdoor-type workouts (running/walking/cycling/
  // hiking, excluding explicitly-indoor workouts).
  let time_outdoors_minutes: number | undefined;
  try {
    const res = await getAsync<any[]>(AppleHealthKit.getSamples.bind(AppleHealthKit), { ...options, type: 'Workout' });
    if (res && res.length > 0) {
      const OUTDOOR = ['running', 'walking', 'cycling', 'hiking'];
      const isIndoor = (w: any) =>
        w?.metadata?.HKIndoorWorkout === true || w?.metadata?.indoor === true || w?.isIndoor === true;
      const outdoor = res.filter((w) => {
        if (isIndoor(w)) return false;
        const name = String(w?.activityName ?? w?.activityType ?? w?.type ?? '').toLowerCase();
        return OUTDOOR.some((t) => name.includes(t));
      });
      if (outdoor.length > 0) {
        const totalMs = outdoor.reduce((acc, w) =>
          acc + (new Date(w.endDate).getTime() - new Date(w.startDate).getTime()), 0);
        time_outdoors_minutes = Math.round(totalMs / 60000);
      }
    }
  } catch {}

  // Active energy (kcal) — sum of active energy samples for the day.
  let active_energy_kcal: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getActiveEnergyBurned.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const total = res.reduce((acc, s) => acc + (s.value || 0), 0);
      if (total > 0) active_energy_kcal = Math.round(total);
    }
  } catch {}

  // Resting/basal energy (kcal) — pairs with active energy for recovery.
  let resting_energy_kcal: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getBasalEnergyBurned.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const total = res.reduce((acc, s) => acc + (s.value || 0), 0);
      if (total > 0) resting_energy_kcal = Math.round(total);
    }
  } catch {}

  // Hourly steps — 24-element array, one bucket per hour of the day.
  let hourly_steps: number[] | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getDailyStepCountSamples.bind(AppleHealthKit), { ...options, period: 60 });
    if (res && res.length > 0) {
      const buckets: number[] = new Array(24).fill(0);
      for (const s of res) {
        if (s.value == null || !s.startDate) continue;
        const h = new Date(s.startDate).getHours();
        if (h >= 0 && h < 24) buckets[h] += Math.round(s.value);
      }
      hourly_steps = buckets;
    }
  } catch {}

  // Wake time (HH:MM) — end of the last asleep/inBed interval for the night.
  let wake_time: string | undefined;
  try {
    const res = await getAsync<any[]>(AppleHealthKit.getSleepSamples.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const asleep = res.filter((s) => s.value !== 'AWAKE');
      const latestEnd = asleep.reduce<Date | null>((latest, s) => {
        const end = s.endDate ? new Date(s.endDate) : null;
        if (end && (!latest || end.getTime() > latest.getTime())) return end;
        return latest;
      }, null);
      if (latestEnd) wake_time = latestEnd.toTimeString().slice(0, 5);
    }
  } catch {}

  // Stand hours — distinct hours with >= 1 min stand time (Apple Watch only).
  // AppleStandHour is not exposed in this library version; derive from
  // AppleStandTime by bucketing into hours.
  let stand_hours: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getAppleStandTime.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const hoursWithStand = new Set<number>();
      for (const s of res) {
        if (s.value != null && s.value >= 1 && s.startDate) {
          hoursWithStand.add(new Date(s.startDate).getHours());
        }
      }
      stand_hours = hoursWithStand.size;
    }
  } catch {}

  // Walking heart rate average (bpm).
  let walking_hr_avg: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getWalkingHeartRateAverage.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const vals = res.map((s) => s.value).filter((v): v is number => typeof v === 'number' && v > 0);
      if (vals.length > 0) walking_hr_avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  } catch {}

  // VO2 max (mL/kg/min) — sparse for non-runners; take the most recent sample.
  let vo2_max: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getVo2MaxSamples.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const latest = res.reduce((a, b) => {
        const ad = new Date(a.endDate || a.startDate).getTime();
        const bd = new Date(b.endDate || b.startDate).getTime();
        return bd >= ad ? b : a;
      });
      if (latest?.value != null) vo2_max = Math.round(latest.value * 10) / 10;
    }
  } catch {}

  // Environmental audio exposure — daily average dB (noise/stress signal).
  let audio_exposure_db_avg: number | undefined;
  try {
    const res = await getAsync<HealthValue[]>(AppleHealthKit.getEnvironmentalAudioExposure.bind(AppleHealthKit), options);
    if (res && res.length > 0) {
      const vals = res.map((s) => s.value).filter((v): v is number => typeof v === 'number' && v > 0);
      if (vals.length > 0) {
        audio_exposure_db_avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
      }
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
      // Expanded signals
      time_outdoors_minutes,
      active_energy_kcal,
      resting_energy_kcal,
      hourly_steps,
      wake_time,
      stand_hours,
      walking_hr_avg,
      vo2_max,
      audio_exposure_db_avg,
    });
  } catch (e) {
    console.warn('Failed to send health data to backend:', e);
  }
}
