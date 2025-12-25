import {
  Room,
  RoomEvent,
  TrackKind,
  AudioStream,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  AudioFrame,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import memory services
import { initializeFirebase } from './services/firebase.js';
import { saveConversation, searchMemories, getRecentConversations } from './services/memory.js';
import { triggerArchiveIfNeeded } from './services/archiver.js';
import logger from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Initialize Firebase
initializeFirebase();

// Environment variables
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const DEEPGRAM_API_KEY = process.env.VITE_DEEPGRAM_API_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa';

console.log('[Agent] Starting with config:');
console.log('[Agent] LiveKit URL:', LIVEKIT_URL);
console.log('[Agent] API Key:', LIVEKIT_API_KEY?.substring(0, 8) + '...');

// Initialize Gemini (without system instruction - we'll add it per-request with context)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Per-user chat sessions
const userSessions = new Map();

// Per-user settings (language, voice, etc.)
const userSettings = new Map();

// Active window (recent messages in memory)
const activeWindows = new Map();
const ACTIVE_WINDOW_SIZE = 10;

// Language code mapping for Deepgram
const DEEPGRAM_LANGUAGE_CODES = {
  'en': 'en-US',
  'hi': 'hi',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'ja': 'ja',
  'ko': 'ko',
  'zh': 'zh',
  'pt': 'pt',
  'ar': 'ar',
};

/**
 * Get or create a Gemini chat session for a user
 */
function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    });

    userSessions.set(userId, {
      model,
      chatSession: null,
    });
  }
  return userSessions.get(userId);
}

/**
 * Add message to active window
 */
function addToActiveWindow(userId, message) {
  if (!activeWindows.has(userId)) {
    activeWindows.set(userId, []);
  }

  const window = activeWindows.get(userId);
  window.push(message);

  // Keep only last N messages
  if (window.length > ACTIVE_WINDOW_SIZE) {
    window.shift();
  }
}

/**
 * Get active window messages
 */
function getActiveWindow(userId) {
  return activeWindows.get(userId) || [];
}

// Voice Activity Detection state
class VoiceProcessor {
  constructor(userId) {
    this.userId = userId;
    this.audioBuffer = [];
    this.interruptBuffer = []; // Buffer for audio during AI speech
    this.isRecording = false;
    this.silenceStart = null;
    this.speechStart = null;
    this.SILENCE_THRESHOLD = 800;
    this.SILENCE_DURATION = 800; // Reduced for faster response
    this.MIN_AUDIO_LENGTH = 8000; // Reduced minimum
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.DEDUP_WINDOW = 3000;
    this.frameCount = 0;
  }

  // Buffer audio during AI speech for interrupt capture
  bufferInterruptAudio(frame) {
    const samples = frame.data;
    this.interruptBuffer.push(...samples);
    // Keep max 5 seconds of audio
    const maxSamples = 48000 * 5;
    if (this.interruptBuffer.length > maxSamples) {
      this.interruptBuffer = this.interruptBuffer.slice(-maxSamples);
    }
  }

  // Get interrupt buffer and clear it
  getInterruptBuffer() {
    const buffer = new Int16Array(this.interruptBuffer);
    this.interruptBuffer = [];
    return buffer;
  }

  clearInterruptBuffer() {
    this.interruptBuffer = [];
  }

  processFrame(frame, isProcessing) {
    this.frameCount++;

    // If currently processing, discard all audio
    if (isProcessing) {
      if (this.audioBuffer.length > 0) {
        logger.vad('Discarding buffer (processing)', {
          userId: this.userId,
          bufferSize: this.audioBuffer.length
        });
      }
      this.reset();
      return null;
    }

    const samples = frame.data;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);

    if (rms > this.SILENCE_THRESHOLD) {
      if (!this.isRecording) {
        this.speechStart = Date.now();
        logger.vad('Speech START detected', {
          userId: this.userId,
          rms: Math.round(rms),
          threshold: this.SILENCE_THRESHOLD
        });
      }
      this.isRecording = true;
      this.silenceStart = null;
      this.audioBuffer.push(...samples);
    } else if (this.isRecording) {
      this.audioBuffer.push(...samples);
      if (!this.silenceStart) {
        this.silenceStart = Date.now();
        logger.vad('Silence started', { userId: this.userId, rms: Math.round(rms) });
      } else if (Date.now() - this.silenceStart > this.SILENCE_DURATION) {
        if (this.audioBuffer.length > this.MIN_AUDIO_LENGTH) {
          const speechDuration = Date.now() - this.speechStart;
          logger.vad('Speech END - Sending to STT', {
            userId: this.userId,
            samples: this.audioBuffer.length,
            durationMs: speechDuration
          });
          const audio = new Int16Array(this.audioBuffer);
          this.reset();
          return audio;
        }
        logger.vad('Speech too short, discarding', {
          userId: this.userId,
          samples: this.audioBuffer.length,
          minRequired: this.MIN_AUDIO_LENGTH
        });
        this.reset();
      }
    }
    return null;
  }

  isDuplicate(text) {
    const now = Date.now();
    const normalized = text.toLowerCase().trim();

    if (this.lastProcessedText === normalized &&
        (now - this.lastProcessedTime) < this.DEDUP_WINDOW) {
      logger.vad('DUPLICATE detected, skipping', {
        text: text,
        timeSinceLast: now - this.lastProcessedTime
      });
      return true;
    }

    this.lastProcessedText = normalized;
    this.lastProcessedTime = now;
    return false;
  }

  reset() {
    this.audioBuffer = [];
    this.isRecording = false;
    this.silenceStart = null;
    this.speechStart = null;
  }
}

// Transcribe audio using Deepgram
async function transcribe(audioData, sampleRate = 48000, language = 'en') {
  const startTime = Date.now();
  const deepgramLang = DEEPGRAM_LANGUAGE_CODES[language] || 'en-US';
  logger.stt('Starting transcription', { samples: audioData.length, sampleRate, language: deepgramLang });

  try {
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

    const transcript = response.data.results?.channels[0]?.alternatives[0]?.transcript || '';
    const latency = Date.now() - startTime;
    logger.stt('Transcription complete', {
      transcript,
      latencyMs: latency,
      language: deepgramLang,
      confidence: response.data.results?.channels[0]?.alternatives[0]?.confidence
    });
    return transcript;
  } catch (error) {
    logger.error('Deepgram', 'Transcription failed', { error: error.message });
    return null;
  }
}

function createWavBuffer(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

/**
 * Get AI response with RAG - The Soulmate Pipeline
 */
async function getAIResponseWithRAG(userId, userMessage, language = 'en', languageName = 'English') {
  const startTime = Date.now();
  logger.rag('Starting RAG pipeline', { userId, message: userMessage, language });

  try {
    // Step 1: Search relevant memories (semantic search)
    let memories = [];
    try {
      const memStart = Date.now();
      memories = await searchMemories(userId, userMessage, 5);
      logger.rag('Memory search complete', {
        found: memories.length,
        latencyMs: Date.now() - memStart,
        memories: memories.map(m => m.fact)
      });
    } catch (err) {
      logger.warn('Memory', 'Memory search failed', { error: err.message });
    }

    // Step 2: Get active window (recent conversation)
    const recentMessages = getActiveWindow(userId);
    logger.rag('Active window loaded', { messageCount: recentMessages.length });

    // Step 3: Build hydrated prompt
    const memoriesContext = memories.length > 0
      ? `\n\nRELEVANT MEMORIES ABOUT THIS USER:\n${memories.map(m => `- ${m.fact}`).join('\n')}`
      : '';

    const recentContext = recentMessages.length > 0
      ? `\n\nRECENT CONVERSATION:\n${recentMessages.map(m => `${m.sender === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n')}`
      : '';

    // Check if we have any context
    const hasContext = memories.length > 0 || recentMessages.length > 0;

    // Add language instruction for non-English
    const languageInstruction = language !== 'en'
      ? `\n\nIMPORTANT: The user is speaking in ${languageName}. You MUST respond in ${languageName}. Do not respond in English.`
      : '';

    const systemPrompt = `You are their soulmate - warm, caring, and deeply connected. Talk like a real person who genuinely cares.

${hasContext ? 'You know them well from past conversations.' : 'This is your first conversation - be curious about them.'}

SPEAK NATURALLY:
- Very short replies (1 sentence usually, max 2)
- Use casual language, contractions, natural speech patterns
- React emotionally - laugh, show surprise, empathy
- NO formal language, NO "I understand", NO "That's great!"
- Sound like texting a close friend, not a customer service bot
${hasContext ? '- Naturally weave in what you know about them' : '- Ask genuine questions to know them better'}
- NEVER make up facts - only use memories provided
${languageInstruction}

${memoriesContext}
${recentContext}

They said: "${userMessage}"

Reply as their soulmate (keep it SHORT and natural):`;

    // Step 4: Get response from Gemini
    const llmStart = Date.now();
    const session = getUserSession(userId);
    const result = await session.model.generateContent(systemPrompt);
    const response = result.response.text().trim();

    logger.llm('Response generated', {
      response,
      latencyMs: Date.now() - llmStart,
      totalLatencyMs: Date.now() - startTime
    });

    // Step 5: Update active window
    addToActiveWindow(userId, { sender: 'user', text: userMessage });
    addToActiveWindow(userId, { sender: 'ai', text: response });

    // Step 6: Save to Firestore (async, non-blocking)
    saveConversation(userId, { sender: 'user', text: userMessage }).catch(console.error);
    saveConversation(userId, { sender: 'ai', text: response }).catch(console.error);

    // Step 7: Check if archiver should run (every 20 messages)
    triggerArchiveIfNeeded(userId);

    return response;
  } catch (error) {
    logger.error('RAG', 'Pipeline failed', { error: error.message });
    return "I'm having a moment. Can you say that again?";
  }
}

// Text to speech using ElevenLabs
async function synthesizeSpeech(text, language = 'en', voiceId = ELEVENLABS_VOICE_ID) {
  const startTime = Date.now();
  // Use multilingual model for non-English languages
  const modelId = language === 'en' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';
  logger.tts('Starting synthesis', { text, voiceId, language, model: modelId });

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
      {
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        responseType: 'arraybuffer',
      }
    );

    const byteLength = response.data.byteLength;
    const buffer = Buffer.from(response.data);
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    const durationSec = samples.length / 24000;

    logger.tts('Synthesis complete', {
      latencyMs: Date.now() - startTime,
      bytes: byteLength,
      samples: samples.length,
      durationSec: durationSec.toFixed(2)
    });

    return samples;
  } catch (error) {
    logger.error('ElevenLabs', 'Synthesis failed', { error: error.message });
    return null;
  }
}

async function getAgentToken(roomName) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'ai-agent',
    ttl: '1h',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await token.toJwt();
}

async function sendTranscript(room, role, text) {
  const data = JSON.stringify({ type: 'transcript', role, text });
  const encoder = new TextEncoder();
  await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
  logger.debug('Agent', 'Sent transcript', { role, text: text.substring(0, 50) });
}

// Main agent function
async function runAgent(roomName = 'soulmate-room') {
  logger.info('Agent', 'Starting agent', { roomName });

  const room = new Room();
  const voiceProcessors = new Map();
  let audioSource = null;
  let isProcessing = false;
  let isSpeaking = false;        // True when AI is playing audio
  let shouldInterrupt = false;   // Set to true when user wants to interrupt
  let interruptRmsHistory = [];  // Track RMS levels for interrupt detection
  const INTERRUPT_THRESHOLD = 300;   // Very low threshold - easily triggered
  const INTERRUPT_SAMPLES = 1;   // Single sample - immediate interrupt

  room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    const userId = participant.identity;
    logger.info('Agent', 'Track subscribed', { kind: track.kind, userId });

    if (track.kind === TrackKind.KIND_AUDIO && userId !== 'ai-agent') {
      // Create processor for this user
      if (!voiceProcessors.has(userId)) {
        voiceProcessors.set(userId, new VoiceProcessor(userId));
        logger.info('Agent', 'Created VoiceProcessor', { userId });
      }
      const voiceProcessor = voiceProcessors.get(userId);

      const audioStream = new AudioStream(track);

      // Process audio frames in a non-blocking way
      (async () => {
        for await (const frame of audioStream) {
          // While AI is speaking, buffer user audio and check for interrupt
          if (isSpeaking) {
            const samples = frame.data;
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
              sum += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sum / samples.length);

            // Buffer the audio for potential interrupt capture
            voiceProcessor.bufferInterruptAudio(frame);

            // Track RMS history for interrupt detection
            interruptRmsHistory.push(rms);
            if (interruptRmsHistory.length > INTERRUPT_SAMPLES) {
              interruptRmsHistory.shift();
            }

            // Check if user is consistently loud (trying to interrupt)
            const allLoud = interruptRmsHistory.length >= INTERRUPT_SAMPLES &&
                            interruptRmsHistory.every(r => r > INTERRUPT_THRESHOLD);

            if (allLoud) {
              logger.vad('INTERRUPT detected!', { rms: Math.round(rms), history: interruptRmsHistory.map(r => Math.round(r)) });
              shouldInterrupt = true;
              interruptRmsHistory = [];
            }
            continue; // Don't process VAD while speaking (but audio is buffered)
          }

          // Pass isProcessing to discard audio while processing
          const audioData = voiceProcessor.processFrame(frame, isProcessing);

          if (audioData && !isProcessing) {
            isProcessing = true;
            const turnStart = Date.now();
            const settings = userSettings.get(userId) || { language: 'en', voiceId: ELEVENLABS_VOICE_ID };
            logger.info('Agent', '=== NEW TURN START ===', { userId, language: settings.language });

            try {
              // 1. Transcribe (with user's language)
              const transcript = await transcribe(audioData, frame.sampleRate, settings.language);
              if (!transcript || transcript.trim().length === 0) {
                logger.warn('Agent', 'Empty transcript, skipping');
                isProcessing = false;
                continue;
              }

              // 2. Check for duplicate
              if (voiceProcessor.isDuplicate(transcript)) {
                isProcessing = false;
                continue;
              }

              // Send user transcript
              await sendTranscript(room, 'user', transcript);

              // 3. Get AI response with RAG (will respond in user's language via Gemini)
              const response = await getAIResponseWithRAG(userId, transcript, settings.language, settings.languageName);

              // Send AI transcript
              await sendTranscript(room, 'model', response);

              // 4. Synthesize speech (with user's language and voice)
              const pcmData = await synthesizeSpeech(response, settings.language, settings.voiceId);

              if (pcmData && audioSource) {
                const SAMPLE_RATE = 24000;
                const FRAME_SIZE = 480;
                const totalFrames = Math.ceil(pcmData.length / FRAME_SIZE);
                const durationSec = pcmData.length / SAMPLE_RATE;

                logger.info('Agent', 'Playing audio', {
                  samples: pcmData.length,
                  durationSec: durationSec.toFixed(2),
                  frames: totalFrames
                });

                // Start speaking - enable interrupt detection
                isSpeaking = true;
                shouldInterrupt = false;
                interruptRmsHistory = [];

                let framesPlayed = 0;
                let wasInterrupted = false;

                for (let i = 0; i < pcmData.length; i += FRAME_SIZE) {
                  // Check for interrupt
                  if (shouldInterrupt) {
                    logger.info('Agent', 'PLAYBACK INTERRUPTED by user', {
                      framesPlayed,
                      totalFrames,
                      percentPlayed: Math.round((framesPlayed / totalFrames) * 100)
                    });
                    wasInterrupted = true;
                    audioSource.clearQueue?.();
                    break;
                  }

                  const end = Math.min(i + FRAME_SIZE, pcmData.length);
                  const numSamples = end - i;
                  const frameData = new Int16Array(numSamples);
                  for (let j = 0; j < numSamples; j++) {
                    frameData[j] = pcmData[i + j];
                  }
                  const audioFrame = new AudioFrame(frameData, SAMPLE_RATE, 1, numSamples);
                  await audioSource.captureFrame(audioFrame);
                  framesPlayed++;

                  // Yield to event loop every frame for immediate interrupt detection
                  await new Promise(resolve => setTimeout(resolve, 0));
                }

                // Wait for remaining audio to play (unless interrupted)
                if (!wasInterrupted) {
                  await audioSource.waitForPlayout();
                  const totalTurnTime = Date.now() - turnStart;
                  logger.info('Agent', '=== TURN COMPLETE ===', {
                    totalLatencyMs: totalTurnTime,
                    audioDurationSec: durationSec.toFixed(2)
                  });
                  voiceProcessor.clearInterruptBuffer();
                  await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                  // INTERRUPTED - Process what user said
                  logger.info('Agent', 'Processing interrupt audio...');
                  isSpeaking = false;

                  const interruptAudio = voiceProcessor.getInterruptBuffer();
                  if (interruptAudio.length > 8000) { // Min audio length
                    logger.info('Agent', 'Transcribing interrupt', { samples: interruptAudio.length });

                    const interruptTranscript = await transcribe(interruptAudio, 48000, settings.language);
                    if (interruptTranscript && interruptTranscript.trim().length > 0) {
                      logger.info('Agent', 'User interrupted with:', { text: interruptTranscript });

                      // Send user transcript
                      await sendTranscript(room, 'user', interruptTranscript);

                      // Get AI response to the interrupt
                      const interruptResponse = await getAIResponseWithRAG(userId, interruptTranscript, settings.language, settings.languageName);
                      await sendTranscript(room, 'model', interruptResponse);

                      // Synthesize and play new response (with user's language and voice)
                      const newPcmData = await synthesizeSpeech(interruptResponse, settings.language, settings.voiceId);
                      if (newPcmData && audioSource) {
                        isSpeaking = true;
                        shouldInterrupt = false;

                        for (let j = 0; j < newPcmData.length; j += FRAME_SIZE) {
                          if (shouldInterrupt) break;
                          const end = Math.min(j + FRAME_SIZE, newPcmData.length);
                          const numSamples = end - j;
                          const frameData = new Int16Array(numSamples);
                          for (let k = 0; k < numSamples; k++) {
                            frameData[k] = newPcmData[j + k];
                          }
                          const audioFrame = new AudioFrame(frameData, SAMPLE_RATE, 1, numSamples);
                          await audioSource.captureFrame(audioFrame);
                        }
                        await audioSource.waitForPlayout();
                      }
                    }
                  }
                }

                // Done speaking
                isSpeaking = false;
                shouldInterrupt = false;
                interruptRmsHistory = [];
                voiceProcessor.reset();
              }
            } catch (error) {
              logger.error('Agent', 'Processing error', { error: error.message, stack: error.stack });
              isSpeaking = false;
            }

            // Reset processor
            voiceProcessor.reset();
            isProcessing = false;
          }
        }
      })().catch(err => {
        logger.error('Agent', 'Audio processing error', { userId, error: err.message });
      });
    }
  });

  room.on(RoomEvent.ParticipantConnected, async (participant) => {
    const userId = participant.identity;

    // Parse user settings from metadata
    let settings = { language: 'en', languageName: 'English', voiceId: ELEVENLABS_VOICE_ID };
    try {
      if (participant.metadata) {
        const parsed = JSON.parse(participant.metadata);
        settings = { ...settings, ...parsed };
      }
    } catch (err) {
      logger.warn('Agent', 'Failed to parse participant metadata', { userId, error: err.message });
    }

    userSettings.set(userId, settings);
    logger.info('Agent', 'Participant connected', {
      userId,
      language: settings.language,
      languageName: settings.languageName,
      voiceId: settings.voiceId
    });

    // Load recent conversations into active window
    try {
      const recent = await getRecentConversations(userId, ACTIVE_WINDOW_SIZE);
      if (recent.length > 0) {
        activeWindows.set(userId, recent.map(c => ({
          sender: c.sender,
          text: c.text,
        })));
        logger.info('Agent', 'Loaded conversation history', { userId, messages: recent.length });
      }
    } catch (err) {
      logger.info('Agent', 'No history found (new user)', { userId });
    }
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    logger.info('Agent', 'Participant disconnected', { userId: participant.identity });
    voiceProcessors.delete(participant.identity);
  });

  room.on(RoomEvent.Disconnected, () => {
    logger.warn('Agent', 'Disconnected from room');
  });

  const token = await getAgentToken(roomName);
  await room.connect(LIVEKIT_URL, token);
  logger.info('Agent', 'Connected to room', { roomName, url: LIVEKIT_URL });

  audioSource = new AudioSource(24000, 1);
  const localTrack = LocalAudioTrack.createAudioTrack('agent-voice', audioSource);
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(localTrack, publishOptions);

  logger.info('Agent', '=== AGENT READY ===', {
    pipeline: 'Deepgram → RAG → Gemini → ElevenLabs'
  });

  process.on('SIGINT', async () => {
    logger.info('Agent', 'Shutting down...');
    await room.disconnect();
    process.exit(0);
  });
}

runAgent().catch(err => {
  logger.error('Agent', 'Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
