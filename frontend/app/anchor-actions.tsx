import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { preferencesAPI } from '../services/api';
import DateTimePicker from '@react-native-community/datetimepicker';

const MAX_ANCHORS = 5;

const SUGGESTED_ANCHORS: Array<{ label: string; notificationBody: string }> = [
  {
    label: 'Close one loop',
    notificationBody: 'One thing finished is better than three things started.',
  },
  {
    label: 'Deep breath',
    notificationBody: 'Three slow breaths. Nothing else needs to happen for the next thirty seconds.',
  },
  {
    label: 'Journal',
    notificationBody: 'A few lines on paper. Some thoughts only become real once they\'re written.',
  },
  {
    label: 'Stand and stretch',
    notificationBody: 'A minute of stretching. The body has been still longer than it wants.',
  },
  {
    label: 'Look away from screens',
    notificationBody: 'A minute away from the screen. The eyes need it more than you notice.',
  },
  {
    label: 'Clear one notification',
    notificationBody: 'One notification cleared. The queue is always shorter than it looks.',
  },
  {
    label: 'Finish one small task',
    notificationBody: 'One small thing done. The list gets lighter one item at a time.',
  },
  {
    label: 'Drink water',
    notificationBody: 'A glass of water. Your body has been quiet about it — and it shouldn\'t have to ask.',
  },
  {
    label: '5 minute meditation',
    notificationBody: 'Five minutes of stillness. The world won\'t drift while you breathe.',
  },
  {
    label: 'Morning walk',
    notificationBody: 'A few steps before the day starts. The light is different at this hour.',
  },
  {
    label: 'Read for 10 minutes',
    notificationBody: 'Ten minutes with a book, before the noise. The pages will wait, but the morning won\'t.',
  },
  {
    label: 'Phone-free meal',
    notificationBody: 'One meal, just the meal. The phone will still be there after.',
  },
];

interface AnchorAction {
  text: string;
  time: string;
  enabled: boolean;
  notificationBody?: string;
}

export default function AnchorActionsScreen() {
  const router = useRouter();
  const [anchorActions, setAnchorActions] = useState<AnchorAction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<number | null>(null);
  const [tempTime, setTempTime] = useState(new Date());

  useEffect(() => {
    loadAnchorActions();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadAnchorActions().then(() => rescheduleAllAnchors());
    }, [])
  );

  const scheduleAnchorNotification = async (index: number, action: AnchorAction) => {
    await cancelAnchorNotification(index);
    const [hours, minutes] = action.time.split(':').map(Number);

    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Koan',
        body: action.notificationBody || action.text,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledTime,
        repeats: false,
      },
    });

    await AsyncStorage.setItem(`anchor_notification_${index}`, id);
    await AsyncStorage.setItem(`anchor_time_${index}`, action.time);
  };

  const rescheduleAllAnchors = async () => {
    for (let i = 0; i < anchorActions.length; i++) {
      const action = anchorActions[i];
      if (!action.enabled || !action.text.trim()) continue;
      const storedTime = await AsyncStorage.getItem(`anchor_time_${i}`);
      if (!storedTime) continue;
      const [hours, minutes] = storedTime.split(':').map(Number);
      const now = new Date();
      const next = new Date();
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      await cancelAnchorNotification(i);
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'Koan', body: action.notificationBody || action.text },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: next,
          repeats: false,
        },
      });
      await AsyncStorage.setItem(`anchor_notification_${i}`, id);
    }
  };

  const cancelAnchorNotification = async (index: number) => {
    const id = await AsyncStorage.getItem(`anchor_notification_${index}`);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(`anchor_notification_${index}`);
    }
  };

  const loadAnchorActions = async () => {
    try {
      const prefs = await preferencesAPI.get();
      console.log('Loaded preferences:', prefs);
      if (prefs.anchor_actions && Array.isArray(prefs.anchor_actions) && prefs.anchor_actions.length > 0) {
        console.log('Setting anchor actions from prefs:', prefs.anchor_actions);
        setAnchorActions(prefs.anchor_actions);
      } else {
        console.log('No saved anchor actions, using defaults');
      }
    } catch (error) {
      console.error('Failed to load anchor actions:', error);
    }
  };

  const updateAnchorAction = (index: number, field: keyof AnchorAction, value: any) => {
    const updated = [...anchorActions];
    updated[index] = { ...updated[index], [field]: value };
    setAnchorActions(updated);
  };

  const selectSuggestion = (index: number, suggestion: { label: string; notificationBody: string }) => {
    const updated = [...anchorActions];
    updated[index] = { ...updated[index], text: suggestion.label, notificationBody: suggestion.notificationBody, enabled: true };
    setAnchorActions(updated);
    setShowSuggestions(null);
  };

  const saveAnchorActions = async () => {
    try {
      // Filter out empty or disabled actions
      const validActions = anchorActions.filter(a => a.text.trim() && a.enabled);

      if (validActions.length === 0) {
        Alert.alert('No Anchors', 'Please add at least one anchor action.');
        return;
      }

      // Schedule or cancel local notifications for each slot
      for (let i = 0; i < anchorActions.length; i++) {
        const action = anchorActions[i];
        if (action.enabled && action.text.trim()) {
          await scheduleAnchorNotification(i, action);
        } else {
          await cancelAnchorNotification(i);
        }
      }

      console.log('SAVING anchor_actions:', anchorActions);
      const result = await preferencesAPI.update({ anchor_actions: anchorActions });
      console.log('SAVE RESULT:', result);
      Alert.alert('Saved', 'Your anchor actions have been saved.');
      router.back();
    } catch (error) {
      console.error('Failed to save anchor actions:', error);
      Alert.alert('Error', 'Failed to save anchor actions. Please try again.');
    }
  };

  const addAnchorAction = () => {
    if (anchorActions.length >= MAX_ANCHORS) return;
    setAnchorActions(prev => [...prev, { text: '', time: '09:00', enabled: true }]);
  };

  const getEnabledCount = () => {
    return anchorActions.filter(a => a.enabled && a.text.trim()).length;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3A3A3A" />
        </TouchableOpacity>
        <Text style={styles.title}>Anchor Actions</Text>
        <TouchableOpacity onPress={saveAnchorActions} style={styles.saveButton}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Description */}
        <View style={styles.descriptionCard}>
          <Ionicons name="boat-outline" size={32} color="#5FAD8E" />
          <Text style={styles.descriptionTitle}>What are Anchor Actions?</Text>
          <Text style={styles.descriptionText}>
            Simple, repeatable actions that ground you throughout the day.
            Set up to 5 gentle reminders for moments that matter to you.
          </Text>
          <Text style={styles.enabledCount}>
            {getEnabledCount()}/{MAX_ANCHORS} anchors active
          </Text>
        </View>

        {/* Anchor Actions List */}
        {anchorActions.map((anchor, index) => (
          <View key={index} style={styles.anchorCard}>
            <View style={styles.anchorHeader}>
              <Text style={styles.anchorNumber}>Anchor {index + 1}</Text>
              <TouchableOpacity
                style={[styles.toggle, anchor.enabled && styles.toggleActive]}
                onPress={() => updateAnchorAction(index, 'enabled', !anchor.enabled)}
              >
                <Ionicons 
                  name={anchor.enabled ? 'checkmark-circle' : 'ellipse-outline'} 
                  size={24} 
                  color={anchor.enabled ? '#5FAD8E' : '#3A3A3A'} 
                />
              </TouchableOpacity>
            </View>

            {/* Action Input */}
            <TouchableOpacity
              style={styles.inputContainer}
              onPress={() => setShowSuggestions(showSuggestions === index ? null : index)}
              activeOpacity={0.7}
            >
              <Text style={[styles.inputText, !anchor.text && styles.inputPlaceholder]}>
                {anchor.text || 'Choose an action...'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#3A3A3A" />
            </TouchableOpacity>

            {/* Suggestions Dropdown */}
            {showSuggestions === index && (
              <View style={styles.suggestionsContainer}>
                {SUGGESTED_ANCHORS.map((suggestion, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionItem}
                    onPress={() => selectSuggestion(index, suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Time Picker */}
            {anchor.enabled && (
              <View style={styles.timeContainer}>
                <Ionicons name="time-outline" size={20} color="#5FAD8E" />
                <Text style={styles.timeLabel}>Daily reminder at</Text>
                <TouchableOpacity
                  style={styles.timeInput}
                  onPress={() => {
                    const [hours, minutes] = anchor.time.split(':');
                    const date = new Date();
                    date.setHours(parseInt(hours), parseInt(minutes));
                    setTempTime(date);
                    setShowTimePicker(index);
                  }}
                >
                  <Text style={styles.timeText}>{anchor.time}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Add Anchor Row */}
        {anchorActions.length < MAX_ANCHORS && (
          <TouchableOpacity style={styles.addAnchorRow} onPress={addAnchorAction}>
            <Ionicons name="add" size={20} color="#5FAD8E" />
            <Text style={styles.addAnchorText}>Add anchor</Text>
          </TouchableOpacity>
        )}

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#5FAD8E" />
          <Text style={styles.infoText}>
            You'll receive a quiet nudge at the set time each day. These are independent 
            from pattern-based nudges.
          </Text>
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set reminder time</Text>
            <DateTimePicker
              value={tempTime}
              mode="time"
              is24Hour={true}
              display="spinner"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  setTempTime(selectedDate);
                  if (showTimePicker !== null) {
                    const hours = selectedDate.getHours().toString().padStart(2, '0');
                    const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
                    updateAnchorAction(showTimePicker, 'time', `${hours}:${minutes}`);
                  }
                }
              }}
            />
            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={() => setShowTimePicker(null)}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3A3A3A',
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    padding: 4,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5FAD8E',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
  },
  descriptionCard: {
    backgroundColor: '#D9F7EB',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  descriptionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3A3A3A',
    marginTop: 12,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 15,
    color: '#3A3A3A',
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  enabledCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5FAD8E',
  },
  anchorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6E6E4',
  },
  anchorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  anchorNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  toggle: {
    padding: 4,
  },
  toggleActive: {
    // Active state handled by icon
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: '#3A3A3A',
  },
  inputPlaceholder: {
    color: '#999',
  },
  suggestionsContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E4',
  },
  suggestionText: {
    fontSize: 15,
    color: '#3A3A3A',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeLabel: {
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  timeInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
  },
  addAnchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E6E6E4',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  addAnchorText: {
    fontSize: 14,
    color: '#5FAD8E',
    fontWeight: '500',
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#3A3A3A',
    opacity: 0.8,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 24,
    width: '85%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3A',
    marginBottom: 8,
  },
  modalDoneButton: {
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
    backgroundColor: '#5FAD8E',
    borderRadius: 12,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
