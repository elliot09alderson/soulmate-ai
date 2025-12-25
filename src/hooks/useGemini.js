import { GoogleGenerativeAI } from '@google/generative-ai';
import { useState, useRef, useCallback } from 'react';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

const BASE_SYSTEM_PROMPT = `
You are a helpful, witty, and concise AI assistant for a voice-based conversation. You are like a 'Soulmate' or a close friend.
CRITICAL INSTRUCTION: Keep your responses EXTREMELY BRIEF, conversational, and to the point.
- Do NOT give long explanations unless explicitly asked.
- Do NOT use markdown formatting like bold, italics, or lists, as this is a voice conversation.
- Answer in 1-2 short sentences whenever possible.
- Avoid formal greetings or sign-offs.
- Be friendly and engaging but concise.
`;

export const useGemini = () => {
  const [loading, setLoading] = useState(false);
  const chatSessionRef = useRef(null);
  const currentLanguageRef = useRef('en');
  const [history, setHistory] = useState([]);

  // Create or recreate chat session with language instruction
  const initChatSession = useCallback((languageInstruction = '') => {
    const systemPrompt = BASE_SYSTEM_PROMPT + languageInstruction;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    });

    chatSessionRef.current = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 200,
      },
    });

    return chatSessionRef.current;
  }, []);

  // Update language - recreates session with new language instruction
  const setLanguage = useCallback((languageCode, languageInstruction = '') => {
    if (currentLanguageRef.current !== languageCode) {
      currentLanguageRef.current = languageCode;
      // Recreate session with new language
      initChatSession(languageInstruction);
      // Optionally clear history when language changes
      setHistory([]);
    }
  }, [initChatSession]);

  const getChatSession = useCallback(() => {
    if (!chatSessionRef.current) {
      initChatSession();
    }
    return chatSessionRef.current;
  }, [initChatSession]);

  const sendMessage = async (text) => {
    setLoading(true);
    try {
      const chat = getChatSession();
      const result = await chat.sendMessage(text);
      const response = result.response.text();

      const newHistoryItem = { role: 'user', parts: [{ text }] };
      const newResponseItem = { role: 'model', parts: [{ text: response }] };

      setHistory(prev => [...prev, newHistoryItem, newResponseItem]);
      return response;
    } catch (err) {
      console.error('Gemini Error:', err);
      return "I'm having trouble connecting right now.";
    } finally {
      setLoading(false);
    }
  };

  /**
   * Translate text to English (for RAG storage)
   */
  const translateToEnglish = async (text, fromLanguage) => {
    if (fromLanguage === 'en' || !text) return text;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(
        `Translate the following text to English. Only provide the translation, nothing else:\n\n${text}`
      );
      return result.response.text().trim();
    } catch (err) {
      console.error('Translation error:', err);
      return text;
    }
  };

  return {
    sendMessage,
    loading,
    history,
    setLanguage,
    translateToEnglish,
    currentLanguage: currentLanguageRef.current
  };
};
