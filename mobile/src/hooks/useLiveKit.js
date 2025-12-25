import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
} from 'livekit-client';
import { registerGlobals, AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

// Register LiveKit globals for React Native
registerGlobals();

// Configure audio session for iOS
const configureAudioSession = async () => {
  if (Platform.OS === 'ios') {
    try {
      await AudioSession.configureAudio({
        android: {
          preferredOutputList: ['speaker'],
        },
        ios: {
          defaultOutput: 'speaker',
        },
      });
      await AudioSession.startAudioSession();
      console.log('[LiveKit] Audio session configured');
    } catch (err) {
      console.error('[LiveKit] Audio session error:', err);
    }
  }
};

const TOKEN_SERVER_URL = process.env.EXPO_PUBLIC_TOKEN_SERVER_URL || 'http://localhost:3001';

export const useLiveKit = (authToken = null) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);

  const roomRef = useRef(null);
  const audioTrackRef = useRef(null);
  const authTokenRef = useRef(authToken);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  const getToken = async (roomName, settings = {}) => {
    try {
      const headers = { 'Content-Type': 'application/json' };

      if (authTokenRef.current) {
        headers['Authorization'] = `Bearer ${authTokenRef.current}`;
      }

      console.log('[LiveKit] Requesting token with settings:', settings);

      const response = await fetch(`${TOKEN_SERVER_URL}/api/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          roomName,
          voiceId: settings.voiceId,
          language: settings.language,
          languageName: settings.languageName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get token');
      }

      const data = await response.json();
      setUserId(data.userId);
      console.log('[LiveKit] Got token for user:', data.userId);
      return data;
    } catch (err) {
      console.error('[LiveKit] Token error:', err);
      throw err;
    }
  };

  const connect = useCallback(async (roomName = 'soulmate-room', settings = {}) => {
    try {
      setError(null);
      setConnectionState('connecting');

      // Configure audio before connecting
      await configureAudioSession();

      const { token, url } = await getToken(roomName, settings);
      console.log('[LiveKit] Connecting to:', url);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        audioOutput: {
          deviceId: 'default',
        },
      });

      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('[LiveKit] Connection state:', state);
        setConnectionState(state);
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[LiveKit] Track subscribed:', track.kind, participant.identity);

        if (track.kind === Track.Kind.Audio && participant.identity === 'ai-agent') {
          // Agent audio track
          setIsAgentSpeaking(true);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('[LiveKit] Track unsubscribed');
        if (participant.identity === 'ai-agent') {
          setIsAgentSpeaking(false);
        }
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload));
          console.log('[LiveKit] Message received:', message);

          if (message.type === 'transcript') {
            setMessages((prev) => [...prev, {
              role: message.role,
              text: message.text,
              timestamp: Date.now(),
            }]);
          }
        } catch (err) {
          console.error('[LiveKit] Data parse error:', err);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] Disconnected');
        setConnectionState('disconnected');
        cleanup();
      });

      // Connect to room
      await room.connect(url, token);
      console.log('[LiveKit] Connected to room');

      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log('[LiveKit] Microphone enabled');

      setConnectionState('connected');
    } catch (err) {
      console.error('[LiveKit] Connection error:', err);
      setError(err.message);
      setConnectionState('disconnected');
    }
  }, []);

  const cleanup = useCallback(async () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setIsAgentSpeaking(false);

    // Stop audio session on iOS
    if (Platform.OS === 'ios') {
      try {
        await AudioSession.stopAudioSession();
      } catch (err) {
        console.error('[LiveKit] Stop audio session error:', err);
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    await cleanup();
    setConnectionState('disconnected');
    setMessages([]);
  }, [cleanup]);

  const toggleMute = useCallback(async () => {
    if (roomRef.current) {
      const participant = roomRef.current.localParticipant;
      const isMuted = !participant.isMicrophoneEnabled;
      await participant.setMicrophoneEnabled(isMuted);
      return !isMuted;
    }
    return false;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    connect,
    disconnect,
    toggleMute,
    connectionState,
    isConnected: connectionState === ConnectionState.Connected,
    isConnecting: connectionState === 'connecting',
    isAgentSpeaking,
    messages,
    error,
    userId,
  };
};
