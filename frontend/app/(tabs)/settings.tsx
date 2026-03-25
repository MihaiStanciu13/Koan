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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { preferencesAPI, subscriptionAPI } from '../../services/api';
import * as WebBrowser from 'expo-web-browser';

const WORKPLACE_TOOLS = [
  { id: 'gmail', name: 'Gmail', icon: 'mail-outline', color: '#EA4335' },
  { id: 'outlook', name: 'Outlook', icon: 'mail-outline', color: '#0078D4' },
  { id: 'slack', name: 'Slack', icon: 'chatbubble-outline', color: '#4A154B' },
  { id: 'teams', name: 'Microsoft Teams', icon: 'people-outline', color: '#6264A7' },
  { id: 'gcalendar', name: 'Google Calendar', icon: 'calendar-outline', color: '#4285F4' },
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
    value: 'travel',
    name: 'Travel Mode',
    description: 'Ultra-rare, essential nudges only',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [preferences, setPreferences] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Local states
  const [whisperMode, setWhisperMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [microMode, setMicroMode] = useState('standard');
  const [anchorAction, setAnchorAction] = useState('close one loop');
  
  

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [prefs, sub] = await Promise.all([
        preferencesAPI.get(),
        subscriptionAPI.getStatus(),
      ]);

      setPreferences(prefs);
      setSubscription(sub);
      
      setWhisperMode(prefs.whisper_mode || false);
      setNotificationsEnabled(prefs.notification_enabled ?? true);
      setConnectedTools(prefs.connected_tools || []);
      setMicroMode(prefs.micro_mode || 'standard');
      setAnchorAction(prefs.anchor_action || 'close one loop');
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

  const toggleWhisperMode = async () => {
    const newValue = !whisperMode;
    setWhisperMode(newValue);
    await updatePreference('whisper_mode', newValue);
  };

  const toggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    await updatePreference('notification_enabled', newValue);
  };

  const toggleWorkplaceTool = async (toolId: string) => {
    // Special handling for Google Calendar OAuth
    if (toolId === 'gcalendar') {
      if (connectedTools.includes('gcalendar')) {
        // Disconnect
        try {
          await api.delete('/integrations/calendar/disconnect');
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
    } else {
      // Mock for other tools
      const newTools = connectedTools.includes(toolId)
        ? connectedTools.filter(t => t !== toolId)
        : [...connectedTools, toolId];
      
      setConnectedTools(newTools);
      await updatePreference('connected_tools', newTools);
      
      Alert.alert(
        'Mock Connection',
        `${toolId} ${newTools.includes(toolId) ? 'connected' : 'disconnected'}. This is a mock integration for MVP testing.`
      );
    }
  };

  const initiateGoogleCalendarOAuth = async () => {
    try {
      const redirectUri = 'https://focus-coach-8.preview.emergentagent.com';
      const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly')}&` +
        `access_type=offline&` +
        `prompt=consent`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        
        if (code) {
          // Exchange code for tokens (backend should handle this)
          await handleOAuthCallback(code);
        }
      }
    } catch (error) {
      console.error('OAuth error:', error);
      Alert.alert('Error', 'Failed to connect Google Calendar. Please try again.');
    }
  };

  const handleOAuthCallback = async (code: string) => {
    try {
      // For MVP, we'll store a mock token
      // In production, backend should exchange code for tokens
      const mockToken = 'mock_google_calendar_token';
      
      await api.post('/integrations/calendar/connect', {
        access_token: mockToken,
        refresh_token: 'mock_refresh_token',
      });
      
      const newTools = [...connectedTools, 'gcalendar'];
      setConnectedTools(newTools);
      await updatePreference('connected_tools', newTools);
      
      Alert.alert('Connected', 'Google Calendar connected successfully!');
    } catch (error) {
      console.error('Failed to save calendar tokens:', error);
      Alert.alert('Error', 'Failed to complete Google Calendar connection.');
    }
  };

  const changeMicroMode = async (mode: string) => {
    setMicroMode(mode);
    await updatePreference('micro_mode', mode);
  };

  

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            // Navigation will be handled automatically by the index.tsx state machine
            // No manual navigation needed - the useEffect will detect user === null
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to log out. Please try again.');
          }
        },
      },
    ]);
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
            <View style={styles.card}>
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
                <View style={styles.priceBadge}>
                  <Text style={styles.priceText}>${subscription.monthly_price}/mo</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Workplace Connections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workplace Connections</Text>
          <Text style={styles.sectionSubtitle}>
            Connect tools to detect patterns (mocked for MVP)
          </Text>
          
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
                  trackColor={{ false: '#E6E6E4', true: '#A8D7F0' }}
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
                  <Ionicons name="checkmark-circle" size={24} color="#A8D7F0" />
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
                <Text style={styles.preferenceName}>Whisper Mode</Text>
                <Text style={styles.preferenceDescription}>
                  Ultra-rare, low-frequency nudges
                </Text>
              </View>
              <Switch
                value={whisperMode}
                onValueChange={toggleWhisperMode}
                trackColor={{ false: '#E6E6E4', true: '#A8D7F0' }}
                thumbColor={'#FFFFFF'}
              />
            </View>
          </View>

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
                trackColor={{ false: '#E6E6E4', true: '#A8D7F0' }}
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

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
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
    borderColor: '#A8D7F0',
    backgroundColor: '#D9F7EB',
  },
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EA4335',
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
});
