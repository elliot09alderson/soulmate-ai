---
title: Voice Activity Detection (VAD)
tags:
  - vad
  - voice-detection
  - audio-processing
  - rms
  - speech-detection
---

# Voice Activity Detection (VAD)

Detects when the user is speaking vs. silent.

---

## Purpose

VAD serves two critical functions:

1. **Turn Detection**: Know when user finished speaking → send to STT
2. **Interrupt Detection**: Know when user starts speaking during AI response

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                   VAD PROCESSING                             │
│                                                              │
│  Audio Frame (20ms, ~960 samples)                           │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Calculate RMS (Root Mean Square)                     │    │
│  │                                                      │    │
│  │        ___________________________                   │    │
│  │       / Σ(sample²)                                   │    │
│  │ RMS = √ ─────────────                                │    │
│  │           n_samples                                  │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Compare to Threshold                                 │    │
│  │                                                      │    │
│  │  RMS > THRESHOLD → Speech detected                   │    │
│  │  RMS ≤ THRESHOLD → Silence                           │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## RMS Calculation

```javascript
function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
```

### RMS Values Reference

| RMS Value | Meaning |
|-----------|---------|
| 0-30 | Silence / very quiet |
| 30-100 | Soft speech / background noise |
| 100-500 | Normal speech |
| 500-1000 | Loud speech |
| 1000+ | Very loud / clipping |

---

## VoiceProcessor Class

<details>
<summary>Full Implementation</summary>

```javascript
class VoiceProcessor {
  constructor(userId) {
    this.userId = userId;
    this.audioBuffer = [];
    this.isRecording = false;
    this.silenceStart = null;
    this.speechStart = null;

    // Thresholds
    this.SILENCE_THRESHOLD = 800;   // RMS below = silence
    this.SILENCE_DURATION = 800;    // ms of silence = end of speech
    this.MIN_AUDIO_LENGTH = 8000;   // min samples to process
  }

  processFrame(frame, isProcessing) {
    // Don't process if AI is responding
    if (isProcessing) {
      this.reset();
      return null;
    }

    const samples = frame.data;
    const rms = calculateRMS(samples);

    if (rms > this.SILENCE_THRESHOLD) {
      // Speech detected
      if (!this.isRecording) {
        this.speechStart = Date.now();
        console.log('Speech START', { rms });
      }
      this.isRecording = true;
      this.silenceStart = null;
      this.audioBuffer.push(...samples);

    } else if (this.isRecording) {
      // Silence during recording
      this.audioBuffer.push(...samples);

      if (!this.silenceStart) {
        this.silenceStart = Date.now();
      } else if (Date.now() - this.silenceStart > this.SILENCE_DURATION) {
        // End of speech
        if (this.audioBuffer.length > this.MIN_AUDIO_LENGTH) {
          const audio = new Int16Array(this.audioBuffer);
          this.reset();
          return audio; // Return audio for transcription
        }
        this.reset();
      }
    }

    return null;
  }

  reset() {
    this.audioBuffer = [];
    this.isRecording = false;
    this.silenceStart = null;
    this.speechStart = null;
  }
}
```

</details>

---

## Turn Detection Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   TURN DETECTION                             │
│                                                              │
│  User speaks    Recording     Silence      Silence          │
│  ─────────────> ──────────> ──────────> ─────────────>      │
│                                                              │
│  ┌───────┐      ┌────────┐   ┌────────┐   ┌───────────┐    │
│  │RMS>800│      │Buffer  │   │RMS<800 │   │800ms      │    │
│  │       │  →   │audio   │ → │start   │ → │elapsed    │    │
│  │Start  │      │frames  │   │timer   │   │           │    │
│  │record │      │        │   │        │   │Send to STT│    │
│  └───────┘      └────────┘   └────────┘   └───────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Interrupt Detection Flow

Different thresholds for barge-in (more sensitive):

```javascript
// Turn detection (user finished speaking)
const SILENCE_THRESHOLD = 800;   // Higher = need clear speech
const SILENCE_DURATION = 800;    // Wait 800ms of silence

// Interrupt detection (user wants to interrupt)
const INTERRUPT_THRESHOLD = 50;  // Lower = any audible sound
const MIN_INTERRUPT_DURATION_MS = 50;  // Just 50ms
const FRAMES_FOR_INTERRUPT = 1;  // Single frame triggers
```

### Why Different Thresholds?

| Use Case | Sensitivity | Reason |
|----------|-------------|--------|
| Turn detection | Low | Avoid false triggers on breath/noise |
| Interrupt detection | High | User wants to stop AI NOW |

---

## Audio Frame Details

LiveKit delivers audio in frames:

```javascript
// Frame structure from LiveKit
{
  data: Int16Array,     // PCM samples
  sampleRate: 48000,    // 48kHz
  channels: 1,          // Mono
  samplesPerChannel: ~960  // ~20ms per frame
}
```

### Frame Timing

```
1 second = 48000 samples
1 frame ≈ 960 samples
1 frame ≈ 20ms
50 frames ≈ 1 second
```

---

## Deduplication

Prevents processing the same utterance twice:

```javascript
isDuplicate(text) {
  const now = Date.now();
  const normalized = text.toLowerCase().trim();

  if (this.lastProcessedText === normalized &&
      (now - this.lastProcessedTime) < 3000) {  // 3s window
    return true;  // Skip duplicate
  }

  this.lastProcessedText = normalized;
  this.lastProcessedTime = now;
  return false;
}
```

---

## Interrupt Buffer

Captures user's speech during AI response for immediate processing:

```javascript
bufferInterruptAudio(frame) {
  this.interruptBuffer.push(...frame.data);

  // Keep max 5 seconds
  const maxSamples = 48000 * 5;
  if (this.interruptBuffer.length > maxSamples) {
    this.interruptBuffer = this.interruptBuffer.slice(-maxSamples);
  }
}

getInterruptBuffer() {
  const buffer = new Int16Array(this.interruptBuffer);
  this.interruptBuffer = [];
  return buffer;
}
```

---

## Configuration Summary

```javascript
// VoiceProcessor configuration
class VoiceProcessor {
  SILENCE_THRESHOLD = 800;    // RMS below = silence
  SILENCE_DURATION = 800;     // ms to wait after speech ends
  MIN_AUDIO_LENGTH = 8000;    // min samples (~167ms @ 48kHz)
  DEDUP_WINDOW = 3000;        // ms to ignore duplicates
}

// Interrupt detection configuration
const INTERRUPT_THRESHOLD = 50;        // Ultra-sensitive
const MIN_INTERRUPT_DURATION_MS = 50;  // Quick trigger
const FRAMES_FOR_INTERRUPT = 1;        // Single frame
```

---

## Troubleshooting

### Not detecting speech
- Lower `SILENCE_THRESHOLD` (try 500)
- Check microphone permissions
- Verify audio frames are arriving

### Too many false triggers
- Raise `SILENCE_THRESHOLD` (try 1000)
- Increase `SILENCE_DURATION` (try 1000ms)

### Interrupt not working
- Lower `INTERRUPT_THRESHOLD` (try 30)
- Ensure `isSpeaking` is true during playback
- Check RMS values in logs

---

## Related

- [[03-Barge-In]] - How VAD triggers interrupts
- [[02-Voice-Pipeline]] - Where VAD fits in pipeline

#vad #voice-detection #audio-processing #rms #speech-detection
