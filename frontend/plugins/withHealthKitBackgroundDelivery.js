const { withDangerousMods } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Full AppDelegate.swift with HKObserverQuery background delivery wired in.
// This replaces the generated file during expo prebuild so the native HealthKit
// background delivery code survives clean EAS builds (ios/ is gitignored).
const APPDELEGATE_CONTENT = `internal import Expo
import React
import ReactAppDependencyProvider
import HealthKit
import Security

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  private let healthStore = HKHealthStore()

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    if HKHealthStore.isHealthDataAvailable() {
      registerHealthKitObservers()
    }

    application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - Background Fetch

  public override func application(
    _ application: UIApplication,
    performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    collectAndSendHealthData { completionHandler(.newData) }
  }

  // MARK: - HealthKit Background Delivery

  private func registerHealthKitObservers() {
    let types: [HKSampleType] = [
      HKObjectType.quantityType(forIdentifier: .stepCount),
      HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
      HKObjectType.quantityType(forIdentifier: .restingHeartRate),
      HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
      HKObjectType.categoryType(forIdentifier: .mindfulSession),
    ].compactMap { $0 }

    for type in types {
      let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
        guard error == nil else {
          completionHandler()
          return
        }
        self?.collectAndSendHealthData(completion: completionHandler)
      }
      healthStore.execute(query)
      healthStore.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
    }
  }

  // Reads yesterday's key health metrics and POSTs them to the backend.
  // Must call completion() when done so iOS does not throttle background delivery.
  private func collectAndSendHealthData(completion: @escaping () -> Void) {
    guard HKHealthStore.isHealthDataAvailable(), let token = readAuthToken() else {
      completion()
      return
    }

    let calendar = Calendar.current
    let yesterday = calendar.date(byAdding: .day, value: -1, to: Date())!
    let startOfYesterday = calendar.startOfDay(for: yesterday)
    let endOfYesterday = calendar.date(byAdding: .day, value: 1, to: startOfYesterday)!
    let predicate = HKQuery.predicateForSamples(
      withStart: startOfYesterday,
      end: endOfYesterday,
      options: .strictStartDate
    )

    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    var payload: [String: Any] = ["date": formatter.string(from: startOfYesterday)]

    let group = DispatchGroup()
    let lock = NSLock()

    // Steps — cumulative sum
    if let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) {
      group.enter()
      let q = HKStatisticsQuery(
        quantityType: stepType,
        quantitySamplePredicate: predicate,
        options: .cumulativeSum
      ) { _, result, _ in
        if let sum = result?.sumQuantity() {
          lock.lock()
          payload["steps"] = Int(sum.doubleValue(for: .count()))
          lock.unlock()
        }
        group.leave()
      }
      healthStore.execute(q)
    }

    // Resting heart rate — most recent sample
    if let hrType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
      group.enter()
      let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
      let q = HKSampleQuery(sampleType: hrType, predicate: predicate, limit: 1, sortDescriptors: sort) { _, samples, _ in
        if let s = samples?.first as? HKQuantitySample {
          lock.lock()
          payload["resting_heart_rate"] = Int(s.quantity.doubleValue(for: HKUnit(from: "count/min")))
          lock.unlock()
        }
        group.leave()
      }
      healthStore.execute(q)
    }

    // HRV — most recent sample; react-native-health returns seconds so we match by * 1000 -> ms
    if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
      group.enter()
      let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
      let q = HKSampleQuery(sampleType: hrvType, predicate: predicate, limit: 1, sortDescriptors: sort) { _, samples, _ in
        if let s = samples?.first as? HKQuantitySample {
          lock.lock()
          payload["hrv_ms"] = Int(s.quantity.doubleValue(for: .second()) * 1000)
          lock.unlock()
        }
        group.leave()
      }
      healthStore.execute(q)
    }

    // Sleep — total minutes of non-inBed, non-awake stages
    if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      group.enter()
      let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
      let q = HKSampleQuery(
        sampleType: sleepType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: sort
      ) { _, samples, _ in
        if let samples = samples as? [HKCategorySample], !samples.isEmpty {
          let asleep = samples.filter {
            $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue &&
            $0.value != HKCategoryValueSleepAnalysis.awake.rawValue
          }
          let totalSecs = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
          let mins = Int(totalSecs / 60.0)
          if mins > 0 {
            lock.lock()
            payload["sleep_duration_minutes"] = mins
            lock.unlock()
          }
        }
        group.leave()
      }
      healthStore.execute(q)
    }

    // Mindful minutes — sum of all mindful sessions
    if let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
      group.enter()
      let q = HKSampleQuery(
        sampleType: mindfulType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: nil
      ) { _, samples, _ in
        if let samples = samples, !samples.isEmpty {
          let totalSecs = samples.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
          lock.lock()
          payload["mindful_minutes"] = Int(totalSecs / 60.0)
          lock.unlock()
        }
        group.leave()
      }
      healthStore.execute(q)
    }

    group.notify(queue: .global(qos: .background)) {
      self.sendHealthPayload(payload, token: token, completion: completion)
    }
  }

  private func sendHealthPayload(_ payload: [String: Any], token: String, completion: @escaping () -> Void) {
    guard
      let url = URL(string: "https://koan-production.up.railway.app/api/health/signals"),
      let body = try? JSONSerialization.data(withJSONObject: payload)
    else {
      completion()
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = body
    request.timeoutInterval = 30
    URLSession.shared.dataTask(with: request) { _, _, _ in completion() }.resume()
  }

  // Reads the auth token that expo-secure-store writes under the "app:no-auth" keychain service.
  private func readAuthToken() -> String? {
    let encodedKey = Data("auth_token".utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app:no-auth",
      kSecAttrAccount as String: encodedKey,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: kCFBooleanTrue as Any,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  // MARK: - Linking

  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

const withHealthKitBackgroundDelivery = (config) => {
  return withDangerousMods(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const appDelegatePath = path.join(projectRoot, 'Koan', 'AppDelegate.swift');
      fs.writeFileSync(appDelegatePath, APPDELEGATE_CONTENT, 'utf-8');
      return config;
    },
  ]);
};

module.exports = withHealthKitBackgroundDelivery;
