import { GoogleGenerativeAI } from '@google/generative-ai';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { saveMemory } from './memory.js';
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

// Initialize Gemini for fact extraction
const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

const extractionModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
  systemInstruction: {
    parts: [{
      text: `You are a memory extraction AI. Analyze conversations and extract permanent, meaningful facts about the user.

RULES:
1. Extract ONLY facts useful for future conversations
2. Focus on: personal details, preferences, relationships, experiences, goals
3. Ignore: greetings, small talk, temporary states
4. Each fact must be a complete, standalone sentence
5. Assign importance 1-5 (5 = core identity)
6. Assign category: family, work, hobbies, preferences, health, goals, relationships, general

OUTPUT FORMAT (JSON array):
[
  {"fact": "User's name is Pratik", "importance": 5, "category": "general"},
  {"fact": "User has a sister named Priya in Bangalore", "importance": 4, "category": "family"}
]

Return empty array [] if no facts found.`
    }]
  }
});

/**
 * Extract facts from conversations
 */
export async function extractFacts(conversations) {
  if (!conversations || conversations.length === 0) return [];

  console.log(`[Archiver] Extracting facts from ${conversations.length} messages...`);

  const conversationText = conversations
    .map((c) => `${c.sender === 'user' ? 'User' : 'AI'}: ${c.text}`)
    .join('\n');

  try {
    const result = await extractionModel.generateContent(
      `Extract memorable facts:\n\n${conversationText}`
    );

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.log('[Archiver] No facts extracted');
      return [];
    }

    const facts = JSON.parse(jsonMatch[0]);
    console.log(`[Archiver] Extracted ${facts.length} facts`);
    return facts;
  } catch (error) {
    console.error('[Archiver] Extraction error:', error.message);
    return [];
  }
}

/**
 * Archive conversations for a user (triggered every 20 messages)
 */
export async function archiveConversations(userId, options = {}) {
  const batchSize = options.batchSize || 20;
  console.log(`[Archiver] Starting archive for ${userId}...`);

  const userRef = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId);

  const userDoc = await userRef.get();
  const lastArchivedAt = userDoc.data()?.lastArchivedAt || null;

  let query = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('conversations')
    .orderBy('timestamp', 'asc');

  if (lastArchivedAt) {
    query = query.where('timestamp', '>', lastArchivedAt);
  }

  const snapshot = await query.limit(batchSize).get();

  if (snapshot.empty) {
    console.log('[Archiver] No new conversations');
    return { factsExtracted: 0, messagesProcessed: 0 };
  }

  const conversations = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const facts = await extractFacts(conversations);
  const messageIds = conversations.map((c) => c.id);
  let savedCount = 0;

  for (const fact of facts) {
    try {
      await saveMemory(userId, fact.fact, {
        importance: fact.importance,
        category: fact.category,
        sourceMessages: messageIds,
      });
      savedCount++;
    } catch (error) {
      console.error(`[Archiver] Failed to save: ${error.message}`);
    }
  }

  // Update archive timestamp
  const lastMessage = conversations[conversations.length - 1];
  await userRef.set({
    lastArchivedAt: lastMessage.timestamp || FieldValue.serverTimestamp(),
    lastArchiveRun: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`[Archiver] Saved ${savedCount} facts from ${conversations.length} messages`);
  return { factsExtracted: savedCount, messagesProcessed: conversations.length };
}

/**
 * Check if archiving is needed
 */
export async function shouldArchive(userId, threshold = 20) {
  const userRef = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId);

  const userDoc = await userRef.get();
  const lastArchivedAt = userDoc.data()?.lastArchivedAt || null;

  let query = firestore
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId)
    .collection('conversations');

  if (lastArchivedAt) {
    query = query.where('timestamp', '>', lastArchivedAt);
  }

  const snapshot = await query.count().get();
  return snapshot.data().count >= threshold;
}

/**
 * Trigger archiver in background
 */
export function triggerArchiveIfNeeded(userId) {
  shouldArchive(userId).then((needed) => {
    if (needed) {
      console.log(`[Archiver] Triggering for ${userId}`);
      archiveConversations(userId).catch(console.error);
    }
  });
}
