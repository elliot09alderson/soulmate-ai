import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
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

const VoiceChatScreen = () => {
  const { user, signOut, getToken } = useAuth();
  const [authToken, setAuthToken] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isMuted, setIsMuted] = useState(false);
  const scrollViewRef = useRef(null);

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
    messages,
    error,
  } = useLiveKit(authToken);

  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage);

  const handleConnect = async () => {
    if (isConnected) {
      await disconnect();
    } else {
      await connect('soulmate-room', {
        language: selectedLanguage,
        languageName: currentLanguage?.name || 'English',
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
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedLanguage}
              onValueChange={setSelectedLanguage}
              style={styles.picker}
              dropdownIconColor="#fff"
              enabled={!isConnected}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <Picker.Item
                  key={lang.code}
                  label={`${lang.native} (${lang.name})`}
                  value={lang.code}
                  color="#fff"
                />
              ))}
            </Picker>
          </View>
        </View>
      </View>

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
        {/* Visualizer placeholder */}
        <View style={styles.visualizer}>
          {isConnected && (
            <View style={styles.visualizerBars}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.visualizerBar,
                    (isAgentSpeaking || !isMuted) && styles.visualizerBarActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.callButton, isConnected && styles.callButtonActive]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.callButtonIcon}>{isConnected ? '📞' : '📱'}</Text>
            )}
          </TouchableOpacity>

          {isConnected && (
            <TouchableOpacity
              style={[styles.muteButton, isMuted && styles.muteButtonMuted]}
              onPress={handleMuteToggle}
            >
              <Text style={styles.muteButtonIcon}>{isMuted ? '🔇' : '🎤'}</Text>
            </TouchableOpacity>
          )}
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
  pickerWrapper: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  picker: {
    color: '#fff',
    height: 50,
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
    height: 50,
    justifyContent: 'center',
    marginBottom: 16,
  },
  visualizerBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  visualizerBar: {
    width: 4,
    height: 20,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  visualizerBarActive: {
    backgroundColor: '#8b5cf6',
    height: 30,
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
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a2a4e',
  },
  callButtonActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderColor: '#8b5cf6',
  },
  callButtonIcon: {
    fontSize: 28,
  },
  muteButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  muteButtonMuted: {
    backgroundColor: 'rgba(100, 100, 100, 0.2)',
    borderColor: '#666',
  },
  muteButtonIcon: {
    fontSize: 24,
  },
  statusText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
  },
});

export default VoiceChatScreen;
