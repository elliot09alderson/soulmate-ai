import { Firestore, FieldValue } from '@google-cloud/firestore';
import { generateEmbedding } from './embedding.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'soulmate4u-c2e63';
const APP_ID = 'soulmate-ai-mvp';

// Initialize Firestore
const firestore = new Firestore({
  projectId: PROJECT_ID,
  keyFilename: join(__dirname, '../serviceAccountKey.json'),
});

console.log(`[Memory] Initialized for project: ${PROJECT_ID}`);

/**
 * Generate embedding vector (768 dimensions)
 * Uses Vertex AI text-embedding-004 via REST API
 * Note: @google-cloud/vertexai SDK v1.10.0 doesn't support embedContent yet
 */
async function getEmbedding(text) {
  try {
    return await generateEmbedding(text);
  } catch (error) {
    console.error('[Memory] Embedding error:', error.message);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Save a conversation message
 */
export async function saveConversation(userId, message) {
  const conversationRef = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .doc();

  await conversationRef.set({
    ...message,
    timestamp: FieldValue.serverTimestamp(),
  });

  console.log(`[Memory] Saved conversation for ${userId}`);
  return conversationRef.id;
}

/**
 * Save a memory fact with vector embedding
 * Uses FieldValue.vector() for HNSW indexing
 */
export async function saveMemory(userId, fact, options = {}) {
  console.log(`[Memory] Saving memory for ${userId}: "${fact.substring(0, 50)}..."`);

  const vector = await getEmbedding(fact);

  const memoryRef = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('memories')
    .doc();

  await memoryRef.set({
    fact,
    embedding: FieldValue.vector(vector), // CRITICAL: Use FieldValue.vector for HNSW
    importance: options.importance || 3,
    category: options.category || 'general',
    lastAccessed: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    sourceMessages: options.sourceMessages || [],
  });

  console.log(`[Memory] Saved memory with ${vector.length} dim vector`);
  return memoryRef.id;
}

/**
 * Search memories using Firestore Vector Search (findNearest)
 * Returns top N most relevant memories
 */
export async function searchMemories(userId, query, limit = 5) {
  console.log(`[Memory] Searching for: "${query.substring(0, 50)}..."`);
  const startTime = Date.now();

  try {
    const queryVector = await getEmbedding(query);

    const memoriesRef = firestore
      .collection('artifacts')
      .doc(APP_ID)
      .collection('users')
      .doc(userId)
      .collection('memories');

    // Use findNearest for HNSW vector search
    const snapshot = await memoriesRef
      .findNearest('embedding', FieldValue.vector(queryVector), {
        limit,
        distanceMeasure: 'COSINE',
      })
      .get();

    const memories = snapshot.docs.map((doc) => ({
      id: doc.id,
      fact: doc.data().fact,
      importance: doc.data().importance,
      category: doc.data().category,
    }));

    console.log(`[Memory] Found ${memories.length} memories in ${Date.now() - startTime}ms`);

    // Update lastAccessed for retrieved memories
    if (memories.length > 0) {
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { lastAccessed: FieldValue.serverTimestamp() });
      });
      batch.commit().catch(console.error);
    }

    return memories;
  } catch (error) {
    console.error('[Memory] Search error:', error.message);
    return [];
  }
}

/**
 * Get recent conversations (for active window)
 */
export async function getRecentConversations(userId, limit = 10) {
  const snapshot = await firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .reverse();
}

/**
 * Get all memories for a user (for debugging)
 */
export async function getAllMemories(userId) {
  const snapshot = await firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('memories')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    fact: doc.data().fact,
    importance: doc.data().importance,
    category: doc.data().category,
    createdAt: doc.data().createdAt,
  }));
}

/**
 * Get conversation count since last archive
 */
export async function getConversationCount(userId, sinceTimestamp = null) {
  let query = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('conversations');

  if (sinceTimestamp) {
    query = query.where('timestamp', '>', sinceTimestamp);
  }

  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export { getEmbedding };
