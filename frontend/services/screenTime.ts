import { Platform } from 'react-native';
// NOTE: react-native-device-activity uses Apple's Family Controls framework,
// which requires a manual entitlement review from Apple before App Store
// distribution. The authorization call below is a no-op until that
// entitlement is approved for com.getkoan.app.
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

export async function getScreenTimeAuthorizationStatus(): Promise<string> {
  if (Platform.OS !== 'ios') return 'notDetermined';
  try {
    return (await ReactNativeDeviceActivity.authorizationStatus()) ?? 'notDetermined';
  } catch {
    return 'notDetermined';
  }
}
