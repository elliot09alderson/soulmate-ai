import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Phone, PhoneOff, ChevronDown } from 'lucide-react';
import { useLiveKit } from '../hooks/useLiveKit';
import { useAuth } from '../contexts/AuthContext';
import { useElevenLabs } from '../hooks/useElevenLabs';
import { useLanguage } from '../hooks/useTranslation';
import Visualizer from './Visualizer';
import './VoiceChat.css';

const LiveKitVoiceChat = () => {
  const { getToken } = useAuth();
  const [authToken, setAuthToken] = useState(null);

  // Voice selector
  const {
    voices,
    selectedVoiceId,
    setSelectedVoiceId,
    setSelectedLanguage: setElevenLabsLanguage,
    loadingVoices
  } = useElevenLabs();

  // Language selector
  const {
    selectedLanguage,
    setSelectedLanguage,
    currentLanguage,
    supportedLanguages,
  } = useLanguage();

  // Get Firebase auth token on mount
  useEffect(() => {
    const fetchToken = async () => {
      const token = await getToken();
      setAuthToken(token);
    };
    fetchToken();
  }, [getToken]);

  // Sync language with ElevenLabs for voice filtering
  useEffect(() => {
    setElevenLabsLanguage(selectedLanguage);
  }, [selectedLanguage, setElevenLabsLanguage]);

  const {
    connect,
    disconnect,
    toggleMute,
    connectionState,
    isConnected,
    isConnecting,
    isAgentSpeaking,
    messages,
    error,
    userId,
  } = useLiveKit(authToken);

  const [isMuted, setIsMuted] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const [showPermissionPopup, setShowPermissionPopup] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check if permission was already granted on mount
  useEffect(() => {
    const checkExistingPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
          setPermissionGranted(true);
        }
      } catch (err) {
        // Permissions API not supported, will check on connect
      }
    };
    checkExistingPermission();
  }, []);

  // Request microphone permission
  const requestMicrophonePermission = async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - stop the stream immediately
      stream.getTracks().forEach(track => track.stop());
      setPermissionGranted(true);
      setShowPermissionPopup(false);
      // Now proceed to connect
      proceedToConnect();
    } catch (err) {
      console.error('Microphone permission error:', err);
      if (err.name === 'NotFoundError') {
        setPermissionError('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Microphone access was denied. Please allow access in your browser settings.');
      } else {
        setPermissionError('Could not access microphone. Please check your device and try again.');
      }
    }
  };

  // Proceed to connect after permission is granted
  const proceedToConnect = async () => {
    setDeviceError(null);
    await connect('soulmate-room', {
      voiceId: selectedVoiceId,
      language: selectedLanguage,
      languageName: currentLanguage?.name || 'English',
    });
  };

  const handleConnect = async () => {
    if (isConnected) {
      await disconnect();
      setDeviceError(null);
    } else {
      // If permission already granted, connect directly
      if (permissionGranted) {
        proceedToConnect();
      } else {
        // Show permission popup
        setPermissionError(null);
        setShowPermissionPopup(true);
      }
    }
  };

  const handleCancelPermission = () => {
    setShowPermissionPopup(false);
    setPermissionError(null);
  };

  const handleMuteToggle = () => {
    const newMutedState = toggleMute();
    setIsMuted(newMutedState);
  };

  const getStatusText = () => {
    if (deviceError) return deviceError;
    if (error) return error; // Show the actual error message
    if (isConnecting) return 'Connecting...';
    if (isConnected) {
      if (isAgentSpeaking) return 'Speaking...';
      return 'Listening...';
    }
    return 'Tap to connect';
  };

  const hasError = error || deviceError;

  return (
    <div className="voice-chat-container">
      {/* Settings Row */}
      <div className="settings-row">
        {/* Language Selector */}
        <div className="setting-item">
          <label htmlFor="language-select">Language:</label>
          <div className="select-wrapper">
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isConnected}
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native} ({lang.name})
                </option>
              ))}
            </select>
            <ChevronDown className="select-icon" />
          </div>
        </div>

        {/* Voice Selector */}
        <div className="setting-item">
          <label htmlFor="voice-select">Voice:</label>
          <div className="select-wrapper">
            <select
              id="voice-select"
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              disabled={loadingVoices || isConnected}
            >
              {loadingVoices ? (
                <option>Loading voices...</option>
              ) : (
                voices.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} {voice.labels?.accent ? `(${voice.labels.accent})` : ''}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="select-icon" />
          </div>
        </div>
      </div>

      <div className="livekit-badge">
        <span className="badge-text">LiveKit</span>
        <span className={`badge-dot ${isConnected ? 'connected' : ''}`}></span>
      </div>

      <div className="chat-history">
        {messages.length === 0 && isConnected && (
          <div className="empty-state">
            Say hello...
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-label">
              {msg.role === 'user' ? 'You' : 'Soulmate'}
            </div>
            <div className="message-bubble">
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="controls">
        <Visualizer active={isConnected && !isMuted} />

        <div className="buttons-row">
          <button
            className={`mode-button ${isConnected ? 'active' : ''}`}
            onClick={handleConnect}
            disabled={isConnecting}
            title={isConnected ? 'End Call' : 'Start Call'}
          >
            {isConnecting ? (
              <Loader2 className="icon spin" />
            ) : isConnected ? (
              <PhoneOff className="icon" />
            ) : (
              <Phone className="icon" />
            )}
          </button>

          {isConnected && (
            <button
              className={`mic-button ${isMuted ? '' : 'recording'}`}
              onClick={handleMuteToggle}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <MicOff className="icon" />
              ) : (
                <Mic className="icon" />
              )}
            </button>
          )}
        </div>

        <p className={`hint ${hasError ? 'error' : ''}`}>{getStatusText()}</p>

        <div className="latency-info">
          <small>
            WebRTC • ~500ms latency • Real-time streaming
          </small>
        </div>
      </div>

      {/* Microphone Permission Popup */}
      {showPermissionPopup && (
        <div className="permission-overlay">
          <div className="permission-popup">
            <div className="permission-icon">
              <Mic />
            </div>
            <h3>Microphone Access Required</h3>
            <p>
              To have a voice conversation, we need access to your microphone.
              Click "Allow" when your browser asks for permission.
            </p>

            {permissionError && (
              <div className="permission-error">
                {permissionError}
              </div>
            )}

            <div className="permission-buttons">
              <button
                className="permission-btn secondary"
                onClick={handleCancelPermission}
              >
                Cancel
              </button>
              <button
                className="permission-btn primary"
                onClick={requestMicrophonePermission}
              >
                {permissionError ? 'Try Again' : 'Allow Microphone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveKitVoiceChat;
