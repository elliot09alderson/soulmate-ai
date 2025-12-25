---
title: Troubleshooting Guide
tags:
  - troubleshooting
  - debugging
  - errors
  - fixes
  - logs
---

# Troubleshooting Guide

Common issues and how to fix them.

---

## Quick Diagnostics

```bash
# Check if agent is running
ps aux | grep "node agent.js"

# Check token server
curl http://localhost:3001/health

# Check logs
tail -f livekit-agent/logs/agent-$(date +%Y-%m-%d).log

# Test LiveKit connection
# Visit: https://meet.livekit.io/?tab=custom
# Enter your LIVEKIT_URL and a test token
```

---

## Connection Issues

### Agent Not Connecting to Room

**Symptoms:**
- Mobile app shows "Connecting..." forever
- No participant events in agent logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Wrong LIVEKIT_URL | Check `.env` - should be `wss://...` |
| Invalid API credentials | Regenerate in LiveKit Cloud dashboard |
| Token server not running | Run `npm run server` |
| Firewall blocking | Allow outbound WSS connections |

<details>
<summary>Debug Steps</summary>

```bash
# 1. Check environment variables
cat .env | grep LIVEKIT

# 2. Test token generation
curl -X POST http://localhost:3001/api/token \
  -H "Content-Type: application/json" \
  -d '{"roomName": "test-room"}'

# 3. Check agent logs
grep "Connected to room" logs/agent-*.log
```

</details>

---

### Mobile App Can't Connect

**Symptoms:**
- "Failed to get token" error
- Network request failed

**Fixes:**

```javascript
// Check TOKEN_SERVER_URL in useLiveKit.js
const TOKEN_SERVER_URL = process.env.EXPO_PUBLIC_TOKEN_SERVER_URL
  || 'http://localhost:3001';

// For physical device, use your machine's IP:
// EXPO_PUBLIC_TOKEN_SERVER_URL=http://192.168.1.100:3001
```

---

## Voice Pipeline Issues

### No Transcription (STT Failing)

**Symptoms:**
- User speaks but no transcript appears
- "Empty transcript, skipping" in logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Invalid Deepgram key | Check `VITE_DEEPGRAM_API_KEY` |
| Wrong audio format | Ensure 48kHz, 16-bit PCM |
| VAD too sensitive | Raise `SILENCE_THRESHOLD` to 1000 |
| Audio too quiet | Check microphone permissions |

<details>
<summary>Debug Steps</summary>

```bash
# Check Deepgram API key
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token YOUR_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @test.wav

# Check VAD in logs
grep "Speech START" logs/agent-*.log
grep "Speech END" logs/agent-*.log
```

</details>

---

### AI Not Responding (LLM Failing)

**Symptoms:**
- Transcription works but no AI response
- "Pipeline failed" in logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Invalid Gemini key | Check `VITE_GEMINI_API_KEY` |
| Rate limit exceeded | Wait or upgrade quota |
| Context too long | Reduce `ACTIVE_WINDOW_SIZE` |

<details>
<summary>Debug Steps</summary>

```bash
# Test Gemini API directly
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'

# Check logs
grep "Response generated" logs/agent-*.log
```

</details>

---

### No Audio Output (TTS Failing)

**Symptoms:**
- AI responds in transcript but no audio
- "Synthesis failed" in logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Invalid ElevenLabs key | Check `VITE_ELEVENLABS_API_KEY` |
| Invalid voice ID | Use valid ID from voice list |
| Text too long | Increase timeout (currently 60s) |
| Rate limit | Check ElevenLabs dashboard |

<details>
<summary>Debug Steps</summary>

```bash
# Test ElevenLabs API
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM" \
  -H "xi-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","model_id":"eleven_flash_v2_5"}' \
  --output test.mp3

# Check logs
grep "Synthesis complete" logs/agent-*.log
grep "Synthesis failed" logs/agent-*.log
```

</details>

---

## Barge-In Issues

### AI Doesn't Stop When User Speaks

**Symptoms:**
- AI completes sentence even when interrupted
- "INTERRUPT CONFIRMED" not appearing in logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Threshold too high | Lower `INTERRUPT_THRESHOLD` to 30 |
| isSpeaking not set | Check flag is true during playback |
| Frame check too slow | Reduce `FRAME_SIZE` to 120 |

<details>
<summary>Debug Steps</summary>

```bash
# Check interrupt detection
grep "Potential interrupt" logs/agent-*.log
grep "INTERRUPT CONFIRMED" logs/agent-*.log

# Check RMS values
grep "rms:" logs/agent-*.log | tail -20
```

</details>

### Configuration to try:

```javascript
// Ultra-sensitive interrupt detection
const INTERRUPT_THRESHOLD = 30;        // Very low
const MIN_INTERRUPT_DURATION_MS = 30;  // Very fast
const FRAMES_FOR_INTERRUPT = 1;        // Single frame
```

---

### False Interrupts (AI Stops on Noise)

**Symptoms:**
- AI stops randomly
- Interrupts on background noise

**Fixes:**

```javascript
// Less sensitive interrupt detection
const INTERRUPT_THRESHOLD = 100;       // Higher threshold
const MIN_INTERRUPT_DURATION_MS = 100; // Longer duration
const FRAMES_FOR_INTERRUPT = 3;        // Need 3 frames
```

---

## Memory/RAG Issues

### Memories Not Being Retrieved

**Symptoms:**
- AI doesn't remember past conversations
- "Memory search failed" in logs

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Firebase not initialized | Check `serviceAccountKey.json` |
| Wrong project ID | Check `FIREBASE_PROJECT_ID` |
| Embeddings failing | Check Vertex AI quota |

<details>
<summary>Debug Steps</summary>

```bash
# Check Firebase connection
grep "Firebase" logs/agent-*.log

# Check memory search
grep "Memory search" logs/agent-*.log

# Check Firestore directly
# Visit: https://console.firebase.google.com/project/YOUR_PROJECT/firestore
```

</details>

---

## Mobile App Issues

### Microphone Not Working

**Symptoms:**
- No audio being sent
- Permissions denied

**Fixes:**

1. Check `app.json` has correct permissions
2. Run `npx expo prebuild` after changes
3. Reinstall app on device

```json
// app.json
{
  "ios": {
    "infoPlist": {
      "NSMicrophoneUsageDescription": "For voice conversations"
    }
  }
}
```

---

### Audio Playing Through Earpiece (iOS)

**Symptoms:**
- AI voice comes through earpiece, not speaker

**Fix:**

```javascript
// In useLiveKit.js
await AudioSession.configureAudio({
  ios: {
    defaultOutput: 'speaker',  // Force speaker
  },
});
```

---

### App Crashes on Connect

**Symptoms:**
- App crashes when starting call
- Native module errors

**Fixes:**

1. Ensure `newArchEnabled: false` in `app.json`
2. Run `npx expo prebuild --clean`
3. `cd ios && pod install`
4. Clean Xcode DerivedData

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd ios && pod install --repo-update
```

---

## Log File Locations

| Log | Location |
|-----|----------|
| Agent logs | `livekit-agent/logs/agent-YYYY-MM-DD.log` |
| Token server | Console output |
| Expo/Metro | Console output |
| iOS simulator | Xcode console |

---

## Useful Log Patterns

```bash
# Find errors
grep -i "error\|failed\|exception" logs/agent-*.log

# Track a full conversation turn
grep "=== NEW TURN\|=== TURN COMPLETE" logs/agent-*.log

# Check latencies
grep "latencyMs" logs/agent-*.log

# Monitor VAD
grep "Speech START\|Speech END\|INTERRUPT" logs/agent-*.log
```

---

## Quick Restart

```bash
# Kill everything and restart
pkill -f "node agent.js"
pkill -f "node server.js"

cd livekit-agent
npm run dev
```

---

## Related

- [[01-Architecture]] - System overview
- [[03-Barge-In]] - Interrupt detection
- [[04-VAD-System]] - Voice detection

#troubleshooting #debugging #errors #fixes #logs
