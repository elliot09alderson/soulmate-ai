import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalAudioTrack,
} from 'livekit-client';

const TOKEN_SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL || 'http://localhost:3001';

export const useLiveKit = (authToken = null) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);

  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const authTokenRef = useRef(authToken);

  // Update auth token ref when it changes
  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  // Get token from server with Firebase auth
  const getToken = async (roomName, settings = {}) => {
    try {
      const headers = { 'Content-Type': 'application/json' };

      // Add Firebase auth token if available
      if (authTokenRef.current) {
        headers['Authorization'] = `Bearer ${authTokenRef.current}`;
        console.log('[LiveKit] Using Firebase auth token');
      } else {
        console.log('[LiveKit] No auth token, using anonymous');
      }

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
      console.log('[LiveKit] Got token for user:', data.userId, 'with settings:', settings);
      return data;
    } catch (err) {
      console.error('[LiveKit] Token error:', err);
      throw err;
    }
  };

  // Connect to LiveKit room
  const connect = useCallback(async (roomName = 'voice-assistant', settings = {}) => {
    try {
      setError(null);
      setConnectionState('connecting');

      // Get token with voice/language settings
      const { token, url } = await getToken(roomName, settings);
      console.log('[LiveKit] Got token, connecting to:', url);

      // Create room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('[LiveKit] Connection state:', state);
        setConnectionState(state);
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[LiveKit] Track subscribed:', track.kind, participant.identity);

        if (track.kind === Track.Kind.Audio) {
          // Play agent audio - attach to DOM
          const audioElement = track.attach();
          audioElement.id = `audio-${participant.identity}`;
          audioElement.autoplay = true;
          audioElement.style.display = 'none';
          document.body.appendChild(audioElement);

          audioElement.play()
            .then(() => console.log('[LiveKit] Audio playing'))
            .catch((err) => console.error('[LiveKit] Audio play error:', err));

          // Track agent speaking state
          publication.on('muted', () => {
            console.log('[LiveKit] Agent muted');
            setIsAgentSpeaking(false);
          });
          publication.on('unmuted', () => {
            console.log('[LiveKit] Agent unmuted');
            setIsAgentSpeaking(true);
          });
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('[LiveKit] Track unsubscribed:', track.kind, participant.identity);
        const elements = track.detach();
        elements.forEach((el) => el.remove());
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload));
          console.log('[LiveKit] Data received:', message);

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

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit] Participant connected:', participant.identity);
      });

      // Connect to room
      await room.connect(url, token);
      console.log('[LiveKit] Connected to room:', room.name);

      // Check if microphone is available before attempting to create track
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');

        if (audioInputDevices.length === 0) {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }

        console.log('[LiveKit] Found audio devices:', audioInputDevices.length);
      } catch (enumErr) {
        console.warn('[LiveKit] Could not enumerate devices:', enumErr);
        // Continue anyway - the actual getUserMedia will fail if there's no device
      }

      // Create and publish local audio track
      const localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      localTrackRef.current = localTrack;
      await room.localParticipant.publishTrack(localTrack);
      console.log('[LiveKit] Local audio track published');

      setConnectionState('connected');

    } catch (err) {
      console.error('[LiveKit] Connection error:', err);

      // Provide user-friendly error messages for common issues
      let errorMessage = err.message;
      if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Microphone is in use by another application. Please close other apps using the microphone.';
      }

      setError(errorMessage);
      setConnectionState('disconnected');
    }
  }, []);

  // Cleanup function
  const cleanup = useCallback(async () => {
    // Stop local track first (don't unpublish - let disconnect handle it)
    if (localTrackRef.current) {
      try {
        localTrackRef.current.stop();
      } catch (e) {
        // Ignore
      }
      localTrackRef.current = null;
    }

    // Disconnect from room
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      roomRef.current = null;
    }

    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  // Disconnect from room
  const disconnect = useCallback(async () => {
    await cleanup();
    setConnectionState('disconnected');
    setMessages([]);
  }, [cleanup]);

  // Mute/unmute local audio
  const toggleMute = useCallback(() => {
    if (localTrackRef.current) {
      const isMuted = localTrackRef.current.isMuted;
      if (isMuted) {
        localTrackRef.current.unmute();
      } else {
        localTrackRef.current.mute();
      }
      return !isMuted;
    }
    return false;
  }, []);

  // Cleanup on unmount
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
    isConnecting: connectionState === ConnectionState.Connecting,
    isAgentSpeaking,
    isUserSpeaking,
    messages,
    error,
    room: roomRef.current,
    userId,
  };
};
