---
title: Voice Pipeline (STT → LLM → TTS)
tags:
  - voice-pipeline
  - stt
  - llm
  - tts
  - deepgram
  - gemini
  - elevenlabs
---

# Voice Pipeline

The voice pipeline converts user speech to AI response in three stages.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     VOICE PIPELINE                           │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   DEEPGRAM   │   │    GEMINI    │   │  ELEVENLABS  │    │
│  │              │   │              │   │              │    │
│  │  Audio → Text│ → │ Text → Text  │ → │ Text → Audio │    │
│  │              │   │              │   │              │    │
│  │   ~200ms     │   │   ~400ms     │   │   ~100ms     │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Speech-to-Text (Deepgram)

### What It Does
Converts user's spoken audio into text transcript.

### Technology
- **Provider**: Deepgram
- **Model**: `nova-2` (most accurate, fastest)
- **Features**: Smart formatting, punctuation, multilingual

### Supported Languages

| Code | Language | Deepgram Code |
|------|----------|---------------|
| en | English | en-US |
| hi | Hindi | hi |
| es | Spanish | es |
| fr | French | fr |
| de | German | de |
| ja | Japanese | ja |
| ko | Korean | ko |
| zh | Chinese | zh |

<details>
<summary>STT Implementation Code</summary>

```javascript
// agent.js - transcribe function
async function transcribe(audioData, sampleRate = 48000, language = 'en') {
  const deepgramLang = DEEPGRAM_LANGUAGE_CODES[language] || 'en-US';

  // Convert Int16Array to WAV buffer
  const wavBuffer = createWavBuffer(audioData, sampleRate);

  const response = await axios.post(
    `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${deepgramLang}`,
    wavBuffer,
    {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/wav',
      },
    }
  );

  return response.data.results?.channels[0]?.alternatives[0]?.transcript;
}
```

</details>

### WAV Buffer Creation

<details>
<summary>WAV Header Code</summary>

```javascript
function createWavBuffer(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);      // chunk size
  buffer.writeUInt16LE(1, 20);       // PCM format
  buffer.writeUInt16LE(1, 22);       // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);       // block align
  buffer.writeUInt16LE(16, 34);      // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  return buffer;
}
```

</details>

---

## Stage 2: LLM Response (Gemini)

### What It Does
Generates conversational response based on user input + context.

### Technology
- **Provider**: Google AI (Gemini)
- **Model**: `gemini-2.0-flash-exp`
- **Context**: RAG memories + active conversation window

### System Prompt Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT                             │
│                                                              │
│  1. Persona: "You are their soulmate..."                    │
│                                                              │
│  2. Interrupt Context (if applicable):                       │
│     "User interrupted you while saying: ..."                 │
│                                                              │
│  3. Speaking Style:                                          │
│     - Casual language                                        │
│     - No formal phrases                                      │
│     - React emotionally                                      │
│                                                              │
│  4. Language Instruction:                                    │
│     "Respond in [Hindi/Spanish/etc.]"                        │
│                                                              │
│  5. Memory Context:                                          │
│     "RELEVANT MEMORIES: ..."                                 │
│                                                              │
│  6. Recent Conversation:                                     │
│     "RECENT: User said X, You said Y..."                     │
│                                                              │
│  7. Web Search Results (if applicable):                      │
│     "LATEST INFO: ..."                                       │
│                                                              │
│  8. User's Current Message:                                  │
│     "They said: [transcript]"                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

<details>
<summary>LLM Implementation Code</summary>

```javascript
// agent.js - getAIResponseWithRAG function
async function getAIResponseWithRAG(userId, userMessage, language, languageName) {
  // 1. Check for interrupted context (barge-in)
  const interruptedText = getInterruptedContext(userId);

  // 2. Search relevant memories
  const memories = await searchMemories(userId, userMessage, 5);

  // 3. Get active conversation window
  const recentMessages = getActiveWindow(userId);

  // 4. Check if needs web search
  let webSearchResults = null;
  if (needsWebSearch(userMessage)) {
    webSearchResults = await searchWeb(userMessage, language);
  }

  // 5. Build hydrated prompt
  const systemPrompt = buildPrompt({
    interruptedText,
    memories,
    recentMessages,
    webSearchResults,
    language,
    languageName,
    userMessage
  });

  // 6. Generate response
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent(systemPrompt);

  return result.response.text().trim();
}
```

</details>

---

## Stage 3: Text-to-Speech (ElevenLabs)

### What It Does
Converts AI's text response into natural-sounding speech.

### Technology
- **Provider**: ElevenLabs
- **Model**: `eleven_flash_v2_5` (fastest, cheapest)
- **Output**: PCM 24kHz mono

### Available Voices

| Voice ID | Name | Style |
|----------|------|-------|
| 21m00Tcm4TlvDq8ikWAM | Rachel | Warm & Conversational |
| EXAVITQu4vr4xnSDxMaL | Sarah | Soft & Friendly |
| XB0fDUnXU5powFXDhCwa | Charlotte | Sweet & Caring |
| 9BWtsMINqrJLrRacOk9x | Aria | Expressive |
| FGY2WhTYpPnrIDTdsKH5 | Laura | Natural |

### Sentence Chunking

**Problem**: Long responses take too long to synthesize before playing.

**Solution**: Split into sentences, synthesize and play one at a time.

```
┌─────────────────────────────────────────────────────────────┐
│                 CHUNKED TTS FLOW                             │
│                                                              │
│  Full Response: "Hello! How are you? I'm doing great."      │
│                                                              │
│  ┌───────────┐   ┌───────────┐   ┌───────────────────┐      │
│  │ "Hello!"  │ → │ Synthesize│ → │ Play immediately  │      │
│  └───────────┘   └───────────┘   └───────────────────┘      │
│                                         │                    │
│  ┌───────────────────┐                  │ (while playing)   │
│  │ "How are you?"    │ → Synthesize ────┼──→ Play next      │
│  └───────────────────┘                  │                    │
│                                         │                    │
│  ┌───────────────────────┐              │                   │
│  │ "I'm doing great."   │ → Synthesize ─┴──→ Play next      │
│  └───────────────────────┘                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

<details>
<summary>TTS Implementation Code</summary>

```javascript
// agent.js - synthesizeSpeech function
async function synthesizeSpeech(text, language, voiceId, isFiller, userId) {
  // Create AbortController for barge-in support
  const controller = new AbortController();
  if (userId) activeStreams.set(userId, controller);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000&optimize_streaming_latency=3`,
    {
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      responseType: 'arraybuffer',
      signal: controller.signal, // For barge-in abort
    }
  );

  // Convert to Int16Array for LiveKit
  const buffer = Buffer.from(response.data);
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
}
```

</details>

<details>
<summary>Sentence Splitting Code</summary>

```javascript
function splitIntoSentences(text) {
  // Split on sentence endings (including Hindi danda ।)
  const sentences = text.match(/[^।!?।\n]+[।!?।\n]?/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}
```

</details>

---

## Audio Frame Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   AUDIO FRAME HANDLING                       │
│                                                              │
│  LiveKit delivers: 48kHz, 16-bit PCM, ~20ms frames          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Input (from user)                                      │  │
│  │ - Sample Rate: 48000 Hz                                │  │
│  │ - Channels: 1 (mono)                                   │  │
│  │ - Bit Depth: 16-bit signed                             │  │
│  │ - Frame Size: ~960 samples (~20ms)                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Output (to user)                                       │  │
│  │ - Sample Rate: 24000 Hz (ElevenLabs output)           │  │
│  │ - Channels: 1 (mono)                                   │  │
│  │ - Frame Size: 120 samples (~5ms for fast interrupt)    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Latency Optimization

| Optimization | Impact |
|--------------|--------|
| Deepgram Nova-2 | Fastest STT model |
| Gemini Flash | Fast LLM inference |
| ElevenLabs Flash | Lowest latency TTS |
| Sentence chunking | First audio plays sooner |
| `optimize_streaming_latency=3` | ElevenLabs turbo mode |

---

## Related

- [[03-Barge-In]] - How interrupts abort this pipeline
- [[04-VAD-System]] - How speech is detected
- [[05-Memory-RAG]] - How context is retrieved

#voice-pipeline #deepgram #gemini #elevenlabs #stt #tts #llm
