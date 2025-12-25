# LiveKit Voice Agent

Real-time voice AI assistant using LiveKit, Deepgram, Gemini, and ElevenLabs with **Barge-In** support for natural conversation interruptions.

## Features

- **Real-time Voice Pipeline**: Deepgram STT → Gemini LLM → ElevenLabs TTS
- **Barge-In Support**: Instantly stop AI and respond to new questions
- **Multi-language**: English, Hindi, Spanish, French, German support
- **RAG Memory**: Remembers past conversations using Firestore + Vertex AI embeddings
- **Web Search**: Free DuckDuckGo + Wikipedia search (no API key needed)
- **Voice Selection**: Multiple ElevenLabs voices with Flash model for low latency

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

Update `../.env` with your credentials:

```env
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Voice Pipeline
VITE_DEEPGRAM_API_KEY=your-deepgram-key
VITE_ELEVENLABS_API_KEY=your-elevenlabs-key
VITE_GEMINI_API_KEY=your-gemini-key

# Firebase (for memory)
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App / Browser                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React Native / React App                                │   │
│  │  - Captures microphone audio                             │   │
│  │  - Plays agent audio                                     │   │
│  │  - Edge lighting animations                              │   │
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
│                         ↓                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  RAG Pipeline                                             │   │
│  │  - Firestore (conversation storage)                       │   │
│  │  - Vertex AI Embeddings (semantic search)                 │   │
│  │  - Memory Archiver (fact extraction)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Barge-In (Interrupt Detection)

The agent supports natural conversation interruptions using an **AbortController pattern**:

### How It Works

1. **VAD Detection**: Ultra-aggressive voice detection (50 RMS threshold, ~20ms)
2. **Signal Phase**: When user speaks during AI speech, interrupt is detected
3. **Task Abort**: `AbortController.abort()` immediately cancels the ElevenLabs API call
4. **Context Re-shaping**: The LLM is told what was interrupted so it can respond naturally

### Key Code (`agent.js`)

```javascript
// Track active TTS streams per user
const activeStreams = new Map();

// Abort any active TTS stream instantly
function interruptAI(userId, currentResponse) {
  if (activeStreams.has(userId)) {
    activeStreams.get(userId).abort();
    activeStreams.delete(userId);
    interruptedResponses.set(userId, currentResponse);
    return true;
  }
  return false;
}

// TTS with AbortController
async function synthesizeSpeech(text, language, voiceId, isFiller, userId) {
  const controller = new AbortController();
  if (userId) activeStreams.set(userId, controller);

  const response = await axios.post(url, data, {
    signal: controller.signal  // Link abort signal
  });
}
```

### VAD Configuration

```javascript
const INTERRUPT_THRESHOLD = 50;        // Ultra low RMS (any audible speech)
const MIN_INTERRUPT_DURATION_MS = 50;  // Only 50ms of speech needed
const FRAMES_FOR_INTERRUPT = 1;        // Single frame triggers interrupt
```

## Voice Pipeline

### Speech-to-Text (Deepgram)
- Model: `nova-2` with smart formatting
- Languages: en-US, hi, es, fr, de, ja, ko, zh, pt, ar

### LLM (Gemini)
- Model: `gemini-2.0-flash-exp` for fast responses
- System prompt: Conversational "soulmate" persona
- RAG context: Past memories + active conversation window

### Text-to-Speech (ElevenLabs)
- Model: `eleven_flash_v2_5` (fastest, cheapest)
- Sentence chunking for faster first-byte response
- Available voices:
  - Rachel (21m00Tcm4TlvDq8ikWAM) - Warm & Conversational
  - Sarah (EXAVITQu4vr4xnSDxMaL) - Soft & Friendly
  - Charlotte (XB0fDUnXU5powFXDhCwa) - Sweet & Caring
  - Aria (9BWtsMINqrJLrRacOk9x) - Expressive
  - Laura (FGY2WhTYpPnrIDTdsKH5) - Natural

## Web Search

Free web search using DuckDuckGo + Wikipedia (no API key required):

```javascript
async function searchWeb(query, language) {
  // 1. DuckDuckGo Instant Answer API
  const ddg = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json' }
  });

  // 2. Wikipedia API fallback
  const wiki = await axios.get(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${query}`
  );
}
```

Triggered automatically for queries containing: "what is", "who is", "tell me about", "news", "latest", etc.

## Memory System (RAG)

### Components

1. **Firestore**: Stores all conversations
2. **Vertex AI Embeddings**: `text-embedding-004` for semantic search
3. **Memory Archiver**: Extracts facts from conversations every 20 messages

### Flow

```
User speaks → Save to Firestore → Extract embeddings → Store in memory
                                                            ↓
User asks question → Search memories → Hydrate LLM prompt → Respond
```

## Files

| File | Description |
|------|-------------|
| `agent.js` | Main voice pipeline agent (VAD, STT, LLM, TTS, Barge-In) |
| `server.js` | Token server for client authentication |
| `services/memory.js` | Firestore + embedding search |
| `services/archiver.js` | Fact extraction from conversations |
| `services/firebase.js` | Firebase initialization |
| `services/logger.js` | Colored console + file logging |

## Latency

| Component | Latency |
|-----------|---------|
| VAD Detection | ~20ms |
| Deepgram STT | ~200ms |
| Gemini LLM | ~400ms |
| ElevenLabs TTS (first byte) | ~100ms |
| **Total (first response)** | **~700ms** |

## Troubleshooting

### Agent not responding
- Check LiveKit credentials in `.env`
- Ensure token server is running on port 3001
- Check logs in `logs/agent-YYYY-MM-DD.log`

### Barge-in not working
- Increase microphone sensitivity in app settings
- Check VAD threshold (lower = more sensitive)
- Ensure `isSpeaking` flag is being set correctly

### TTS failing
- Verify ElevenLabs API key
- Check voice ID is valid
- Monitor API rate limits

## License

MIT
