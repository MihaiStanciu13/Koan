import { Platform } from 'react-native';
import { healthAPI } from './api';

export async function requestHealthKitPermissions(): Promise<boolean> {
  // HealthKit requires a development build — not available in Expo Go
  // This will be implemented once the Apple Developer account is active
  return false;
}

export async function collectAndSendHealthData(): Promise<void> {
  // HealthKit data collection stubbed until development build is available
  // The AppState-based signal collector in signalCollector.ts handles
  // what's available without HealthKit (pickups, screen time approximation)
  return;
}
