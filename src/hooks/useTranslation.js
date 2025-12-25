import { useState } from 'react';

// Supported languages with Deepgram language codes
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', deepgramCode: 'en-US' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', deepgramCode: 'hi' },
  { code: 'es', name: 'Spanish', native: 'Español', deepgramCode: 'es' },
  { code: 'fr', name: 'French', native: 'Français', deepgramCode: 'fr' },
  { code: 'de', name: 'German', native: 'Deutsch', deepgramCode: 'de' },
  { code: 'ja', name: 'Japanese', native: '日本語', deepgramCode: 'ja' },
  { code: 'ko', name: 'Korean', native: '한국어', deepgramCode: 'ko' },
  { code: 'zh', name: 'Chinese', native: '中文', deepgramCode: 'zh' },
  { code: 'pt', name: 'Portuguese', native: 'Português', deepgramCode: 'pt' },
  { code: 'ar', name: 'Arabic', native: 'العربية', deepgramCode: 'ar' },
];

export const useLanguage = () => {
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const getLanguageConfig = (code) => {
    return SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
  };

  const currentLanguage = getLanguageConfig(selectedLanguage);

  /**
   * Get system prompt suffix to instruct AI to respond in the selected language
   */
  const getLanguageInstruction = () => {
    if (selectedLanguage === 'en') {
      return '';
    }
    const lang = getLanguageConfig(selectedLanguage);
    return `\n\nIMPORTANT: The user is speaking in ${lang.name}. You MUST respond in ${lang.name} (${lang.native}). Do not respond in English unless the user specifically asks for it.`;
  };

  return {
    selectedLanguage,
    setSelectedLanguage,
    currentLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
    getLanguageInstruction,
    getLanguageConfig,
  };
};
