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
  Easing,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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

// Best ElevenLabs voices 2025 - Multilingual, Realistic, Fast (Flash model compatible)
const VOICE_OPTIONS = [
  // Top Female Voices (Most Natural & Expressive)
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', desc: 'Warm & Conversational', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', desc: 'Soft & Friendly', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', desc: 'Sweet & Caring', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Female', desc: 'Youthful & Bright', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', gender: 'Female', desc: 'Energetic & Fun', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  // Top Male Voices
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'Male', desc: 'Clear & Confident', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Male', desc: 'Deep & Warm', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Male', desc: 'Casual & Relaxed', languages: ['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ar'] },
];

const VoiceChatScreen = () => {
  const { user, signOut, getToken } = useAuth();
  const [authToken, setAuthToken] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [tempLanguage, setTempLanguage] = useState('en');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM'); // Rachel - Best conversational
  const [tempVoice, setTempVoice] = useState('21m00Tcm4TlvDq8ikWAM');
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
    ttsProvider,
  } = useLiveKit(authToken);

  // Edge lighting animation (OnePlus style)
  const edgeAnim = useRef(new Animated.Value(0)).current;
  const edgeOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Edge lighting animation when speaking
  useEffect(() => {
    if (isConnected && (isUserSpeaking || isAgentSpeaking)) {
      // Start edge animation
      Animated.parallel([
        Animated.timing(edgeOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.timing(edgeAnim, {
            toValue: 1,
            duration: 3000, // Slower, smoother animation
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ),
      ]).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else if (isConnected) {
      // Idle state - subtle glow
      Animated.timing(edgeOpacity, {
        toValue: 0.3,
        duration: 500,
        useNativeDriver: true,
      }).start();

      pulseAnim.setValue(1);
    } else {
      // Not connected
      Animated.timing(edgeOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isUserSpeaking, isAgentSpeaking, isConnected]);


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
        <View style={styles.headerRight}>
          {isConnected && (
            <View style={[
              styles.ttsProviderBadge,
              ttsProvider === 'Google' ? styles.ttsProviderGoogle : styles.ttsProviderElevenLabs
            ]}>
              <Text style={styles.ttsProviderText}>
                {ttsProvider === 'Google' ? 'Google TTS' : 'ElevenLabs'}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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

      {/* Main Content */}
      {isConnected ? (
        <View style={styles.connectedContainer}>
          {/* Edge Lighting Effect - Top */}
          <Animated.View
            style={[
              styles.edgeTop,
              {
                opacity: edgeOpacity,
                backgroundColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                shadowColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                transform: [{ scaleX: pulseAnim }],
              },
            ]}
          />

          {/* Edge Lighting Effect - Left */}
          <Animated.View
            style={[
              styles.edgeLeft,
              {
                opacity: edgeOpacity,
                backgroundColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                shadowColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                transform: [{ scaleY: pulseAnim }],
              },
            ]}
          />

          {/* Edge Lighting Effect - Right */}
          <Animated.View
            style={[
              styles.edgeRight,
              {
                opacity: edgeOpacity,
                backgroundColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                shadowColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                transform: [{ scaleY: pulseAnim }],
              },
            ]}
          />

          {/* Edge Lighting Effect - Bottom */}
          <Animated.View
            style={[
              styles.edgeBottom,
              {
                opacity: edgeOpacity,
                backgroundColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                shadowColor: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#8b5cf6',
                transform: [{ scaleX: pulseAnim }],
              },
            ]}
          />

          {/* Status Header */}
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>Soulmate</Text>
            <Text style={[
              styles.statusIndicator,
              { color: isUserSpeaking ? '#8b5cf6' : isAgentSpeaking ? '#ec4899' : '#666' }
            ]}>
              {isUserSpeaking ? 'Listening...' : isAgentSpeaking ? 'Speaking...' : 'Connected'}
            </Text>
          </View>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyChat}>Start speaking to begin the conversation...</Text>
            ) : (
              messages.map((msg, index) => (
                <View
                  key={index}
                  style={[
                    styles.messageBubble,
                    msg.role === 'user' ? styles.userMessage : styles.aiMessage,
                  ]}
                >
                  <Text style={styles.messageText}>{msg.text}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.disconnectedContainer}>
          <View style={styles.disconnectedOrb}>
            <Text style={styles.disconnectedEmoji}>💜</Text>
          </View>
          <Text style={styles.disconnectedTitle}>Soulmate</Text>
          <Text style={styles.disconnectedSubtitle}>Tap to start conversation</Text>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
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
              <Text style={styles.callButtonIcon}>📞</Text>
            )}
          </TouchableOpacity>
        </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ttsProviderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ttsProviderElevenLabs: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
  },
  ttsProviderGoogle: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
  },
  ttsProviderText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
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
  // Connected container with edge lighting
  connectedContainer: {
    flex: 1,
    position: 'relative',
  },
  // Edge lighting styles (OnePlus style)
  edgeTop: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  edgeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  edgeLeft: {
    position: 'absolute',
    top: 20,
    left: 0,
    bottom: 20,
    width: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  edgeRight: {
    position: 'absolute',
    top: 20,
    right: 0,
    bottom: 20,
    width: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  // Status header
  statusHeader: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },
  statusIndicator: {
    fontSize: 14,
    marginTop: 4,
  },
  // Chat container
  chatContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  chatContent: {
    paddingVertical: 8,
    paddingBottom: 20,
  },
  emptyChat: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  // Disconnected state styles
  disconnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  disconnectedOrb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a2a4e',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  disconnectedEmoji: {
    fontSize: 48,
  },
  disconnectedTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
    marginTop: 24,
    letterSpacing: 1,
  },
  disconnectedSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
});

export default VoiceChatScreen;
