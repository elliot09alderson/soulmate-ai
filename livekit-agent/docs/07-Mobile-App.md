---
title: Mobile App (React Native)
tags:
  - mobile
  - react-native
  - expo
  - livekit-client
  - ui
  - animations
---

# Mobile App (React Native)

Cross-platform mobile app using Expo and LiveKit.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | React Native (Expo) |
| LiveKit SDK | @livekit/react-native |
| Audio | @livekit/react-native, expo-av |
| Navigation | React Navigation |
| Animations | React Native Animated API |
| State | React Hooks (useState, useRef) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP                                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ App.js                                               │    │
│  │ └── Navigation Container                             │    │
│  │     └── Stack Navigator                              │    │
│  │         ├── HomeScreen                               │    │
│  │         └── VoiceChatScreen ◄── Main voice UI        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ hooks/                                               │    │
│  │ └── useLiveKit.js        ◄── LiveKit connection      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ services/                                            │    │
│  │ └── auth.js              ◄── Firebase auth           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## useLiveKit Hook

Central hook for LiveKit connection management.

### State

```javascript
const [connectionState, setConnectionState] = useState('disconnected');
const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
const [isUserSpeaking, setIsUserSpeaking] = useState(false);
const [userAudioLevel, setUserAudioLevel] = useState(0);
const [agentAudioLevel, setAgentAudioLevel] = useState(0);
const [messages, setMessages] = useState([]);
const [error, setError] = useState(null);
```

### Connection Flow

```javascript
const connect = async (roomName, settings) => {
  // 1. Configure audio session (iOS)
  await AudioSession.configureAudio({
    ios: { defaultOutput: 'speaker' }
  });
  await AudioSession.startAudioSession();

  // 2. Get token from server
  const { token, url } = await getToken(roomName, settings);

  // 3. Create and configure room
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  // 4. Set up event handlers
  room.on(RoomEvent.ConnectionStateChanged, handleConnectionState);
  room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
  room.on(RoomEvent.DataReceived, handleDataReceived);
  room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);

  // 5. Connect and enable microphone
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
};
```

### Token Request

```javascript
const getToken = async (roomName, settings) => {
  const response = await fetch(`${TOKEN_SERVER_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      roomName,
      voiceId: settings.voiceId,
      language: settings.language,
      languageName: settings.languageName,
    }),
  });

  return response.json(); // { token, url, userId }
};
```

---

## VoiceChatScreen

Main voice conversation UI.

### UI States

```
┌─────────────────────────────────────────────────────────────┐
│                    UI STATES                                 │
│                                                              │
│  ┌───────────────────┐    ┌───────────────────────────┐     │
│  │ DISCONNECTED      │    │ CONNECTED                  │     │
│  │                   │    │                            │     │
│  │  ┌─────────────┐  │    │  ┌────────────────────┐   │     │
│  │  │ Settings    │  │    │  │ Edge Lighting      │   │     │
│  │  │ - Voice     │  │    │  │ Animation          │   │     │
│  │  │ - Language  │  │    │  │                    │   │     │
│  │  └─────────────┘  │    │  │  ┌──────────────┐  │   │     │
│  │                   │    │  │  │ Transcript   │  │   │     │
│  │  ┌─────────────┐  │    │  │  │ Messages     │  │   │     │
│  │  │ Start Call  │  │    │  │  └──────────────┘  │   │     │
│  │  │ Button      │  │    │  │                    │   │     │
│  │  └─────────────┘  │    │  │ [Mic] [End Call]  │   │     │
│  │                   │    │  └────────────────────┘   │     │
│  └───────────────────┘    └───────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Voice Selection

```javascript
const VOICE_OPTIONS = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', desc: 'Warm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', desc: 'Soft' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', desc: 'Sweet' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'Female', desc: 'Expressive' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'Female', desc: 'Natural' },
];
```

### Language Selection

```javascript
const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
];
```

---

## Edge Lighting Animation

OnePlus-style animated borders when connected.

### Animation Setup

```javascript
const edgeAnimation = useRef(new Animated.Value(0)).current;

useEffect(() => {
  if (isConnected) {
    Animated.loop(
      Animated.sequence([
        Animated.timing(edgeAnimation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(edgeAnimation, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }
}, [isConnected]);
```

### Animated Border Style

```javascript
const borderColor = edgeAnimation.interpolate({
  inputRange: [0, 0.5, 1],
  outputRange: ['#ff6b6b', '#4ecdc4', '#ff6b6b'],
});

<Animated.View style={{
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 2,
  backgroundColor: borderColor,
}} />
```

---

## Transcript Display

Shows conversation messages in real-time.

```javascript
// Receive transcript via data channel
room.on(RoomEvent.DataReceived, (payload) => {
  const message = JSON.parse(new TextDecoder().decode(payload));

  if (message.type === 'transcript') {
    setMessages(prev => [...prev, {
      role: message.role,  // 'user' or 'model'
      text: message.text,
      timestamp: Date.now(),
    }]);
  }
});
```

### Render Messages

```javascript
<FlatList
  data={messages}
  renderItem={({ item }) => (
    <View style={[
      styles.message,
      item.role === 'user' ? styles.userMessage : styles.aiMessage
    ]}>
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  )}
/>
```

---

## Audio Level Visualization

Shows speaking indicators based on audio levels.

```javascript
room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
  const userSpeaker = speakers.find(s => s.identity !== 'ai-agent');
  const agentSpeaker = speakers.find(s => s.identity === 'ai-agent');

  setIsUserSpeaking(!!userSpeaker);
  setIsAgentSpeaking(!!agentSpeaker);

  setUserAudioLevel(userSpeaker?.audioLevel || 0);
  setAgentAudioLevel(agentSpeaker?.audioLevel || 0);
});
```

---

## app.json Configuration

```json
{
  "expo": {
    "name": "Soulmate",
    "slug": "soulmate-ai",
    "ios": {
      "bundleIdentifier": "com.soulmate.ai",
      "infoPlist": {
        "NSMicrophoneUsageDescription": "For voice conversations",
        "UIBackgroundModes": ["audio", "voip"]
      }
    },
    "android": {
      "package": "com.soulmate.ai",
      "permissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS"
      ]
    },
    "plugins": [
      "expo-dev-client",
      ["@livekit/react-native-expo-plugin", {
        "android": { "audioType": "communication" }
      }],
      ["expo-av", {
        "microphonePermission": "Allow microphone for voice"
      }]
    ]
  }
}
```

---

## File Structure

```
mobile/
├── App.js                 # Entry point
├── app.json               # Expo config
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js
│   │   └── VoiceChatScreen.js  # Main voice UI
│   ├── hooks/
│   │   └── useLiveKit.js       # LiveKit connection
│   ├── services/
│   │   └── auth.js             # Firebase auth
│   └── components/
│       └── ...
└── assets/
    └── ...
```

---

## Running the App

```bash
# Install dependencies
cd mobile
npm install

# iOS (requires prebuild)
npx expo prebuild
cd ios && pod install && cd ..
npx expo run:ios

# Android
npx expo run:android
```

---

## Related

- [[01-Architecture]] - System overview
- [[02-Voice-Pipeline]] - Backend voice processing

#mobile #react-native #expo #livekit-client #ui #animations
