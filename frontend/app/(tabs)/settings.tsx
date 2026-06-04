import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { preferencesAPI, subscriptionAPI, authAPI, calendarAPI, microsoftAPI } from '../../services/api';
import { requestHealthKitPermissions, finalizeHealthKitSetup } from '../../services/healthKit';
import {
  requestScreenTimeAuthorization,
  registerScreenTimeThresholds,
  hasScreenTimeSelection,
  getScreenTimeAuthorizationStatus,
  SCREEN_TIME_SELECTION_ID,
} from '../../services/screenTime';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';
import * as WebBrowser from 'expo-web-browser';

const WORKPLACE_TOOLS = [
  { id: 'apple_health', name: 'Apple Health', icon: 'heart-outline', color: '#EA4335' },
  { id: 'screen_time', name: 'Screen Time', icon: 'hourglass-outline', color: '#5856D6' },
  { id: 'gcalendar', name: 'Google Calendar', icon: 'calendar-outline', color: '#4285F4' },
  { id: 'microsoft365', name: 'Microsoft 365', icon: 'people-outline', color: '#0078D4' },
];

const MICRO_MODES = [
  {
    value: 'standard',
    name: 'Standard',
    description: 'Balanced nudges throughout the day',
  },
  {
    value: 'focus',
    name: 'Focus Mode',
    description: 'Minimal interruptions, deep work support',
  },
  {
    value: 'meeting',
    name: 'Meeting-Heavy',
    description: 'Recovery nudges between meetings',
  },
  {
    value: 'whisper',
    name: 'Whisper',
    description: 'Ultra-rare nudges, anchor reminders only — for travel or high-pressure periods',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [preferences, setPreferences] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Local states
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [microMode, setMicroMode] = useState('standard');
  const [anchorAction, setAnchorAction] = useState('close one loop');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [stPickerVisible, setStPickerVisible] = useState(false);
  
  

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const [prefs, sub] = await Promise.all([
        preferencesAPI.get(),
        subscriptionAPI.getStatus(),
      ]);

      setPreferences(prefs);
      setSubscription(sub);

      setNotificationsEnabled(prefs.notification_enabled ?? true);
      setConnectedTools(prefs.connected_tools || []);
      setMicroMode(prefs.micro_mode || 'standard');
      setAnchorAction(prefs.anchor_action || 'close one loop');

      const calStatus = await calendarAPI.getStatus();
      if (calStatus.connected) {
        setConnectedTools(prev =>
          prev.includes('gcalendar') ? prev : [...prev, 'gcalendar']
        );
      }

      const msStatus = await microsoftAPI.getStatus();
      if (msStatus.connected) {
        setConnectedTools(prev =>
          prev.includes('microsoft365') ? prev : [...prev, 'microsoft365']
        );
      }

      // Reflect the real DeviceActivityMonitor authorization + selection state.
      if (Platform.OS === 'ios') {
        try {
          const stStatus = await getScreenTimeAuthorizationStatus();
          if (stStatus === 'approved' && hasScreenTimeSelection()) {
            setConnectedTools(prev =>
              prev.includes('screen_time') ? prev : [...prev, 'screen_time']
            );
          }
        } catch {
          // Family Controls entitlement unavailable — leave row off
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const updatePreference = async (key: string, value: any) => {
    try {
      await preferencesAPI.update({ [key]: value });
    } catch (error) {
      console.error('Failed to update preference:', error);
      Alert.alert('Error', 'Could not save preference');
    }
  };


  const toggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    await updatePreference('notification_enabled', newValue);
  };

  const toggleWorkplaceTool = async (toolId: string) => {
    // Special handling for Apple Health
    if (toolId === 'apple_health') {
      if (connectedTools.includes('apple_health')) {
        const newTools = connectedTools.filter(t => t !== 'apple_health');
        setConnectedTools(newTools);
        await updatePreference('connected_tools', newTools);
      } else {
        try {
          await requestHealthKitPermissions();
          // Deferred, fully-guarded native follow-up (test getter + observers).
          finalizeHealthKitSetup();
          const newTools = [...connectedTools, 'apple_health'];
          setConnectedTools(newTools);
          await updatePreference('connected_tools', newTools);
        } catch {
          Alert.alert('Apple Health is only available on iOS.');
        }
      }
      return;
    }
    // Special handling for Screen Time (DeviceActivityMonitor + FamilyActivityPicker)
    if (toolId === 'screen_time') {
      if (connectedTools.includes('screen_time')) {
        // Visual disconnect only — Koan stops treating it as active. The OS-level
        // Family Controls authorization is not revoked here.
        const newTools = connectedTools.filter(t => t !== 'screen_time');
        setConnectedTools(newTools);
        await updatePreference('connected_tools', newTools);
      } else {
        try {
          const granted = await requestScreenTimeAuthorization();
          if (!granted) {
            Alert.alert('Screen Time', 'Screen Time is only available on iOS.');
            return;
          }
          // Present the system picker so the user chooses which apps to watch;
          // thresholds are registered on dismiss (same flow as onboarding).
          setStPickerVisible(true);
        } catch {
          Alert.alert('Screen Time', "Screen Time setup didn't complete. You can try again later.");
        }
      }
      return;
    }
    // Special handling for Google Calendar OAuth
    if (toolId === 'gcalendar') {
      if (connectedTools.includes('gcalendar')) {
        // Disconnect
        try {
          await calendarAPI.disconnect();
          const newTools = connectedTools.filter(t => t !== 'gcalendar');
          setConnectedTools(newTools);
          await updatePreference('connected_tools', newTools);
          Alert.alert('Disconnected', 'Google Calendar has been disconnected.');
        } catch (error) {
          console.error('Failed to disconnect calendar:', error);
          Alert.alert('Error', 'Failed to disconnect Google Calendar.');
        }
      } else {
        // Connect with OAuth
        await initiateGoogleCalendarOAuth();
      }
    } else if (toolId === 'microsoft365') {
      if (connectedTools.includes('microsoft365')) {
        try {
          await microsoftAPI.disconnect();
          const newTools = connectedTools.filter(t => t !== 'microsoft365');
          setConnectedTools(newTools);
          await updatePreference('connected_tools', newTools);
          Alert.alert('Disconnected', 'Microsoft 365 has been disconnected.');
        } catch (error) {
          Alert.alert('Error', 'Failed to disconnect Microsoft 365.');
        }
      } else {
        try {
          const { auth_url } = await microsoftAPI.getAuthUrl();
          const result = await WebBrowser.openAuthSessionAsync(
            auth_url,
            'koan://microsoft-connected'
          );
          if (result.type !== 'success') {
            return; // user cancelled — stay on this screen
          }
          if (result.type === 'success') {
            const status = await microsoftAPI.getStatus();
            if (status.connected) {
              const newTools = [...connectedTools, 'microsoft365'];
              setConnectedTools(newTools);
              await updatePreference('connected_tools', newTools);
              Alert.alert('Connected', 'Microsoft 365 connected successfully.');
            }
          }
        } catch (error) {
          Alert.alert('Error', 'Could not connect Microsoft 365. Please try again.');
        }
      }
    } else {
      // Mock for other tools
      const newTools = connectedTools.includes(toolId)
        ? connectedTools.filter(t => t !== toolId)
        : [...connectedTools, toolId];

      setConnectedTools(newTools);
      await updatePreference('connected_tools', newTools);

      const tool = WORKPLACE_TOOLS.find(t => t.id === toolId);
      if (newTools.includes(toolId) && tool) {
        Alert.alert('Connected', `${tool.name} connected. Full integration coming soon.`);
      }
    }
  };

  const initiateGoogleCalendarOAuth = async () => {
    try {
      const { auth_url } = await calendarAPI.getAuthUrl();
      const result = await WebBrowser.openAuthSessionAsync(
        auth_url,
        'koan://calendar-connected'
      );
      if (result.type !== 'success') {
        return; // user cancelled — stay on this screen
      }
      if (result.type === 'success') {
        const status = await calendarAPI.getStatus();
        if (status.connected) {
          const newTools = [...connectedTools, 'gcalendar'];
          setConnectedTools(newTools);
          await updatePreference('connected_tools', newTools);
          await updatePreference('google_calendar_connected', true);
          Alert.alert('Connected', 'Google Calendar connected successfully.');
        }
      }
    } catch (error) {
      console.error('OAuth error:', error);
      Alert.alert('Error', 'Could not connect Google Calendar. Please try again.');
    }
  };

  const changeMicroMode = async (mode: string) => {
    setMicroMode(mode);
    await updatePreference('micro_mode', mode);
  };

  const handleScreenTimePickerDismiss = async () => {
    setStPickerVisible(false);
    if (!hasScreenTimeSelection()) return;
    const ok = await registerScreenTimeThresholds();
    if (ok) {
      const newTools = connectedTools.includes('screen_time')
        ? connectedTools
        : [...connectedTools, 'screen_time'];
      setConnectedTools(newTools);
      await updatePreference('connected_tools', newTools);
    }
  };

  

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
      router.replace('/');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This will permanently delete your account and all data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await authAPI.deleteAccount();
              await logout();
            } catch (error) {
              console.error('Delete account error:', error);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Subscription Info */}
        {subscription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <TouchableOpacity style={styles.card} onPress={() => router.push('/subscription')}>
              <View style={styles.subscriptionRow}>
                <View>
                  <Text style={styles.subscriptionStatus}>
                    {subscription.status === 'trial' ? 'Free Trial' : 'Active'}
                  </Text>
                  {subscription.status === 'trial' && (
                    <Text style={styles.subscriptionDetail}>
                      {subscription.trial_days_remaining} days remaining
                    </Text>
                  )}
                </View>
                <View style={styles.subscriptionRight}>
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceText}>${subscription.monthly_price}/mo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#3A3A3A" style={{ opacity: 0.4 }} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Workplace Connections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workplace Connections</Text>
          
          {WORKPLACE_TOOLS.map((tool) => (
            <View key={tool.id} style={styles.card}>
              <View style={styles.toolRow}>
                <View style={styles.toolLeft}>
                  <View style={[styles.toolIcon, { backgroundColor: tool.color + '20' }]}>
                    <Ionicons name={tool.icon as any} size={20} color={tool.color} />
                  </View>
                  <Text style={styles.toolName}>{tool.name}</Text>
                </View>
                <Switch
                  value={connectedTools.includes(tool.id)}
                  onValueChange={() => toggleWorkplaceTool(tool.id)}
                  trackColor={{ false: '#E6E6E4', true: '#5FAD8E' }}
                  thumbColor={'#FFFFFF'}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Micro-Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Micro-Mode</Text>
          <Text style={styles.sectionSubtitle}>
            Choose how nudges adapt to your work style
          </Text>
          
          {MICRO_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.value}
              style={[
                styles.card,
                microMode === mode.value && styles.cardSelected,
              ]}
              onPress={() => changeMicroMode(mode.value)}
            >
              <View style={styles.modeRow}>
                <View style={styles.modeContent}>
                  <Text style={styles.modeName}>{mode.name}</Text>
                  <Text style={styles.modeDescription}>{mode.description}</Text>
                </View>
                {microMode === mode.value && (
                  <Ionicons name="checkmark-circle" size={24} color="#5FAD8E" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notification Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Preferences</Text>
          
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/nudge-settings')}
          >
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceLeft}>
                <Text style={styles.preferenceName}>Nudges & Notifications</Text>
                <Text style={styles.preferenceDescription}>
                  Nudge style, quiet hours, and more
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#3A3A3A" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/anchor-actions')}
          >
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceLeft}>
                <Text style={styles.preferenceName}>Anchor Actions</Text>
                <Text style={styles.preferenceDescription}>
                  Set 1-3 daily behavioral anchors
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#3A3A3A" />
            </View>
          </TouchableOpacity>
          
          <View style={styles.card}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceLeft}>
                <Text style={styles.preferenceName}>Push Notifications</Text>
                <Text style={styles.preferenceDescription}>
                  Receive nudges as notifications
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: '#E6E6E4', true: '#5FAD8E' }}
                thumbColor={'#FFFFFF'}
              />
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.card}>
            <Text style={styles.accountEmail}>{user?.email}</Text>
            <Text style={styles.accountName}>{user?.name}</Text>
          </View>

          <TouchableOpacity style={styles.card} onPress={handleLogout}>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceName}>Sign out</Text>
              <Ionicons name="chevron-forward" size={20} color="#3A3A3A" style={{ opacity: 0.4 }} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => Linking.openURL('https://rust-trip-647.notion.site/Koan-Privacy-Policy-34554cbb0f5c80118eecf04e73d94e26?pvs=74')}
          >
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceName}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={20} color="#3A3A3A" style={{ opacity: 0.4 }} />
            </View>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.disclaimerText}>
              Koan is not a medical device and does not provide medical advice.
            </Text>
          </View>

          <TouchableOpacity style={styles.card} onPress={handleDeleteAccount}>
            <View style={styles.preferenceRow}>
              <Text style={styles.deleteAccountText}>Delete account</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Branding */}
        <View style={styles.brandingSection}>
          <Text style={styles.appName}>Koan</Text>
          <Text style={styles.tagline}>
            Everything you need to know, you already know.
          </Text>
        </View>
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Out</Text>
            <Text style={styles.modalMessage}>Are you sure you want to log out?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalLogoutButton}
                onPress={confirmLogout}
              >
                <Text style={styles.modalLogoutText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Screen Time — system FamilyActivityPicker. The library persists the
          selection under SCREEN_TIME_SELECTION_ID; on dismiss we register the
          threshold events against it. */}
      {stPickerVisible && Platform.OS === 'ios' && (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={SCREEN_TIME_SELECTION_ID}
          includeEntireCategory
          headerText="Choose the apps that pull at your attention"
          footerText="Koan only learns when a limit is crossed — never the detail."
          onDismissRequest={handleScreenTimePickerDismiss}
          style={{ position: 'absolute', width: 0, height: 0 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDFA',
  },
  header: {
    padding: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.6,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  cardSelected: {
    borderColor: '#5FAD8E',
    backgroundColor: '#D9F7EB',
  },
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subscriptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subscriptionStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  subscriptionDetail: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  priceBadge: {
    backgroundColor: '#E6E6E4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toolLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolName: {
    fontSize: 15,
    color: '#3A3A3A',
    fontWeight: '500',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeContent: {
    flex: 1,
  },
  modeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  anchorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  anchorText: {
    fontSize: 15,
    color: '#3A3A3A',
    flex: 1,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preferenceLeft: {
    flex: 1,
    marginRight: 16,
  },
  preferenceName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  accountEmail: {
    fontSize: 15,
    color: '#3A3A3A',
    marginBottom: 4,
  },
  accountName: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  deleteAccountText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E53535',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.6,
  },
  brandingSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FAFDFA',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3A3A3A',
  },
  modalLogoutButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#EA4335',
    alignItems: 'center',
  },
  modalLogoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
