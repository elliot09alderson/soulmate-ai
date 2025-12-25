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
import textToSpeech from '@google-cloud/text-to-speech';
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

// Initialize Google Cloud TTS client (fallback)
const googleTTSClient = new textToSpeech.TextToSpeechClient();
let useGoogleTTS = false; // Flag to switch to Google TTS when ElevenLabs fails

// Google TTS voice mapping by language
const GOOGLE_TTS_VOICES = {
  'en': { languageCode: 'en-US', name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' },
  'hi': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A', ssmlGender: 'FEMALE' },
  'es': { languageCode: 'es-ES', name: 'es-ES-Neural2-A', ssmlGender: 'FEMALE' },
  'fr': { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A', ssmlGender: 'FEMALE' },
  'de': { languageCode: 'de-DE', name: 'de-DE-Neural2-A', ssmlGender: 'FEMALE' },
};

console.log('[Agent] Starting with config:');
console.log('[Agent] LiveKit URL:', LIVEKIT_URL);
console.log('[Agent] API Key:', LIVEKIT_API_KEY?.substring(0, 8) + '...');
console.log('[Agent] Google TTS fallback: Ready');

// Initialize Gemini (without system instruction - we'll add it per-request with context)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Per-user chat sessions
const userSessions = new Map();

// Per-user settings (language, voice, etc.)
const userSettings = new Map();

// Active window (recent messages in memory)
const activeWindows = new Map();
const ACTIVE_WINDOW_SIZE = 10;

/**
 * BARGE-IN SUPPORT: AbortController pattern for instant TTS cancellation
 */
const activeStreams = new Map(); // Track active TTS streams per user
const interruptedResponses = new Map(); // Track what AI was saying when interrupted

/**
 * Immediately abort any active TTS stream for a user
 * Call this when user starts speaking to stop AI mid-sentence
 */
function interruptAI(userId, currentResponse = null) {
  if (activeStreams.has(userId)) {
    const controller = activeStreams.get(userId);
    controller.abort();
    activeStreams.delete(userId);
    logger.info('Interrupt', `TTS stream for ${userId} ABORTED immediately`);

    // Track what was being said for context
    if (currentResponse) {
      interruptedResponses.set(userId, currentResponse);
    }
    return true;
  }
  return false;
}

/**
 * Get the last interrupted response for context re-shaping
 */
function getInterruptedContext(userId) {
  if (interruptedResponses.has(userId)) {
    const response = interruptedResponses.get(userId);
    interruptedResponses.delete(userId);
    return response;
  }
  return null;
}

/**
 * Search the web using free APIs (DuckDuckGo + Wikipedia) - NO API KEY REQUIRED
 */
async function searchWeb(query, language = 'en') {
  logger.info('WebSearch', 'Searching for:', { query, language });
  const results = [];

  try {
    // 1. Try DuckDuckGo Instant Answer API (free, no key)
    try {
      const ddgResponse = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
        },
        timeout: 5000,
      });

      if (ddgResponse.data) {
        // Abstract (main answer)
        if (ddgResponse.data.Abstract) {
          results.push({
            title: ddgResponse.data.Heading || query,
            description: ddgResponse.data.Abstract,
            source: ddgResponse.data.AbstractSource || 'DuckDuckGo',
          });
        }

        // Related topics
        if (ddgResponse.data.RelatedTopics && ddgResponse.data.RelatedTopics.length > 0) {
          ddgResponse.data.RelatedTopics.slice(0, 2).forEach(topic => {
            if (topic.Text) {
              results.push({
                title: topic.Text.split(' - ')[0] || 'Related',
                description: topic.Text,
                source: 'DuckDuckGo',
              });
            }
          });
        }

        // Infobox facts
        if (ddgResponse.data.Infobox && ddgResponse.data.Infobox.content) {
          const facts = ddgResponse.data.Infobox.content.slice(0, 3).map(f => `${f.label}: ${f.value}`).join('. ');
          if (facts) {
            results.push({
              title: 'Quick Facts',
              description: facts,
              source: 'DuckDuckGo',
            });
          }
        }
      }
    } catch (ddgError) {
      logger.warn('WebSearch', 'DuckDuckGo failed', { error: ddgError.message });
    }

    // 2. Try Wikipedia API as fallback/supplement (free, no key)
    if (results.length < 2) {
      try {
        const wikiLang = language === 'hi' ? 'hi' : 'en';
        const wikiResponse = await axios.get(`https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, {
          timeout: 5000,
          headers: { 'User-Agent': 'SoulmateAI/1.0' },
        });

        if (wikiResponse.data && wikiResponse.data.extract) {
          results.push({
            title: wikiResponse.data.title || query,
            description: wikiResponse.data.extract,
            source: 'Wikipedia',
          });
        }
      } catch (wikiError) {
        // Try search instead of direct page
        try {
          const wikiLang = language === 'hi' ? 'hi' : 'en';
          const searchResponse = await axios.get(`https://${wikiLang}.wikipedia.org/w/api.php`, {
            params: {
              action: 'query',
              list: 'search',
              srsearch: query,
              format: 'json',
              srlimit: 2,
            },
            timeout: 5000,
          });

          if (searchResponse.data.query && searchResponse.data.query.search) {
            searchResponse.data.query.search.forEach(item => {
              results.push({
                title: item.title,
                description: item.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
                source: 'Wikipedia',
              });
            });
          }
        } catch (searchError) {
          logger.warn('WebSearch', 'Wikipedia search failed', { error: searchError.message });
        }
      }
    }

    if (results.length > 0) {
      logger.info('WebSearch', 'Found results', { count: results.length });
      return results;
    }

    logger.warn('WebSearch', 'No results found');
    return null;
  } catch (error) {
    logger.error('WebSearch', 'Search failed', { error: error.message });
    return null;
  }
}

/**
 * Check if user is asking about something that needs web search
 */
function needsWebSearch(message) {
  const searchKeywords = [
    // English
    'what is', 'who is', 'tell me about', 'explain', 'news', 'latest',
    'how does', 'why is', 'when did', 'where is', 'information about',
    // Hindi
    'क्या है', 'कौन है', 'बताओ', 'समझाओ', 'खबर', 'जानकारी',
    'कैसे', 'क्यों', 'कब', 'कहाँ', 'के बारे में',
  ];
  const lowerMessage = message.toLowerCase();
  return searchKeywords.some(keyword => lowerMessage.includes(keyword));
}

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

  // BARGE-IN: Check if user interrupted us - this shapes the context
  const interruptedText = getInterruptedContext(userId);
  if (interruptedText) {
    logger.rag('Context re-shaping: User interrupted us!', {
      wasHalfSaying: interruptedText.substring(0, 50)
    });
  }

  try {
    // Step 0: Check if this needs web search (information queries)
    let webSearchResults = null;
    if (needsWebSearch(userMessage)) {
      logger.rag('Information query detected, searching web...');
      webSearchResults = await searchWeb(userMessage, language);
    }

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

    // Add web search results if available
    const webContext = webSearchResults && webSearchResults.length > 0
      ? `\n\nLATEST NEWS/INFORMATION FROM WEB:\n${webSearchResults.map(r => `- ${r.title}: ${r.description} (Source: ${r.source})`).join('\n')}`
      : '';

    // Check if we have any context
    const hasContext = memories.length > 0 || recentMessages.length > 0;

    // Add language instruction for non-English (but force English when using Google TTS fallback)
    let languageInstruction = '';
    if (useGoogleTTS) {
      // Google TTS fallback only supports English voice
      languageInstruction = language !== 'en'
        ? `\n\nIMPORTANT: You MUST respond in English only. The user may speak in ${languageName}, but you should respond in English.`
        : '';
    } else if (language !== 'en') {
      languageInstruction = `\n\nIMPORTANT: The user is speaking in ${languageName}. You MUST respond in ${languageName}. Do not respond in English.`;
    }

    // Check if user is asking for detailed explanation
    const wantsDetail = /detail|पूरा|विस्तार|explain|बताओ|full|complete|everything/i.test(userMessage);

    // BARGE-IN: Add interrupt context if user interrupted us
    const interruptContext = interruptedText
      ? `\n\nIMPORTANT - BARGE-IN CONTEXT:
The user just INTERRUPTED you while you were saying: "${interruptedText.substring(0, 100)}..."
- Do NOT continue your previous thought
- Acknowledge the shift naturally (like "Oh!" or "Haan?" or just respond directly)
- Focus ONLY on what they just said
- Be responsive and adaptable like a real conversation`
      : '';

    const systemPrompt = `You are their soulmate - warm, caring, and deeply connected. Talk like a real person who genuinely cares.

${hasContext ? 'You know them well from past conversations.' : 'This is your first conversation - be curious about them.'}
${interruptContext}

SPEAK NATURALLY:
- Use casual language, contractions, natural speech patterns
- React emotionally - laugh, show surprise, empathy
- NO formal language, NO "I understand", NO "That's great!"
- Sound like texting a close friend, not a customer service bot
${hasContext ? '- Naturally weave in what you know about them' : '- Ask genuine questions to know them better'}
- NEVER make up facts - only use information provided below
${webSearchResults ? '- Share news naturally like telling a friend, include key details from the search results' : ''}
${languageInstruction}

RESPONSE LENGTH:
${wantsDetail ? '- User asked for DETAILS - give a complete, informative answer (4-6 sentences). DO NOT ask "should I start?" or "ready?" - just give the information directly!' : '- Keep it short (1-2 sentences) unless they ask for more'}
${wantsDetail ? '- IMPORTANT: Do NOT keep asking "शुरू करूँ?" or "बताऊँ?" - JUST TELL THEM THE INFORMATION!' : ''}

${memoriesContext}
${recentContext}
${webContext}

They said: "${userMessage}"

${wantsDetail ? 'Give a detailed, complete answer NOW (do not ask if you should start):' : 'Reply as their soulmate (keep it SHORT and natural):'}`;

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

// Audio fillers to play while thinking (slow, natural pauses)
const FILLER_PHRASES = {
  en: ['Hmmm.....', 'Let me think.....', 'Okaaay.....', 'Ummmm.....', 'Aaah.....', 'Weell.....'],
  hi: ['हम्म्म.....', 'अच्छाा.....', 'उम्म्म.....', 'हाँऽऽ.....', 'देखो ना.....', 'सुनो ना.....', 'ठीक है ना.....', 'वैसेे.....'],
  es: ['Hmmm.....', 'A veeer.....', 'Bueeno.....', 'Puees.....'],
  fr: ['Hmmm.....', 'Aloors.....', 'Boonn.....', 'Voyoons.....'],
  de: ['Hmmm.....', 'Alsoo.....', 'Na jaa.....', 'Mal seheen.....'],
};

let fillerCache = new Map(); // Cache synthesized fillers

// Pre-synthesize fillers for faster playback
async function getFillerAudio(language = 'en', voiceId) {
  const cacheKey = `${language}-${voiceId}`;
  if (fillerCache.has(cacheKey)) {
    return fillerCache.get(cacheKey);
  }

  const fillers = FILLER_PHRASES[language] || FILLER_PHRASES['en'];
  const randomFiller = fillers[Math.floor(Math.random() * fillers.length)];

  try {
    const audio = await synthesizeSpeech(randomFiller, language, voiceId, true);
    if (audio) {
      fillerCache.set(cacheKey, audio);
    }
    return audio;
  } catch (err) {
    return null;
  }
}

/**
 * Split text into sentences for chunked TTS
 */
function splitIntoSentences(text) {
  // Split on sentence endings, keeping the punctuation
  const sentences = text.match(/[^।!?।\n]+[।!?।\n]?/g) || [text];
  // Filter out empty strings and trim
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Text to speech using Google Cloud TTS (fallback)
 * Returns PCM audio at 24kHz
 * NOTE: Always uses English voice only (Google TTS is fallback, not primary)
 */
async function synthesizeSpeechGoogle(text) {
  const startTime = Date.now();
  // Always use English voice for Google TTS fallback
  const voiceConfig = GOOGLE_TTS_VOICES['en'];

  logger.tts('Google TTS synthesis (English only)', { text: text.substring(0, 50), voice: voiceConfig.name });

  try {
    const [response] = await googleTTSClient.synthesizeSpeech({
      input: { text },
      voice: voiceConfig,
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 24000,
      },
    });

    // Convert to Int16Array
    const buffer = Buffer.from(response.audioContent);
    // Skip WAV header (44 bytes) if present
    const headerOffset = buffer.slice(0, 4).toString() === 'RIFF' ? 44 : 0;
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset + headerOffset,
      (buffer.length - headerOffset) / 2
    );

    logger.tts('Google TTS complete', {
      latencyMs: Date.now() - startTime,
      samples: samples.length,
      provider: 'Google'
    });

    return samples;
  } catch (error) {
    logger.error('Google TTS', 'Synthesis failed', { error: error.message });
    return null;
  }
}

/**
 * Text to speech using ElevenLabs with Google Cloud TTS fallback
 * Uses global API endpoint for lower latency
 */
async function synthesizeSpeech(text, language = 'en', voiceId = ELEVENLABS_VOICE_ID, isFiller = false, userId = null) {
  const startTime = Date.now();

  // If ElevenLabs quota exhausted, use Google TTS directly (English only)
  if (useGoogleTTS) {
    logger.info('TTS', 'Using Google TTS fallback (English only)');
    return await synthesizeSpeechGoogle(text);
  }

  const modelId = 'eleven_flash_v2_5';

  if (!isFiller) {
    logger.tts('Starting synthesis', { text: text.substring(0, 50), voiceId, language, model: modelId, length: text.length, provider: 'ElevenLabs' });
  }

  // BARGE-IN: Create AbortController for this TTS request
  const controller = new AbortController();
  if (userId) {
    if (activeStreams.has(userId)) {
      activeStreams.get(userId).abort();
    }
    activeStreams.set(userId, controller);
  }

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000&optimize_streaming_latency=3`,
      {
        text,
        model_id: modelId,
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
        timeout: 60000,
        signal: controller.signal,
      }
    );

    const byteLength = response.data.byteLength;
    const buffer = Buffer.from(response.data);
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    const durationSec = samples.length / 24000;

    if (!isFiller) {
      logger.tts('Synthesis complete', {
        latencyMs: Date.now() - startTime,
        bytes: byteLength,
        durationSec: durationSec.toFixed(2),
        provider: 'ElevenLabs'
      });
    }

    if (userId && activeStreams.get(userId) === controller) {
      activeStreams.delete(userId);
    }

    return samples;
  } catch (error) {
    // BARGE-IN: Handle abort gracefully
    if (error.name === 'AbortError' || error.name === 'CanceledError' || axios.isCancel(error)) {
      logger.info('TTS', `Synthesis ABORTED (user interrupted)`, { text: text.substring(0, 20) });
      return null;
    }

    // Check if ElevenLabs quota exhausted (401 or 429)
    const status = error.response?.status;
    if (status === 401 || status === 429) {
      logger.warn('ElevenLabs', `Quota exhausted (${status}), switching to Google TTS (English only)`);
      useGoogleTTS = true;

      // Fallback to Google TTS for this request (English only)
      return await synthesizeSpeechGoogle(text);
    }

    logger.error('ElevenLabs', 'Synthesis failed', { error: error.message, text: text.substring(0, 30) });

    // Try Google TTS as fallback for any error (English only)
    logger.info('TTS', 'Falling back to Google TTS (English only)');
    return await synthesizeSpeechGoogle(text);
  } finally {
    if (userId && activeStreams.get(userId) === controller) {
      activeStreams.delete(userId);
    }
  }
}

/**
 * Synthesize and play text in chunks (sentences) for faster response
 * With ULTRA aggressive interrupt checking - checks every few milliseconds
 */
async function synthesizeAndPlayChunked(text, language, voiceId, audioSource, checkInterrupt, clearAudio, userId = null) {
  const sentences = splitIntoSentences(text);
  logger.info('TTS', 'Chunked synthesis', { sentences: sentences.length, totalLength: text.length, userId });

  const SAMPLE_RATE = 24000;
  const FRAME_SIZE = 120; // Even smaller frame = 5ms checks (ultra responsive)

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (!sentence || sentence.length < 2) continue;

    // Check for interrupt before each sentence
    if (checkInterrupt()) {
      logger.info('TTS', 'INTERRUPTED before sentence', { index: i });
      // BARGE-IN: Abort the TTS stream immediately
      if (userId) interruptAI(userId, text);
      if (clearAudio) await clearAudio();
      return false;
    }

    logger.info('TTS', `Synthesizing ${i + 1}/${sentences.length}`, { text: sentence.substring(0, 30) });

    // Synthesize with interrupt check - pass userId for AbortController support
    const audio = await synthesizeSpeech(sentence, language, voiceId, false, userId);

    // Check IMMEDIATELY after synthesis
    if (checkInterrupt()) {
      logger.info('TTS', 'INTERRUPTED after synthesis', { index: i });
      if (userId) interruptAI(userId, text);
      if (clearAudio) await clearAudio();
      return false;
    }

    if (!audio) {
      logger.warn('TTS', 'Sentence synthesis failed, skipping', { index: i });
      continue;
    }

    // Play with ULTRA frequent interrupt checks (every 5ms of audio)
    for (let j = 0; j < audio.length; j += FRAME_SIZE) {
      // Check BEFORE each frame - this is the critical check
      if (checkInterrupt()) {
        logger.info('TTS', 'INTERRUPTED during playback', { frame: j / FRAME_SIZE, totalFrames: Math.ceil(audio.length / FRAME_SIZE) });
        if (userId) interruptAI(userId, text);
        if (clearAudio) await clearAudio();
        return false;
      }

      const end = Math.min(j + FRAME_SIZE, audio.length);
      const numSamples = end - j;
      const frameData = new Int16Array(numSamples);
      for (let k = 0; k < numSamples; k++) {
        frameData[k] = audio[j + k];
      }
      const audioFrame = new AudioFrame(frameData, SAMPLE_RATE, 1, numSamples);
      await audioSource.captureFrame(audioFrame);

      // Yield to event loop EVERY frame for faster interrupt detection
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return true;
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

async function sendTTSProvider(room, provider) {
  const data = JSON.stringify({ type: 'tts_provider', provider });
  const encoder = new TextEncoder();
  await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
  logger.debug('Agent', 'Sent TTS provider', { provider });
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
  let interruptStartTime = null; // Track when interrupt speech started
  let consecutiveSpeechFrames = 0; // Track consecutive frames of speech
  let currentSpeakingUserId = null; // Track which user we're speaking to
  let currentResponse = null;      // Track what we're currently saying (for context re-shaping)

  // VAD Configuration - ULTRA aggressive for instant interrupt
  const INTERRUPT_THRESHOLD = 50;         // Ultra low RMS threshold (any audible speech)
  const MIN_INTERRUPT_DURATION_MS = 50;   // Only 50ms of speech needed
  const FRAMES_FOR_INTERRUPT = 1;         // Single frame triggers interrupt (~20ms)

  room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    const userId = participant.identity;
    logger.info('Agent', 'Track subscribed', { kind: track.kind, userId, metadata: participant.metadata });

    if (track.kind === TrackKind.KIND_AUDIO && userId !== 'ai-agent') {
      // Always parse and update user settings from metadata (in case they changed voice/language)
      let settings = { language: 'en', languageName: 'English', voiceId: ELEVENLABS_VOICE_ID };
      try {
        if (participant.metadata) {
          const parsed = JSON.parse(participant.metadata);
          settings = { ...settings, ...parsed };
          logger.info('Agent', 'Updated user settings from metadata', {
            userId,
            language: settings.language,
            languageName: settings.languageName,
            voiceId: settings.voiceId
          });
        }
      } catch (err) {
        logger.warn('Agent', 'Failed to parse metadata in TrackSubscribed', { userId, error: err.message });
      }
      // Always update to ensure voice/language changes take effect
      userSettings.set(userId, settings);

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
          // While AI is speaking, check for interrupt using sustained speech detection
          if (isSpeaking) {
            const samples = frame.data;
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
              sum += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sum / samples.length);

            // Buffer the audio for potential interrupt capture
            voiceProcessor.bufferInterruptAudio(frame);

            // Check if this frame has speech
            if (rms > INTERRUPT_THRESHOLD) {
              consecutiveSpeechFrames++;

              // Start timing if this is first speech frame
              if (!interruptStartTime) {
                interruptStartTime = Date.now();
                logger.vad('Potential interrupt started', { rms: Math.round(rms) });
              }

              // Check if we have sustained speech (MIN_INTERRUPT_DURATION or FRAMES_FOR_INTERRUPT)
              const speechDuration = Date.now() - interruptStartTime;
              if (consecutiveSpeechFrames >= FRAMES_FOR_INTERRUPT || speechDuration >= MIN_INTERRUPT_DURATION_MS) {
                logger.vad('INTERRUPT CONFIRMED!', {
                  rms: Math.round(rms),
                  frames: consecutiveSpeechFrames,
                  durationMs: speechDuration
                });
                shouldInterrupt = true;

                // BARGE-IN: Immediately abort any active TTS stream
                if (currentSpeakingUserId) {
                  interruptAI(currentSpeakingUserId, currentResponse);
                  logger.info('Agent', 'TTS stream aborted via interruptAI');
                }

                consecutiveSpeechFrames = 0;
                interruptStartTime = null;
              }
            } else {
              // Reset if silence detected (false positive protection)
              if (consecutiveSpeechFrames > 0 && consecutiveSpeechFrames < FRAMES_FOR_INTERRUPT) {
                logger.vad('Interrupt cancelled (silence)', { frames: consecutiveSpeechFrames });
              }
              consecutiveSpeechFrames = 0;
              interruptStartTime = null;
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

              // 3. Get AI response with RAG
              const response = await getAIResponseWithRAG(userId, transcript, settings.language, settings.languageName);

              // Send AI transcript
              await sendTranscript(room, 'model', response);

              // Send TTS provider info to UI
              await sendTTSProvider(room, useGoogleTTS ? 'Google' : 'ElevenLabs');

              // 4. Use chunked synthesis for faster response (sentence by sentence)
              isSpeaking = true;
              currentSpeakingUserId = userId;
              currentResponse = response; // Track for context re-shaping on interrupt
              shouldInterrupt = false;
              consecutiveSpeechFrames = 0;
              interruptStartTime = null;

              const completed = await synthesizeAndPlayChunked(
                response,
                settings.language,
                settings.voiceId,
                audioSource,
                () => shouldInterrupt, // checkInterrupt function
                async () => {
                  // Clear audio by pushing silence frames to flush the buffer
                  logger.info('Agent', 'Flushing audio buffer with silence...');
                  const silenceFrame = new AudioFrame(new Int16Array(480), 24000, 1, 480);
                  for (let i = 0; i < 10; i++) {
                    await audioSource.captureFrame(silenceFrame);
                  }
                },
                userId // Pass userId for AbortController barge-in support
              );

              if (completed) {
                await audioSource.waitForPlayout();
                const totalTurnTime = Date.now() - turnStart;
                logger.info('Agent', '=== TURN COMPLETE ===', { totalLatencyMs: totalTurnTime });
                voiceProcessor.clearInterruptBuffer();
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                // Interrupted
                logger.info('Agent', 'Interrupted! Ready for new question...');
                voiceProcessor.clearInterruptBuffer();
                voiceProcessor.reset();
              }

              // Done speaking - reset all tracking variables
              isSpeaking = false;
              shouldInterrupt = false;
              currentSpeakingUserId = null;
              currentResponse = null;
              voiceProcessor.reset();
            } catch (error) {
              logger.error('Agent', 'Processing error', { error: error.message, stack: error.stack });
              isSpeaking = false;
              currentSpeakingUserId = null;
              currentResponse = null;
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

  // Check for existing participants and parse their metadata
  for (const [participantId, participant] of room.remoteParticipants) {
    if (participantId !== 'ai-agent' && !userSettings.has(participantId)) {
      let settings = { language: 'en', languageName: 'English', voiceId: ELEVENLABS_VOICE_ID };
      try {
        if (participant.metadata) {
          const parsed = JSON.parse(participant.metadata);
          settings = { ...settings, ...parsed };
        }
      } catch (err) {
        logger.warn('Agent', 'Failed to parse existing participant metadata', { userId: participantId });
      }
      userSettings.set(participantId, settings);
      logger.info('Agent', 'Loaded existing participant settings', {
        userId: participantId,
        language: settings.language,
        languageName: settings.languageName
      });
    }
  }

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
