---
title: Barge-In (Interrupt Detection)
tags:
  - barge-in
  - interruption
  - vad
  - abort-controller
  - real-time
---

# Barge-In System

Allows users to interrupt the AI mid-sentence, just like a natural conversation.

---

## The Problem

In traditional voice AI:
- User speaks while AI is talking
- AI ignores and finishes its sentence
- User has to repeat themselves
- Feels robotic and frustrating

**Goal**: When user starts speaking, AI should **immediately stop** and listen.

---

## Solution Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BARGE-IN FLOW                             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ PHASE 1: AI Speaking                                 │    │
│  │                                                      │    │
│  │  TTS Audio ──→ AudioSource ──→ LiveKit ──→ User     │    │
│  │       ↑                                              │    │
│  │  AbortController watching                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         │ User starts speaking               │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ PHASE 2: Detection (~20ms)                          │    │
│  │                                                      │    │
│  │  VAD detects: RMS > 50, sustained 1+ frames         │    │
│  │  shouldInterrupt = true                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ PHASE 3: Abort (~0ms)                               │    │
│  │                                                      │    │
│  │  AbortController.abort()                             │    │
│  │  ├── ElevenLabs API call cancelled                   │    │
│  │  ├── Audio playback loop exits                       │    │
│  │  └── Silence frames flush buffer                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ PHASE 4: Context Re-shaping                         │    │
│  │                                                      │    │
│  │  Store: "AI was saying: [interrupted text]"          │    │
│  │  Next prompt includes interrupt context              │    │
│  │  AI responds: "Oh! [new response]"                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Active Streams Map

Tracks ongoing TTS API calls per user.

```javascript
const activeStreams = new Map(); // userId → AbortController
const interruptedResponses = new Map(); // userId → what AI was saying
```

### 2. Interrupt Function

Immediately aborts the TTS stream.

```javascript
function interruptAI(userId, currentResponse = null) {
  if (activeStreams.has(userId)) {
    const controller = activeStreams.get(userId);
    controller.abort();  // ← This cancels the HTTP request
    activeStreams.delete(userId);

    // Save what we were saying for context
    if (currentResponse) {
      interruptedResponses.set(userId, currentResponse);
    }
    return true;
  }
  return false;
}
```

### 3. TTS with AbortController

<details>
<summary>Full Implementation</summary>

```javascript
async function synthesizeSpeech(text, language, voiceId, isFiller, userId) {
  // Create abort controller for this request
  const controller = new AbortController();

  if (userId) {
    // Abort any existing stream for this user
    if (activeStreams.has(userId)) {
      activeStreams.get(userId).abort();
    }
    activeStreams.set(userId, controller);
  }

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: 'eleven_flash_v2_5' },
      {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        responseType: 'arraybuffer',
        signal: controller.signal, // ← Link abort signal
      }
    );

    return new Int16Array(response.data);
  } catch (error) {
    // Handle abort gracefully
    if (error.name === 'AbortError' || axios.isCancel(error)) {
      console.log('TTS aborted - user interrupted');
      return null;
    }
    throw error;
  } finally {
    // Clean up
    if (userId && activeStreams.get(userId) === controller) {
      activeStreams.delete(userId);
    }
  }
}
```

</details>

---

## VAD Configuration

Ultra-aggressive settings for instant detection:

```javascript
const INTERRUPT_THRESHOLD = 50;        // Very low RMS
const MIN_INTERRUPT_DURATION_MS = 50;  // Only 50ms needed
const FRAMES_FOR_INTERRUPT = 1;        // Single frame triggers
```

### Detection Logic

```javascript
// Inside audio processing loop
if (isSpeaking) {
  const rms = calculateRMS(frame.data);

  if (rms > INTERRUPT_THRESHOLD) {
    consecutiveSpeechFrames++;

    if (consecutiveSpeechFrames >= FRAMES_FOR_INTERRUPT) {
      // INTERRUPT!
      shouldInterrupt = true;
      interruptAI(currentSpeakingUserId, currentResponse);
    }
  } else {
    // Reset on silence (false positive protection)
    consecutiveSpeechFrames = 0;
  }
}
```

---

## Context Re-shaping

When user interrupts, the next LLM prompt includes what was interrupted:

```javascript
const interruptContext = interruptedText
  ? `IMPORTANT - BARGE-IN CONTEXT:
     The user INTERRUPTED you while you were saying:
     "${interruptedText.substring(0, 100)}..."

     - Do NOT continue your previous thought
     - Acknowledge naturally ("Oh!" or "Haan?")
     - Focus on their new question`
  : '';
```

### Example Conversation

```
AI: "I think we should go to the restaurant because—"
User: [interrupts] "Actually, let's go to the beach!"

AI: "Oh! The beach sounds great! Should we..."
     ↑
     AI acknowledges the shift naturally
```

---

## Playback Loop with Interrupt Checks

<details>
<summary>Full Chunked Playback Code</summary>

```javascript
async function synthesizeAndPlayChunked(text, language, voiceId, audioSource, checkInterrupt, clearAudio, userId) {
  const sentences = splitIntoSentences(text);
  const FRAME_SIZE = 120; // 5ms frames for ultra-responsive checks

  for (const sentence of sentences) {
    // Check before synthesizing
    if (checkInterrupt()) {
      if (userId) interruptAI(userId, text);
      if (clearAudio) await clearAudio();
      return false;
    }

    const audio = await synthesizeSpeech(sentence, language, voiceId, false, userId);

    // Check after synthesizing
    if (checkInterrupt() || !audio) {
      if (userId) interruptAI(userId, text);
      return false;
    }

    // Play with ultra-frequent interrupt checks
    for (let i = 0; i < audio.length; i += FRAME_SIZE) {
      if (checkInterrupt()) {
        if (userId) interruptAI(userId, text);
        return false;
      }

      const frame = audio.slice(i, i + FRAME_SIZE);
      await audioSource.captureFrame(new AudioFrame(frame, 24000, 1, frame.length));

      // Yield to event loop for interrupt detection
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return true; // Completed without interruption
}
```

</details>

---

## Audio Buffer Flushing

When interrupted, push silence to clear the audio queue:

```javascript
async function clearAudio() {
  const silenceFrame = new AudioFrame(new Int16Array(480), 24000, 1, 480);
  for (let i = 0; i < 10; i++) {
    await audioSource.captureFrame(silenceFrame);
  }
}
```

---

## Timing Breakdown

| Phase | Time |
|-------|------|
| User speaks | 0ms |
| VAD detects | ~20ms |
| AbortController.abort() | ~0ms |
| HTTP request cancelled | ~0ms |
| Audio loop exits | ~5ms |
| Ready for new input | ~25ms total |

---

## Troubleshooting

### Barge-in not detecting speech
- Lower `INTERRUPT_THRESHOLD` (try 30)
- Check microphone permissions
- Ensure `isSpeaking` flag is true during playback

### AI still finishes sentence
- Check `shouldInterrupt` flag is being checked in playback loop
- Ensure `FRAME_SIZE` is small enough (120 = 5ms)
- Verify `setImmediate` yield is present

### False positives (interrupting on noise)
- Increase `INTERRUPT_THRESHOLD` (try 80)
- Increase `FRAMES_FOR_INTERRUPT` (try 2-3)

---

## Related

- [[04-VAD-System]] - Voice Activity Detection details
- [[02-Voice-Pipeline]] - Full pipeline flow

#barge-in #interruption #abort-controller #vad #real-time
