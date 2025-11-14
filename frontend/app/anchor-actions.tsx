import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { preferencesAPI } from '../services/api';

const SUGGESTED_ANCHORS = [
  'Close one loop',
  'Take three deep breaths',
  'Write down one thought',
  'Stand and stretch for 30 seconds',
  'Look away from screens for 1 minute',
  'Clear one notification',
  'Finish one small task',
  'Drink a glass of water',
];

interface AnchorAction {
  text: string;
  time: string;
  enabled: boolean;
}

export default function AnchorActionsScreen() {
  const router = useRouter();
  const [anchorActions, setAnchorActions] = useState<AnchorAction[]>([
    { text: '', time: '09:00', enabled: false },
    { text: '', time: '14:00', enabled: false },
    { text: '', time: '18:00', enabled: false },
  ]);
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null);

  useEffect(() => {
    loadAnchorActions();
  }, []);

  const loadAnchorActions = async () => {
    try {
      const prefs = await preferencesAPI.get();
      if (prefs.anchor_actions && Array.isArray(prefs.anchor_actions)) {
        setAnchorActions(prefs.anchor_actions);
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

  const selectSuggestion = (index: number, suggestion: string) => {
    updateAnchorAction(index, 'text', suggestion);
    updateAnchorAction(index, 'enabled', true);
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

      await preferencesAPI.update({ anchor_actions: anchorActions });
      Alert.alert('Saved', 'Your anchor actions have been saved.');
      router.back();
    } catch (error) {
      console.error('Failed to save anchor actions:', error);
      Alert.alert('Error', 'Failed to save anchor actions. Please try again.');
    }
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
          <Ionicons name="anchor-outline" size={32} color="#5FAD8E" />
          <Text style={styles.descriptionTitle}>What are Anchor Actions?</Text>
          <Text style={styles.descriptionText}>
            Simple, repeatable actions that ground you throughout the day. 
            Set 1-3 gentle reminders for moments that matter to you.
          </Text>
          <Text style={styles.enabledCount}>
            {getEnabledCount()}/3 anchors active
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
            >
              <TextInput
                style={styles.input}
                placeholder="Choose or type an action..."
                value={anchor.text}
                onChangeText={(text) => updateAnchorAction(index, 'text', text)}
                editable={anchor.enabled}
                placeholderTextColor="#999"
              />
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
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Time Picker */}
            {anchor.enabled && (
              <View style={styles.timeContainer}>
                <Ionicons name="time-outline" size={20} color="#5FAD8E" />
                <Text style={styles.timeLabel}>Daily reminder at</Text>
                <TextInput
                  style={styles.timeInput}
                  value={anchor.time}
                  onChangeText={(text) => updateAnchorAction(index, 'time', text)}
                  placeholder="HH:MM"
                  placeholderTextColor="#999"
                />
              </View>
            )}
          </View>
        ))}

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#5FAD8E" />
          <Text style={styles.infoText}>
            You'll receive a quiet nudge at the set time each day. These are independent 
            from pattern-based nudges.
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
  input: {
    flex: 1,
    fontSize: 16,
    color: '#3A3A3A',
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
});
