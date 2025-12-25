import { useState, useRef } from 'react';

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null); // Add source ref for cleanup
  const monitoringRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Initialize stream
  const getStream = async () => {
    // Check if existing stream is valid and active - REUSE IT!
    if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (streamRef.current.active && tracks.length > 0 && tracks[0].readyState === 'live') {
            return streamRef.current; 
        }
    }
    
    try {
      console.log('Acquiring new microphone stream...');
      // Echo cancellation needed for barge-in
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      return null;
    }
  };

  const startMonitoring = async (onSpeechStart) => {
    try {
        const stream = await getStream();
        if (!stream) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Ensure context is running (sometimes it suspends automatically)
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        // Cleanup old specific nodes (Source/Analyser) but KEEP the Context
        if (sourceRef.current) {
            try { sourceRef.current.disconnect(); } catch(e){}
            sourceRef.current = null;
        }
        if (analyserRef.current) {
             try { analyserRef.current.disconnect(); } catch(e){}
             analyserRef.current = null;
        }

        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        sourceRef.current = source;
        analyserRef.current = analyser; // Store for cleanup

        monitoringRef.current = true;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let frames = 0;

        const checkVolume = () => {
          if (!monitoringRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;

          // Debug logs every ~60 frames (approx 1 sec)
          frames++;
          if (frames % 60 === 0) {
              console.log('Current Volume:', average);
          }

          // Threshold for speech detection (adjustable)
          if (average > 20) {
             monitoringRef.current = false; // Stop monitoring once detected
             onSpeechStart();
          } else {
             requestAnimationFrame(checkVolume);
          }
        };

        checkVolume();
    } catch (err) {
        console.error('Error starting monitoring:', err);
    }
  };

  const startSilenceDetection = async (onSilence) => {
    // Ensure we have stream and processing setup
    const stream = await getStream();
    if (!stream) return;

    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    if (!analyserRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
    }

    monitoringRef.current = true;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let silenceStart = null;
    const SILENCE_THRESHOLD = 50; // Increased to 50 to ensure it stops even with some noise
    const SILENCE_DURATION = 2000; // 2.0 seconds

    const checkSilence = () => {
       if (!monitoringRef.current) return;

       analyserRef.current.getByteFrequencyData(dataArray);
       let sum = 0;
       for (let i = 0; i < bufferLength; i++) {
         sum += dataArray[i];
       }
       const average = sum / bufferLength;

       if (average < SILENCE_THRESHOLD) {
           if (!silenceStart) {
               silenceStart = Date.now();
           } else if (Date.now() - silenceStart > SILENCE_DURATION) {
               monitoringRef.current = false;
               onSilence();
               return; // Stop loop
           }
       } else {
           silenceStart = null; // Reset silence timer if noise detected
       }

       requestAnimationFrame(checkSilence);
    };

    checkSilence();
  };

  const stopMonitoring = () => {
    monitoringRef.current = false;
  };

  const startRecording = async () => {
    try {
      const stream = await getStream();
      if (!stream) return;

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return resolve(null);

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        setRecording(false);
        
        // CRITICAL CHANGE: Do NOT stop tracks here. Keep stream 'hot' for monitoring.
        // We only stop the MediaRecorder (the file writing).
        // The stream (microphone) stays open for VAD.
        
        resolve(audioBlob);
      };

      mediaRecorderRef.current.stop();
    });
  };

  // New function to completely kill the mic
  const releaseMicrophone = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      analyserRef.current = null; // Reset analyser
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          // audioContextRef.current.close(); // Optional: close context or keep it
      }
      monitoringRef.current = false;
  };

  return { startRecording, stopRecording, startMonitoring, stopMonitoring, startSilenceDetection, releaseMicrophone, recording };
};
