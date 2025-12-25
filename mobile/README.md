# Soulmate AI - Mobile App

React Native (Expo) mobile app for Soulmate AI voice assistant.

## Prerequisites

- Node.js 18+
- Xcode (for iOS)
- Android Studio (for Android)
- Expo CLI: `npm install -g expo-cli`

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your Firebase credentials (same as web app)

4. Make sure the backend services are running:
```bash
# In the livekit-agent directory
node server.js  # Token server on port 3001
node agent.js   # LiveKit agent
```

## Running on iOS Simulator

```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Run on iOS simulator
npx expo run:ios
```

## Running on Android Emulator

```bash
# Generate native Android project
npx expo prebuild --platform android

# Run on Android emulator
npx expo run:android
```

## Development with Expo Go (Limited)

Note: LiveKit requires native modules, so Expo Go has limited functionality.
For full functionality, use development builds.

```bash
npx expo start
```

## Architecture

The mobile app connects to the same backend as the web app:
- Uses same Firebase project for authentication
- Connects to same token server (port 3001)
- Connects to same LiveKit room
- LiveKit agent handles both web and mobile clients

## Folder Structure

```
mobile/
├── App.js                 # Main entry point
├── src/
│   ├── config/
│   │   └── firebase.js    # Firebase configuration
│   ├── contexts/
│   │   └── AuthContext.js # Authentication context
│   ├── hooks/
│   │   └── useLiveKit.js  # LiveKit hook
│   └── screens/
│       ├── LoginScreen.js # Login UI
│       └── VoiceChatScreen.js # Main voice chat UI
├── app.json               # Expo configuration
└── .env                   # Environment variables (not committed)
```
