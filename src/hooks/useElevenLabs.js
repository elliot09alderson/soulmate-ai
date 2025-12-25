import axios from 'axios';
import { useState, useRef, useEffect, useMemo } from 'react';

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = 'XB0fDUnXU5powFXDhCwa'; // Charlotte (Standard Female, Conversational)

// Known multilingual voices that work well with Hindi
const MULTILINGUAL_VOICE_IDS = [
  'EXAVITQu4vr4xnSDxMaL', // Sarah (multilingual)
  'FGY2WhTYpPnrIDTdsKH5', // Laura (multilingual)
  'TX3LPaxmHKxFdv7VOQHJ', // Liam (multilingual)
  'XB0fDUnXU5powFXDhCwa', // Charlotte
  'pFZP5JQG7iQjIQuC4Bku', // Lily
  'onwK4e9ZLuTAKqWW03F9', // Daniel (multilingual)
  'JBFqnCBsd6RMkjVDRZzb', // George (multilingual)
  'N2lVS1w4EtoT3dr4eOWO', // Callum (multilingual)
  'IKne3meq5aSn9XLyUdCD', // Charlie (multilingual)
  'XrExE9yKIg1WjnnlVkGX', // Matilda (multilingual)
];

export const useElevenLabs = () => {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [allVoices, setAllVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const audioRef = useRef(null);

  // Fetch available voices from ElevenLabs
  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': API_KEY,
        },
      });
      const fetchedVoices = response.data.voices || [];
      setAllVoices(fetchedVoices);
      setVoices(fetchedVoices);
    } catch (err) {
      console.error('Failed to fetch ElevenLabs voices:', err);
    } finally {
      setLoadingVoices(false);
    }
  };

  // Filter voices based on language - show multilingual voices for non-English
  const filteredVoices = useMemo(() => {
    if (selectedLanguage === 'en') {
      return allVoices;
    }
    // For non-English, prioritize multilingual voices
    const multilingualVoices = allVoices.filter(voice =>
      MULTILINGUAL_VOICE_IDS.includes(voice.voice_id) ||
      voice.labels?.use_case?.toLowerCase().includes('multilingual') ||
      voice.name?.toLowerCase().includes('multilingual')
    );
    // If no multilingual voices found, return all voices (user can try any)
    return multilingualVoices.length > 0 ? multilingualVoices : allVoices;
  }, [allVoices, selectedLanguage]);

  // Update voices when language changes
  useEffect(() => {
    setVoices(filteredVoices);
    // If current voice is not in filtered list, select first available
    if (filteredVoices.length > 0 && !filteredVoices.find(v => v.voice_id === selectedVoiceId)) {
      setSelectedVoiceId(filteredVoices[0].voice_id);
    }
  }, [filteredVoices, selectedVoiceId]);

  // Fetch voices on mount
  useEffect(() => {
    fetchVoices();
  }, []);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setSpeaking(false);
    }
  };

  const speak = async (text, onEnd, language = selectedLanguage) => {
    if (!text) {
        if (onEnd) onEnd();
        return;
    }
    stop(); // Stop any previous audio
    setSpeaking(true);
    try {
      // Use multilingual model for non-English languages (Hindi, etc.)
      const modelId = language === 'en' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';
      console.log(`ElevenLabs: Speaking in ${language} using model ${modelId}:`, text);

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75, // Higher for better multilingual pronunciation
          },
        },
        {
          headers: {
            'role': 'application/json',
            'xi-api-key': API_KEY,
          },
          responseType: 'arraybuffer', // Better for lighter response than blob sometimes, but blob is fine. Sticking to blob for consistency with code.
          timeout: 10000, // 10 second timeout to prevent hanging
        }
      );

      // Convert blob to base64 for playing (or play blob URL directly)
      // Convert arraybuffer to blob to create object URL
      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      await audio.play();
      
      // Clean up URL after playing (optional, roughly)
      audio.onended = () => {
         URL.revokeObjectURL(audioUrl);
         setSpeaking(false);
         audioRef.current = null;
         if (onEnd) onEnd();
      };
      
    } catch (err) {
      console.error('ElevenLabs Error:', err);
      console.error('Error Details:', err.response?.data);
      setSpeaking(false);
      // Even on error, we should probably trigger onEnd so the loop doesn't hang
      if (onEnd) onEnd(); 
    }
  };

  return {
    speak,
    speaking,
    stop,
    voices,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedLanguage,
    setSelectedLanguage,
    loadingVoices,
    fetchVoices
  };
};
