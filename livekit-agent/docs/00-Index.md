---
title: Soulmate AI - Voice Assistant Documentation
tags:
  - index
  - overview
  - architecture
  - voice-ai
  - livekit
---

# Soulmate AI - Voice Assistant

> A real-time voice AI companion with memory, barge-in support, and natural conversation flow.

## Quick Navigation

| Document | Description |
|----------|-------------|
| [[01-Architecture]] | System overview and data flow |
| [[02-Voice-Pipeline]] | STT → LLM → TTS processing |
| [[03-Barge-In]] | Interrupt detection and handling |
| [[04-VAD-System]] | Voice Activity Detection |
| [[05-Memory-RAG]] | Conversation memory and retrieval |
| [[06-Web-Search]] | Free web search integration |
| [[07-Mobile-App]] | React Native frontend |
| [[08-Troubleshooting]] | Common issues and fixes |

---

## Tech Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                              │
│  React Native (Expo) + LiveKit Client SDK               │
└─────────────────────────────────────────────────────────┘
                         │
                         │ WebRTC
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  LIVEKIT SERVER                          │
│  Cloud-hosted WebRTC infrastructure                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   VOICE AGENT                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │
│  │ Deepgram  │→ │  Gemini   │→ │   ElevenLabs      │   │
│  │   STT     │  │   LLM     │  │      TTS          │   │
│  └───────────┘  └───────────┘  └───────────────────┘   │
│                       ↓                                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Firestore + Vertex AI (Memory/RAG)             │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Real-Time Voice Conversation
- **Problem**: Traditional REST APIs have 2-4 second latency
- **Solution**: WebRTC via LiveKit for sub-second response
- **Technology**: LiveKit, Deepgram Nova-2, ElevenLabs Flash

### 2. Barge-In (Interruption)
- **Problem**: AI keeps talking even when user interrupts
- **Solution**: AbortController pattern to cancel TTS mid-stream
- **Technology**: Custom VAD + AbortController + Context Re-shaping

### 3. Memory & Personalization
- **Problem**: AI forgets past conversations
- **Solution**: RAG pipeline with semantic search
- **Technology**: Firestore + Vertex AI Embeddings

### 4. Multi-Language Support
- **Problem**: Single language limits user base
- **Solution**: Language detection + localized responses
- **Technology**: Deepgram multi-lang + Gemini + ElevenLabs multilingual

---

## Latency Breakdown

| Phase | Technology | Latency |
|-------|------------|---------|
| Audio Capture | LiveKit WebRTC | ~10ms |
| VAD Detection | Custom RMS | ~20ms |
| Speech-to-Text | Deepgram Nova-2 | ~200ms |
| Memory Search | Vertex AI Embeddings | ~100ms |
| LLM Response | Gemini Flash | ~400ms |
| Text-to-Speech | ElevenLabs Flash | ~100ms |
| **Total** | - | **~700-800ms** |

---

## File Structure

```
livekit-agent/
├── agent.js              # Main voice pipeline
├── server.js             # Token server (auth)
├── services/
│   ├── firebase.js       # Firebase init
│   ├── memory.js         # Firestore + embeddings
│   ├── archiver.js       # Fact extraction
│   └── logger.js         # Colored logging
├── docs/                 # This documentation
└── logs/                 # Daily log files
```

---

## Related Tags

#voice-ai #livekit #deepgram #gemini #elevenlabs #rag #firebase #react-native
