import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { preferencesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

type NudgeStyle = 'silent' | 'subtle' | 'time-sensitive';

export default function NudgeSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [nudgeStyle, setNudgeStyle] = useState<NudgeStyle>('silent');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState('23:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    loadNudgeSettings();
  }, []);

  const loadNudgeSettings = async () => {
    try {
      const prefs = await preferencesAPI.get();
      setNudgeStyle(prefs.nudge_style || 'silent');
      setQuietHoursEnabled(prefs.quiet_hours_enabled ?? true);
      setQuietHoursStart(prefs.quiet_hours_start || '23:00');
      setQuietHoursEnd(prefs.quiet_hours_end || '07:00');
    } catch (error) {
      console.error('Failed to load nudge settings:', error);
    }
  };

  const updateNudgeStyle = async (style: NudgeStyle) => {
    setNudgeStyle(style);
    try {
      await preferencesAPI.update({ nudge_style: style });
    } catch (error) {
      console.error('Failed to update nudge style:', error);
    }
  };

  const toggleQuietHours = async () => {
    const newValue = !quietHoursEnabled;
    setQuietHoursEnabled(newValue);
    try {
      await preferencesAPI.update({ quiet_hours_enabled: newValue });
    } catch (error) {
      console.error('Failed to update quiet hours:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3A3A3A" />
        </TouchableOpacity>
        <Text style={styles.title}>Nudges & Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Nudge Style Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nudge Style</Text>
          <Text style={styles.sectionSubtitle}>
            Choose how nudges appear to you
          </Text>

          {/* Silent (Recommended) */}
          <TouchableOpacity
            style={[
              styles.styleCard,
              nudgeStyle === 'silent' && styles.styleCardSelected,
            ]}
            onPress={() => updateNudgeStyle('silent')}
          >
            <View style={styles.styleLeft}>
              <Ionicons
                name="volume-off"
                size={24}
                color={nudgeStyle === 'silent' ? '#A8D7F0' : '#3A3A3A'}
              />
              <View style={styles.styleText}>
                <View style={styles.styleTitleRow}>
                  <Text style={[
                    styles.styleTitle,
                    nudgeStyle === 'silent' && styles.styleTitleSelected
                  ]}>
                    Silent
                  </Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>Recommended</Text>
                  </View>
                </View>
                <Text style={styles.styleDescription}>
                  Quiet appearance in notification center. No sound or vibration.
                </Text>
              </View>
            </View>
            {nudgeStyle === 'silent' && (
              <Ionicons name="checkmark-circle" size={24} color="#A8D7F0" />
            )}
          </TouchableOpacity>

          {/* Subtle Banner */}
          <TouchableOpacity
            style={[
              styles.styleCard,
              nudgeStyle === 'subtle' && styles.styleCardSelected,
            ]}
            onPress={() => updateNudgeStyle('subtle')}
          >
            <View style={styles.styleLeft}>
              <Ionicons
                name="notifications-outline"
                size={24}
                color={nudgeStyle === 'subtle' ? '#A8D7F0' : '#3A3A3A'}
              />
              <View style={styles.styleText}>
                <Text style={[
                  styles.styleTitle,
                  nudgeStyle === 'subtle' && styles.styleTitleSelected
                ]}>
                  Subtle Banner
                </Text>
                <Text style={styles.styleDescription}>
                  Silent banner that's slightly more visible. Still no sound.
                </Text>
              </View>
            </View>
            {nudgeStyle === 'subtle' && (
              <Ionicons name="checkmark-circle" size={24} color="#A8D7F0" />
            )}
          </TouchableOpacity>

          {/* Time-Sensitive */}
          <TouchableOpacity
            style={[
              styles.styleCard,
              nudgeStyle === 'time-sensitive' && styles.styleCardSelected,
            ]}
            onPress={() => updateNudgeStyle('time-sensitive')}
          >
            <View style={styles.styleLeft}>
              <Ionicons
                name="time-outline"
                size={24}
                color={nudgeStyle === 'time-sensitive' ? '#A8D7F0' : '#3A3A3A'}
              />
              <View style={styles.styleText}>
                <Text style={[
                  styles.styleTitle,
                  nudgeStyle === 'time-sensitive' && styles.styleTitleSelected
                ]}>
                  Time-Sensitive
                </Text>
                <Text style={styles.styleDescription}>
                  For morning intention and late-night boundary nudges only.
                </Text>
              </View>
            </View>
            {nudgeStyle === 'time-sensitive' && (
              <Ionicons name="checkmark-circle" size={24} color="#A8D7F0" />
            )}
          </TouchableOpacity>
        </View>

        {/* Quiet Hours Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quiet Hours</Text>
          <Text style={styles.sectionSubtitle}>
            No nudges during these hours
          </Text>

          <View style={styles.card}>
            <View style={styles.quietHoursRow}>
              <View style={styles.quietHoursLeft}>
                <Ionicons name="moon-outline" size={24} color="#A8D7F0" />
                <View style={styles.quietHoursText}>
                  <Text style={styles.quietHoursTitle}>Enable Quiet Hours</Text>
                  <Text style={styles.quietHoursTime}>
                    {quietHoursStart} – {quietHoursEnd}
                  </Text>
                </View>
              </View>
              <Switch
                value={quietHoursEnabled}
                onValueChange={toggleQuietHours}
                trackColor={{ false: '#E6E6E4', true: '#A8D7F0' }}
                thumbColor={'#FFFFFF'}
              />
            </View>
          </View>

          {quietHoursEnabled && (
            <Text style={styles.quietHoursNote}>
              Exception: Morning intention nudges (07:00-08:00) may still appear
            </Text>
          )}
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.aboutHeader}
            onPress={() => setShowAbout(!showAbout)}
          >
            <Text style={styles.sectionTitle}>About Koan Nudges</Text>
            <Ionicons
              name={showAbout ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#3A3A3A"
            />
          </TouchableOpacity>

          {showAbout && (
            <View style={styles.aboutCard}>
              <Text style={styles.aboutText}>
                Koan sends short, gentle notifications based on your patterns.
                {'\n\n'}
                They are always silent, private, and never contain personal data.
                {'\n\n'}
                Nudges are designed to help you realign with what you already know, not to interrupt or judge.
              </Text>
            </View>
          )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  headerSpacer: {
    width: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
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
    marginBottom: 16,
  },
  styleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E6E6E4',
  },
  styleCardSelected: {
    borderColor: '#A8D7F0',
    backgroundColor: '#D9F7EB',
  },
  styleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  styleText: {
    flex: 1,
  },
  styleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  styleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  styleTitleSelected: {
    color: '#3A3A3A',
  },
  recommendedBadge: {
    backgroundColor: '#A8D7F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  styleDescription: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  quietHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quietHoursLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  quietHoursText: {
    flex: 1,
  },
  quietHoursTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3A3A3A',
    marginBottom: 4,
  },
  quietHoursTime: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  quietHoursNote: {
    fontSize: 13,
    color: '#3A3A3A',
    opacity: 0.7,
    marginTop: 12,
    fontStyle: 'italic',
  },
  aboutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  aboutText: {
    fontSize: 14,
    color: '#3A3A3A',
    lineHeight: 22,
  },
});
