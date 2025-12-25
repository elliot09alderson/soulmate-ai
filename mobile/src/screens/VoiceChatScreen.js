import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../contexts/AuthContext';
import { useLiveKit } from '../hooks/useLiveKit';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
];

// Multilingual voices from ElevenLabs that support multiple languages
const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'Female', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'Male', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'Male', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'Male', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'Female', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Female', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt'] },
];

const VoiceChatScreen = () => {
  const { user, signOut, getToken } = useAuth();
  const [authToken, setAuthToken] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [tempLanguage, setTempLanguage] = useState('en');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('XB0fDUnXU5powFXDhCwa'); // Charlotte
  const [tempVoice, setTempVoice] = useState('XB0fDUnXU5powFXDhCwa');
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const scrollViewRef = useRef(null);

  // Get available voices for selected language
  const availableVoices = VOICE_OPTIONS.filter(v => v.languages.includes(selectedLanguage));
  const currentVoice = VOICE_OPTIONS.find(v => v.id === selectedVoice);

  // Get auth token on mount
  useEffect(() => {
    const fetchToken = async () => {
      const token = await getToken();
      setAuthToken(token);
    };
    fetchToken();
  }, [getToken]);

  const {
    connect,
    disconnect,
    toggleMute,
    isConnected,
    isConnecting,
    isAgentSpeaking,
    isUserSpeaking,
    userAudioLevel,
    agentAudioLevel,
    messages,
    error,
  } = useLiveKit(authToken);

  // Animated values for visualizer bars
  const barAnimations = useRef([...Array(7)].map(() => new Animated.Value(0.3))).current;

  // Animate bars based on audio level
  useEffect(() => {
    if (isConnected && (isUserSpeaking || isAgentSpeaking)) {
      const level = isUserSpeaking ? userAudioLevel : agentAudioLevel;
      const normalizedLevel = Math.min(level * 3, 1); // Amplify and cap at 1

      barAnimations.forEach((anim, index) => {
        // Create variation for each bar
        const variation = 0.3 + (Math.random() * 0.4);
        const targetHeight = 0.3 + (normalizedLevel * variation);

        Animated.spring(anim, {
          toValue: targetHeight,
          friction: 4,
          tension: 100,
          useNativeDriver: false,
        }).start();
      });
    } else {
      // Reset to idle state
      barAnimations.forEach((anim) => {
        Animated.spring(anim, {
          toValue: 0.3,
          friction: 4,
          tension: 50,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isUserSpeaking, isAgentSpeaking, userAudioLevel, agentAudioLevel, isConnected]);

  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage);

  const handleConnect = async () => {
    if (isConnected) {
      await disconnect();
    } else {
      await connect('soulmate-room', {
        language: selectedLanguage,
        languageName: currentLanguage?.name || 'English',
        voiceId: selectedVoice,
      });
    }
  };

  const handleMuteToggle = async () => {
    const newMutedState = await toggleMute();
    setIsMuted(!newMutedState);
  };

  const handleSignOut = async () => {
    if (isConnected) {
      await disconnect();
    }
    await signOut();
  };

  // Auto-scroll to bottom
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>SOULMATE</Text>
          <Text style={styles.subtitle}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Settings */}
      <View style={styles.settingsRow}>
        <View style={styles.pickerContainer}>
          <Text style={styles.label}>Language</Text>
          <TouchableOpacity
            style={[styles.pickerButton, isConnected && styles.pickerButtonDisabled]}
            onPress={() => {
              if (!isConnected) {
                setTempLanguage(selectedLanguage);
                setShowLanguagePicker(true);
              }
            }}
            disabled={isConnected}
          >
            <Text style={[styles.pickerButtonText, isConnected && styles.pickerButtonTextDisabled]}>
              {currentLanguage?.native} ({currentLanguage?.name})
            </Text>
            <Text style={styles.pickerArrow}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerContainer}>
          <Text style={styles.label}>Voice</Text>
          <TouchableOpacity
            style={[styles.pickerButton, isConnected && styles.pickerButtonDisabled]}
            onPress={() => {
              if (!isConnected) {
                setTempVoice(selectedVoice);
                setShowVoicePicker(true);
              }
            }}
            disabled={isConnected}
          >
            <Text style={[styles.pickerButtonText, isConnected && styles.pickerButtonTextDisabled]}>
              {currentVoice?.name} ({currentVoice?.gender})
            </Text>
            <Text style={styles.pickerArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Language</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedLanguage(tempLanguage);
                  setShowLanguagePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={tempLanguage}
              onValueChange={setTempLanguage}
              style={styles.modalPicker}
              itemStyle={styles.pickerItem}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <Picker.Item
                  key={lang.code}
                  label={`${lang.native} (${lang.name})`}
                  value={lang.code}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Voice Picker Modal */}
      <Modal
        visible={showVoicePicker}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowVoicePicker(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Voice</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedVoice(tempVoice);
                  setShowVoicePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={tempVoice}
              onValueChange={setTempVoice}
              style={styles.modalPicker}
              itemStyle={styles.pickerItem}
            >
              {availableVoices.map((voice) => (
                <Picker.Item
                  key={voice.id}
                  label={`${voice.name} (${voice.gender})`}
                  value={voice.id}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Connection Badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>LiveKit</Text>
        <View style={[styles.badgeDot, isConnected && styles.badgeDotConnected]} />
      </View>

      {/* Chat Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && isConnected && (
          <Text style={styles.emptyText}>Say hello...</Text>
        )}
        {messages.map((msg, idx) => (
          <View
            key={idx}
            style={[
              styles.messageBubble,
              msg.role === 'user' ? styles.userMessage : styles.aiMessage,
            ]}
          >
            <Text style={styles.messageRole}>
              {msg.role === 'user' ? 'You' : 'Soulmate'}
            </Text>
            <Text style={styles.messageText}>{msg.text}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {/* Audio Visualizer */}
        <View style={styles.visualizer}>
          {isConnected && (
            <View style={styles.visualizerBars}>
              {barAnimations.map((anim, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.visualizerBar,
                    {
                      height: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [15, 50],
                      }),
                      backgroundColor: isUserSpeaking
                        ? '#8b5cf6' // Purple when user speaks
                        : isAgentSpeaking
                        ? '#22c55e' // Green when agent speaks
                        : '#333', // Gray when idle
                    },
                  ]}
                />
              ))}
            </View>
          )}
          {isConnected && (
            <Text style={styles.speakingIndicator}>
              {isUserSpeaking ? '🎤 You' : isAgentSpeaking ? '🤖 AI' : '...'}
            </Text>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          {/* Mic Button - only when connected */}
          {isConnected && (
            <TouchableOpacity
              style={[styles.micButton, isMuted && styles.micButtonMuted]}
              onPress={handleMuteToggle}
            >
              <Text style={styles.micButtonIcon}>{isMuted ? '🔇' : '🎤'}</Text>
            </TouchableOpacity>
          )}

          {/* Call/End Button */}
          <TouchableOpacity
            style={[
              styles.callButton,
              isConnected ? styles.endCallButton : styles.startCallButton,
            ]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.callButtonIcon}>
                {isConnected ? '📞' : '📞'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Placeholder for symmetry when connected */}
          {isConnected && <View style={styles.placeholderButton} />}
        </View>

        {/* Status */}
        <Text style={styles.statusText}>
          {isConnecting
            ? 'Connecting...'
            : isConnected
            ? isAgentSpeaking
              ? 'Speaking...'
              : 'Listening...'
            : 'Tap to connect'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  signOutButton: {
    padding: 8,
  },
  signOutText: {
    color: '#8b5cf6',
    fontSize: 14,
  },
  settingsRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerContainer: {
    marginBottom: 8,
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  pickerButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  pickerButtonDisabled: {
    opacity: 0.5,
  },
  pickerButtonTextDisabled: {
    color: '#888',
  },
  pickerArrow: {
    color: '#888',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modalCancel: {
    color: '#888',
    fontSize: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalDone: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
  modalPicker: {
    height: 200,
  },
  pickerItem: {
    color: '#fff',
    fontSize: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  badgeText: {
    color: '#666',
    fontSize: 12,
    marginRight: 6,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#444',
  },
  badgeDotConnected: {
    backgroundColor: '#22c55e',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 16,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: '#2a2a4e',
    alignSelf: 'flex-end',
  },
  aiMessage: {
    backgroundColor: '#1a1a2e',
    alignSelf: 'flex-start',
  },
  messageRole: {
    color: '#8b5cf6',
    fontSize: 10,
    marginBottom: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  errorContainer: {
    padding: 12,
    marginHorizontal: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  controls: {
    padding: 20,
    alignItems: 'center',
  },
  visualizer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  visualizerBars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
  },
  visualizerBar: {
    width: 6,
    borderRadius: 3,
  },
  speakingIndicator: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  callButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  startCallButton: {
    backgroundColor: '#1a1a2e',
    borderColor: '#8b5cf6',
  },
  endCallButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderColor: '#ef4444',
  },
  callButtonIcon: {
    fontSize: 28,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  micButtonMuted: {
    backgroundColor: 'rgba(100, 100, 100, 0.2)',
    borderColor: '#666',
  },
  micButtonIcon: {
    fontSize: 24,
  },
  placeholderButton: {
    width: 56,
    height: 56,
  },
  statusText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
  },
});

export default VoiceChatScreen;
