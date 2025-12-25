import { useState } from 'react';

const API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

export const useDeepgram = () => {
  const [transcribing, setTranscribing] = useState(false);

  /**
   * Transcribe audio to text
   * @param {Blob} audioBlob - Audio blob to transcribe
   * @param {string} language - Language code (e.g., 'en-US', 'hi', 'es')
   */
  const transcribe = async (audioBlob, language = 'en-US') => {
    setTranscribing(true);
    try {
      // Build URL with language parameter
      const params = new URLSearchParams({
        model: 'nova-2',
        smart_format: 'true',
        language: language,
      });

      const response = await fetch(`/api/deepgram/v1/listen?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'audio/*,',
        },
        body: audioBlob,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Deepgram API Error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.results?.channels[0]?.alternatives[0]?.transcript || "";

    } catch (err) {
      console.error('Deepgram Error:', err);
      return null;
    } finally {
      setTranscribing(false);
    }
  };

  return { transcribe, transcribing };
};
