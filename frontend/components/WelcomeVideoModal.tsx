import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WelcomeVideoModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function WelcomeVideoModal({ visible, onClose }: WelcomeVideoModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#3A3A3A" />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="play-circle-outline" size={48} color="#5FAD8E" />
            <Text style={styles.title}>Welcome to Koan</Text>
            <Text style={styles.subtitle}>Here's what to expect</Text>
          </View>

          {/* Mock Video Placeholder */}
          <View style={styles.videoPlaceholder}>
            <Ionicons name="play-circle" size={80} color="#FFFFFF" />
            <Text style={styles.videoText}>Video Coming Soon</Text>
          </View>

          {/* Key Points */}
          <View style={styles.keyPoints}>
            <View style={styles.keyPoint}>
              <Ionicons name="notifications-off-outline" size={20} color="#5FAD8E" />
              <Text style={styles.keyPointText}>Silent nudges at the right moments</Text>
            </View>
            <View style={styles.keyPoint}>
              <Ionicons name="analytics-outline" size={20} color="#5FAD8E" />
              <Text style={styles.keyPointText}>No tracking, no dashboards</Text>
            </View>
            <View style={styles.keyPoint}>
              <Ionicons name="leaf-outline" size={20} color="#5FAD8E" />
              <Text style={styles.keyPointText}>Gentle patterns, not rigid rules</Text>
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity style={styles.ctaButton} onPress={onClose}>
            <Text style={styles.ctaText}>Got It</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            You can always review this in Settings
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FAFDFA',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3A3A3A',
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#3A3A3A',
    opacity: 0.7,
  },
  videoPlaceholder: {
    backgroundColor: '#D9F7EB',
    borderRadius: 12,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  videoText: {
    fontSize: 16,
    color: '#3A3A3A',
    marginTop: 12,
    fontWeight: '600',
  },
  keyPoints: {
    marginBottom: 24,
    gap: 16,
    alignItems: 'center',
  },
  keyPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  keyPointText: {
    fontSize: 15,
    color: '#3A3A3A',
    flex: 1,
  },
  ctaButton: {
    backgroundColor: '#5FAD8E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    fontSize: 12,
    color: '#3A3A3A',
    opacity: 0.6,
    textAlign: 'center',
  },
});
