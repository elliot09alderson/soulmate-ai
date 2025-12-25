import axios from 'axios';
import { useState, useRef, useEffect } from 'react';

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = 'XB0fDUnXU5powFXDhCwa'; // Charlotte (Standard Female, Conversational)

export const useElevenLabs = () => {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
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
      setVoices(response.data.voices || []);
    } catch (err) {
      console.error('Failed to fetch ElevenLabs voices:', err);
    } finally {
      setLoadingVoices(false);
    }
  };

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

  const speak = async (text, onEnd) => {
    if (!text) {
        if (onEnd) onEnd();
        return;
    }
    stop(); // Stop any previous audio
    setSpeaking(true);
    try {
      console.log('ElevenLabs: Speaking text:', text); // Debug log
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          text,
          model_id: 'eleven_flash_v2_5', // Flash v2.5: Ultra-low latency (~75ms) & 50% cheaper
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
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
    loadingVoices,
    fetchVoices
  };
};
