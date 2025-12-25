# LiveKit Voice Agent

Real-time voice AI assistant using LiveKit, Deepgram, Gemini, and ElevenLabs.

## Setup

### 1. Get LiveKit Credentials

**Option A: LiveKit Cloud (Recommended)**
1. Go to https://cloud.livekit.io
2. Create a new project
3. Copy your API Key and API Secret

**Option B: Self-hosted**
```bash
# Install LiveKit server
brew install livekit

# Run locally
livekit-server --dev
# Default: ws://localhost:7880, API key: devkey, Secret: secret
```

### 2. Configure Environment

Update `../.env` with your LiveKit credentials:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

### 3. Install Dependencies

```bash
cd livekit-agent
npm install
```

### 4. Run the Agent

```bash
# Run both token server and agent
npm run dev

# Or run separately:
npm run server  # Token server on :3001
npm run agent   # LiveKit agent
```

### 5. Run the Frontend

```bash
cd ..
npm install
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React App (LiveKitVoiceChat)                            │   │
│  │  - Captures microphone audio                             │   │
│  │  - Plays agent audio                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ WebRTC (UDP)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LiveKit Server                              │
│  - Routes audio streams                                          │
│  - Manages rooms and participants                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LiveKit Agent (Node.js)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Deepgram   │→ │   Gemini    │→ │      ElevenLabs         │  │
│  │   (STT)     │  │   (LLM)     │  │        (TTS)            │  │
│  │  ~200ms     │  │  ~400ms     │  │       ~100ms            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Latency Comparison

| Approach | End-to-End Latency |
|----------|-------------------|
| REST APIs (Legacy) | 1.5 - 4 seconds |
| WebSocket | 0.5 - 1.2 seconds |
| **LiveKit (WebRTC)** | **0.5 - 0.9 seconds** |

## Files

- `agent.js` - Voice pipeline agent (STT → LLM → TTS)
- `server.js` - Token server for client authentication
- `package.json` - Dependencies and scripts
