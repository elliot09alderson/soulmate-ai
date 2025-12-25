---
title: Memory System (RAG Pipeline)
tags:
  - memory
  - rag
  - firestore
  - embeddings
  - vertex-ai
  - personalization
---

# Memory System (RAG)

Retrieval-Augmented Generation for personalized, context-aware responses.

---

## The Problem

Without memory:
- AI forgets everything between sessions
- No personalization
- User has to repeat context
- Feels like talking to a stranger each time

---

## Solution: RAG Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG PIPELINE                              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ STORE PHASE (after each conversation)               │    │
│  │                                                      │    │
│  │  User says: "I love pizza"                          │    │
│  │       │                                              │    │
│  │       ▼                                              │    │
│  │  ┌──────────┐    ┌──────────────┐    ┌──────────┐   │    │
│  │  │ Firestore│    │ Vertex AI    │    │ Memory   │   │    │
│  │  │ Store    │ →  │ Embed text   │ →  │ Archive  │   │    │
│  │  │ raw msg  │    │ (vector)     │    │ facts    │   │    │
│  │  └──────────┘    └──────────────┘    └──────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ RETRIEVE PHASE (before each response)               │    │
│  │                                                      │    │
│  │  User asks: "What should we eat?"                   │    │
│  │       │                                              │    │
│  │       ▼                                              │    │
│  │  ┌──────────┐    ┌──────────────┐    ┌──────────┐   │    │
│  │  │ Embed    │    │ Vector       │    │ Hydrate  │   │    │
│  │  │ query    │ →  │ similarity   │ →  │ LLM      │   │    │
│  │  │          │    │ search       │    │ prompt   │   │    │
│  │  └──────────┘    └──────────────┘    └──────────┘   │    │
│  │                                                      │    │
│  │  Result: "You mentioned you love pizza"             │    │
│  │                                                      │    │
│  │  AI: "How about pizza? I know you love it!"         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Firestore (Conversation Storage)

Stores all messages in `users/{userId}/conversations` collection.

```javascript
// services/memory.js
async function saveConversation(userId, message) {
  const docRef = db.collection('users')
    .doc(userId)
    .collection('conversations')
    .doc();

  await docRef.set({
    sender: message.sender,  // 'user' or 'ai'
    text: message.text,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    embedding: null  // Set later by archiver
  });
}
```

### 2. Vertex AI Embeddings

Converts text to 768-dimensional vectors for similarity search.

```javascript
// services/memory.js
const { PredictionServiceClient } = require('@google-cloud/aiplatform');

async function getEmbedding(text) {
  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004`;

  const response = await client.predict({
    endpoint,
    instances: [{ content: text }],
    parameters: { outputDimensionality: 768 }
  });

  return response.predictions[0].embeddings.values;
}
```

### 3. Memory Archiver

Extracts facts from conversations every N messages.

```javascript
// services/archiver.js
async function archiveMemories(userId) {
  // Get recent unarchived conversations
  const recent = await getUnarchived(userId, 20);

  // Use LLM to extract facts
  const prompt = `Extract key facts about this user from these messages:
  ${recent.map(m => `${m.sender}: ${m.text}`).join('\n')}

  Return as JSON array of facts.`;

  const facts = await extractFacts(prompt);

  // Store facts with embeddings
  for (const fact of facts) {
    const embedding = await getEmbedding(fact);
    await storeMemory(userId, fact, embedding);
  }
}
```

---

## Active Window

Last N messages kept in memory for immediate context.

```javascript
const activeWindows = new Map();  // userId → messages[]
const ACTIVE_WINDOW_SIZE = 10;

function addToActiveWindow(userId, message) {
  if (!activeWindows.has(userId)) {
    activeWindows.set(userId, []);
  }

  const window = activeWindows.get(userId);
  window.push(message);

  // Keep only last N
  if (window.length > ACTIVE_WINDOW_SIZE) {
    window.shift();
  }
}
```

---

## Semantic Search

Find relevant memories using vector similarity.

```javascript
async function searchMemories(userId, query, limit = 5) {
  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Get all memories for user
  const memories = await db.collection('users')
    .doc(userId)
    .collection('memories')
    .get();

  // Calculate cosine similarity
  const scored = memories.docs.map(doc => {
    const memory = doc.data();
    const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
    return { ...memory, similarity };
  });

  // Return top matches
  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## Prompt Hydration

Retrieved context is injected into the LLM prompt.

```javascript
async function getAIResponseWithRAG(userId, userMessage, language) {
  // 1. Search relevant memories
  const memories = await searchMemories(userId, userMessage, 5);

  // 2. Get active window
  const recent = getActiveWindow(userId);

  // 3. Build context strings
  const memoriesContext = memories.length > 0
    ? `RELEVANT MEMORIES:\n${memories.map(m => `- ${m.fact}`).join('\n')}`
    : '';

  const recentContext = recent.length > 0
    ? `RECENT CONVERSATION:\n${recent.map(m =>
        `${m.sender === 'user' ? 'User' : 'You'}: ${m.text}`
      ).join('\n')}`
    : '';

  // 4. Build full prompt
  const prompt = `
    You are their soulmate...

    ${memoriesContext}

    ${recentContext}

    They said: "${userMessage}"
  `;

  return await generateResponse(prompt);
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW                                 │
│                                                              │
│  User Message                                                │
│       │                                                      │
│       ├──────────────────────────────────────────┐          │
│       │                                          │          │
│       ▼                                          ▼          │
│  ┌──────────┐                           ┌──────────────┐    │
│  │ Save to  │                           │ Search       │    │
│  │ Firestore│                           │ memories     │    │
│  └──────────┘                           └──────────────┘    │
│       │                                          │          │
│       │ (async)                                  │          │
│       ▼                                          ▼          │
│  ┌──────────┐                           ┌──────────────┐    │
│  │ Every 20 │                           │ Get active   │    │
│  │ messages │                           │ window       │    │
│  └──────────┘                           └──────────────┘    │
│       │                                          │          │
│       ▼                                          ▼          │
│  ┌──────────┐                           ┌──────────────┐    │
│  │ Archive  │                           │ Hydrate      │    │
│  │ facts    │                           │ prompt       │    │
│  └──────────┘                           └──────────────┘    │
│                                                  │          │
│                                                  ▼          │
│                                         ┌──────────────┐    │
│                                         │ Generate     │    │
│                                         │ response     │    │
│                                         └──────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Firestore Structure

```
firestore/
├── users/
│   └── {userId}/
│       ├── conversations/          # Raw messages
│       │   ├── {msgId}/
│       │   │   ├── sender: "user" | "ai"
│       │   │   ├── text: "..."
│       │   │   ├── timestamp: Timestamp
│       │   │   └── archived: boolean
│       │   └── ...
│       │
│       └── memories/               # Extracted facts
│           ├── {memoryId}/
│           │   ├── fact: "User loves pizza"
│           │   ├── embedding: [768 floats]
│           │   ├── source: "conversation"
│           │   └── timestamp: Timestamp
│           └── ...
```

---

## Configuration

```javascript
// Memory settings
const ACTIVE_WINDOW_SIZE = 10;        // Messages in active window
const ARCHIVE_EVERY_N = 20;           // Archive after N messages
const SEARCH_LIMIT = 5;               // Max memories to retrieve
const EMBEDDING_DIMENSION = 768;      // Vertex AI embedding size

// Environment variables
FIREBASE_PROJECT_ID=your-project-id
VERTEX_AI_LOCATION=asia-south1
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

---

## Related

- [[02-Voice-Pipeline]] - Where RAG fits in the pipeline
- [[01-Architecture]] - System overview

#memory #rag #firestore #embeddings #vertex-ai #personalization
