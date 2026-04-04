import { Platform } from 'react-native';
import { healthAPI } from './api';

// Only import on iOS
let Health: any = null;
if (Platform.OS === 'ios') {
  Health = require('expo-health');
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!Health) return false;
  try {
    const permissions = {
      read: [
        Health.HealthDataTypes.StepCount,
        Health.HealthDataTypes.DistanceWalkingRunning,
        Health.HealthDataTypes.FlightsClimbed,
        Health.HealthDataTypes.ActiveEnergyBurned,
        Health.HealthDataTypes.ExerciseTime,
        Health.HealthDataTypes.SleepAnalysis,
        Health.HealthDataTypes.HeartRate,
        Health.HealthDataTypes.HeartRateVariabilitySDNN,
        Health.HealthDataTypes.RestingHeartRate,
      ],
    };
    await Health.requestPermissionsAsync(permissions);
    return true;
  } catch (e) {
    console.error('HealthKit permission error:', e);
    return false;
  }
}

export async function collectAndSendHealthData(): Promise<void> {
  if (!Health || Platform.OS !== 'ios') return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [steps, distance, flights, activeEnergy, exerciseTime, heartRate, hrv, restingHR, sleep] =
      await Promise.allSettled([
        Health.getStepCountAsync({ startDate: startOfDay, endDate: now }),
        Health.getDistanceWalkingRunningAsync({ startDate: startOfDay, endDate: now }),
        Health.getFlightsClimbedAsync({ startDate: startOfDay, endDate: now }),
        Health.getActiveEnergyBurnedAsync({ startDate: startOfDay, endDate: now }),
        Health.getAppleExerciseTimeAsync({ startDate: startOfDay, endDate: now }),
        Health.getHeartRateSamplesAsync({ startDate: startOfDay, endDate: now, limit: 1 }),
        Health.getHeartRateVariabilitySDNNAsync({ startDate: startOfDay, endDate: now, limit: 1 }),
        Health.getRestingHeartRateAsync({ startDate: startOfDay, endDate: now, limit: 1 }),
        Health.getSleepSamplesAsync({ startDate: startOfDay, endDate: now }),
      ]);

    const getValue = (result: PromiseSettledResult<any>) =>
      result.status === 'fulfilled' ? result.value : null;

    const sleepData = getValue(sleep);
    let sleepDuration = null;
    let sleepStart = null;
    let sleepEnd = null;
    if (sleepData && sleepData.length > 0) {
      const asleep = sleepData.filter((s: any) => s.value === 'ASLEEP' || s.value === 2);
      if (asleep.length > 0) {
        const earliest = asleep.reduce((a: any, b: any) =>
          new Date(a.startDate) < new Date(b.startDate) ? a : b);
        const latest = asleep.reduce((a: any, b: any) =>
          new Date(a.endDate) > new Date(b.endDate) ? a : b);
        sleepStart = new Date(earliest.startDate).toTimeString().slice(0, 5);
        sleepEnd = new Date(latest.endDate).toTimeString().slice(0, 5);
        sleepDuration = Math.round(
          (new Date(latest.endDate).getTime() - new Date(earliest.startDate).getTime()) / 60000
        );
      }
    }

    const heartRateData = getValue(heartRate);
    const hrvData = getValue(hrv);
    const restingHRData = getValue(restingHR);

    await healthAPI.recordSignal({
      date: today,
      steps: getValue(steps) || undefined,
      walking_running_distance_km: getValue(distance)
        ? Math.round((getValue(distance) / 1000) * 10) / 10
        : undefined,
      flights_climbed: getValue(flights) || undefined,
      active_energy_kcal: getValue(activeEnergy)
        ? Math.round(getValue(activeEnergy))
        : undefined,
      exercise_minutes: getValue(exerciseTime) || undefined,
      sleep_duration_minutes: sleepDuration || undefined,
      sleep_start: sleepStart || undefined,
      sleep_end: sleepEnd || undefined,
      resting_heart_rate: restingHRData && restingHRData.length > 0
        ? Math.round(restingHRData[0].value)
        : undefined,
      hrv_ms: hrvData && hrvData.length > 0
        ? Math.round(hrvData[0].value * 10) / 10
        : undefined,
    });
  } catch (e) {
    console.error('HealthKit collection error:', e);
  }
}
