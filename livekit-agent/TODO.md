# Soulmate AI - Implementation TODO

## ✅ Completed

- [x] LiveKit voice agent setup (Deepgram STT → Gemini → ElevenLabs TTS)
- [x] Firestore integration with vector search (HNSW index)
- [x] Memory service with `FieldValue.vector()` + `findNearest()`
- [x] Embedding service (Vertex AI text-embedding-004, 768 dims)
- [x] Archiver service (extracts facts every 20 messages)
- [x] RAG pipeline in agent.js (memories + active window → Gemini)
- [x] Token server with Firebase Auth support
- [x] Test conversation saved (User: Pratik, 6 memories extracted)

---

## 🔜 Next Up

### 1. Firebase Auth in Frontend
**Priority:** HIGH
**Status:** ✅ IMPLEMENTED

**Completed Tasks:**
- [x] Initialize Firebase in frontend app (`src/services/firebase.js`)
- [x] Add `signInAnonymously()` on app load (AuthContext)
- [x] Store auth state in context/provider (`src/contexts/AuthContext.jsx`)
- [x] Send `Authorization: Bearer ${idToken}` header with API calls (useLiveKit)
- [x] Update LiveKitVoiceChat to use AuthContext
- [ ] **ACTION NEEDED:** Add Firebase web config to `.env` (VITE_FIREBASE_API_KEY, etc.)
- [ ] Test that same user ID persists across sessions

### 2. Google Sign-In (Optional Enhancement)
**Priority:** MEDIUM  
**Why:** Cross-device memory persistence, account linking

**Tasks:**
- [ ] Add Google Sign-In button
- [ ] Link anonymous account to Google account
- [ ] Migrate memories when linking accounts

---

## 📝 Future Improvements

### Memory System
- [ ] Memory decay (reduce importance of unused memories over time)
- [ ] Memory deduplication (avoid storing similar facts)
- [ ] Memory categories UI (show user what AI remembers)
- [ ] Manual memory deletion by user

### Voice Experience
- [x] Interrupt handling (stop AI when user speaks) - IMPLEMENTED
- [x] Logging system for debugging (`services/logger.js`)
- [x] Duplicate message detection
- [ ] Emotion detection from voice
- [ ] Multiple voice options (let user choose)
- [ ] Voice activity visualization

### Conversation
- [ ] Proactive check-ins ("Hey Pratik, how's Yashishri?")
- [ ] Date/time awareness ("Good morning!" vs "Good evening!")
- [ ] Mood tracking over time
- [ ] Conversation summaries

### Performance
- [ ] Batch embedding requests
- [ ] Cache frequent memory searches
- [ ] Reduce TTS latency with streaming

---

## 🧪 Test Data

**User ID:** `anon-1766605295894-qbfr3qsl0`

**Extracted Memories:**
1. User's name is Pratik (importance: 5)
2. User is a software engineer with 4.5 years experience (importance: 5)
3. User considers himself a 'monster developer' (importance: 4)
4. User's wife's name is Yashishri (importance: 5)
5. User's friend's name is Nitesh (importance: 3)
6. User has a brother named Abhishek, nickname Shanu (importance: 4)

---

*Last updated: $(date '+%Y-%m-%d %H:%M')*
