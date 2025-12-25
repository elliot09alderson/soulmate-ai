import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '../logs');

// Create logs directory if it doesn't exist
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Create log file with timestamp
const timestamp = new Date().toISOString().split('T')[0];
const logFile = join(logsDir, `agent-${timestamp}.log`);
const logStream = createWriteStream(logFile, { flags: 'a' });

console.log(`[Logger] Writing to: ${logFile}`);

/**
 * Log levels
 */
const LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  VAD: 'VAD',      // Voice Activity Detection
  STT: 'STT',      // Speech to Text
  LLM: 'LLM',      // Language Model
  TTS: 'TTS',      // Text to Speech
  RAG: 'RAG',      // Memory/RAG
};

/**
 * Format log message
 */
function formatLog(level, component, message, data = null) {
  const time = new Date().toISOString();
  let logLine = `[${time}] [${level}] [${component}] ${message}`;
  
  if (data) {
    logLine += ` | ${JSON.stringify(data)}`;
  }
  
  return logLine;
}

/**
 * Write to both console and file
 */
function log(level, component, message, data = null) {
  const logLine = formatLog(level, component, message, data);
  
  // Console output (colored)
  const colors = {
    DEBUG: '\x1b[90m',   // Gray
    INFO: '\x1b[36m',    // Cyan
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    VAD: '\x1b[35m',     // Magenta
    STT: '\x1b[32m',     // Green
    LLM: '\x1b[34m',     // Blue
    TTS: '\x1b[33m',     // Yellow
    RAG: '\x1b[36m',     // Cyan
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${logLine}${reset}`);
  
  // File output
  logStream.write(logLine + '\n');
}

/**
 * Logger exports
 */
export const logger = {
  debug: (component, msg, data) => log(LEVELS.DEBUG, component, msg, data),
  info: (component, msg, data) => log(LEVELS.INFO, component, msg, data),
  warn: (component, msg, data) => log(LEVELS.WARN, component, msg, data),
  error: (component, msg, data) => log(LEVELS.ERROR, component, msg, data),
  
  // Specific loggers
  vad: (msg, data) => log(LEVELS.VAD, 'VAD', msg, data),
  stt: (msg, data) => log(LEVELS.STT, 'Deepgram', msg, data),
  llm: (msg, data) => log(LEVELS.LLM, 'Gemini', msg, data),
  tts: (msg, data) => log(LEVELS.TTS, 'ElevenLabs', msg, data),
  rag: (msg, data) => log(LEVELS.RAG, 'Memory', msg, data),
};

export default logger;
