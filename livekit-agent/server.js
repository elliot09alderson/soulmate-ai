import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeFirebase, verifyIdToken, getOrCreateUser } from './services/firebase.js';
import { searchMemories, getRecentConversations, getAllMemories } from './services/memory.js';
import { archiveConversations } from './services/archiver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Initialize Firebase
initializeFirebase();

const app = express();
app.use(cors());
app.use(express.json());

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

// Middleware to optionally verify Firebase token
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await verifyIdToken(idToken);

    if (decoded) {
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        isAnonymous: decoded.firebase?.sign_in_provider === 'anonymous',
      };
    }
  }

  // If no auth, create anonymous session
  if (!req.user) {
    req.user = {
      uid: `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isAnonymous: true,
    };
  }

  next();
}

// Generate token for client
app.post('/api/token', optionalAuth, async (req, res) => {
  const { roomName, voiceId, language, languageName } = req.body;
  const userId = req.user.uid;

  if (!roomName) {
    return res.status(400).json({ error: 'roomName required' });
  }

  try {
    // Get or create user in Firestore
    const user = await getOrCreateUser(userId, {
      isAnonymous: req.user.isAnonymous,
      email: req.user.email,
    });

    // Create participant metadata with voice/language settings
    const metadata = JSON.stringify({
      voiceId: voiceId || 'XB0fDUnXU5powFXDhCwa',
      language: language || 'en',
      languageName: languageName || 'English',
    });

    // Create LiveKit token with metadata
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '1h',
      metadata: metadata,
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    console.log(`[Token Server] Generated token for ${userId} with language: ${language || 'en'}`);

    res.json({
      token: jwt,
      url: LIVEKIT_URL,
      userId,
      isNewUser: user.isNew,
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Get user memories (for debugging/admin)
app.get('/api/memories/:userId', async (req, res) => {
  try {
    const memories = await getAllMemories(req.params.userId);
    res.json({ memories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search memories
app.post('/api/memories/search', async (req, res) => {
  const { userId, query, limit } = req.body;

  try {
    const memories = await searchMemories(userId, query, limit || 5);
    res.json({ memories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent conversations
app.get('/api/conversations/:userId', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const conversations = await getRecentConversations(req.params.userId, limit);
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger archiver (for testing)
app.post('/api/archive/:userId', async (req, res) => {
  try {
    const result = await archiveConversations(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.TOKEN_SERVER_PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Token Server] Running on http://localhost:${PORT}`);
  console.log(`[Token Server] LiveKit URL: ${LIVEKIT_URL}`);
});
