/**
 * Conversation Storage Service for RAG
 * Stores conversations with both original language and English translation
 * for effective multilingual vector search
 */

const STORAGE_KEY = 'conversation_history';

/**
 * Conversation entry structure:
 * {
 *   id: string,
 *   timestamp: number,
 *   language: string,           // Original language code
 *   originalText: string,       // Text in original language
 *   englishText: string,        // English translation (for embeddings)
 *   role: 'user' | 'assistant',
 *   embedding?: number[],       // Vector embedding (optional, for future use)
 * }
 */

class ConversationStorage {
  constructor() {
    this.conversations = this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Failed to load conversations:', err);
      return [];
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.conversations));
    } catch (err) {
      console.error('Failed to save conversations:', err);
    }
  }

  /**
   * Store a conversation entry
   * @param {Object} entry - Conversation entry
   * @param {string} entry.originalText - Text in original language
   * @param {string} entry.englishText - English translation
   * @param {string} entry.language - Language code
   * @param {string} entry.role - 'user' or 'assistant'
   */
  async addEntry(entry) {
    const newEntry = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      language: entry.language || 'en',
      originalText: entry.originalText,
      englishText: entry.englishText || entry.originalText,
      role: entry.role,
    };

    this.conversations.push(newEntry);
    this.saveToStorage();

    // TODO: Generate and store embedding for englishText
    // This would integrate with Vertex AI or OpenAI embeddings API
    // await this.generateEmbedding(newEntry);

    return newEntry;
  }

  /**
   * Store a user message with translation
   */
  async addUserMessage(originalText, englishText, language) {
    return this.addEntry({
      originalText,
      englishText,
      language,
      role: 'user',
    });
  }

  /**
   * Store an assistant response with translation
   */
  async addAssistantMessage(originalText, englishText, language) {
    return this.addEntry({
      originalText,
      englishText,
      language,
      role: 'assistant',
    });
  }

  /**
   * Search conversations using English text (for consistent vector search)
   * @param {string} query - Search query in English
   * @param {number} limit - Max results
   */
  searchByText(query, limit = 5) {
    const queryLower = query.toLowerCase();
    return this.conversations
      .filter(c => c.englishText.toLowerCase().includes(queryLower))
      .slice(-limit);
  }

  /**
   * Get recent conversations
   */
  getRecent(limit = 10) {
    return this.conversations.slice(-limit);
  }

  /**
   * Get conversations by language
   */
  getByLanguage(language, limit = 10) {
    return this.conversations
      .filter(c => c.language === language)
      .slice(-limit);
  }

  /**
   * Clear all conversations
   */
  clear() {
    this.conversations = [];
    this.saveToStorage();
  }

  /**
   * Export conversations for backup or analysis
   */
  export() {
    return JSON.stringify(this.conversations, null, 2);
  }

  /**
   * Get statistics
   */
  getStats() {
    const languages = {};
    this.conversations.forEach(c => {
      languages[c.language] = (languages[c.language] || 0) + 1;
    });
    return {
      total: this.conversations.length,
      byLanguage: languages,
    };
  }
}

// Singleton instance
export const conversationStorage = new ConversationStorage();
export default conversationStorage;
