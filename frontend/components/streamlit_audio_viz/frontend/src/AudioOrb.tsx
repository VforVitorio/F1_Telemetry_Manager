/**
 * Audio Orb Component
 *
 * Displays an animated orb that visualizes audio in real-time.
 * Uses Web Audio API and WebGL shaders for smooth, reactive animations.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ComponentProps, OrbState } from './types';
import { useAudioLevel } from './useAudioLevel';
import { Iridescence } from './Iridescence';

export const AudioOrb: React.FC<ComponentProps> = ({
  audioBlob,
  isRecording,
  isProcessing,
  isPlaying,
  theme = 'dark',
  onAudioEnded
}) => {
  const orbRef = useRef<HTMLDivElement>(null);
  const [currentState, setCurrentState] = useState<OrbState>('idle');
  const { levelRef, ready, error, start, stop } = useAudioLevel();
  const [level, setLevel] = useState(0);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const playbackLevelRef = useRef(0); // Target level from audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Debug: log all props and state
  console.log('AudioOrb props:', {
    theme,
    isRecording,
    isProcessing,
    isPlaying,
    currentState
  });

  // Determine current state
  useEffect(() => {
    if (isProcessing) {
      setCurrentState('processing');
    } else if (isRecording) {
      setCurrentState('recording');
    } else if (isPlaying) {
      setCurrentState('playing');
    } else {
      setCurrentState('idle');
    }
  }, [isRecording, isProcessing, isPlaying]);

  // Start/stop audio capture - ALWAYS LISTEN in Voice Mode
  useEffect(() => {
    if (!ready) {
      start();
    }
  }, [ready, start]);

  // Update level smoothly with EXTREME smoothing for fluid motion
  useEffect(() => {
    let raf = 0;
    const update = () => {
      setLevel(prev => {
        const target = levelRef.current;
        // Very slow smoothing (0.02) to eliminate jitter/bounciness
        return prev + (target - prev) * 0.02;
      });
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  // Update playback level smoothly - EXACT SAME as breathing (proven to work perfectly)
  useEffect(() => {
    let raf = 0;
    const update = () => {
      setPlaybackLevel(prev => {
        const target = playbackLevelRef.current;
        // Use EXACT same smoothing as breathing (0.02) - proven to work without jitter
        return prev + (target - prev) * 0.02;
      });
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Analyze playback audio when playing TTS response
  useEffect(() => {
    // Reset playback level when not playing
    if (!isPlaying || !audioBlob) {
      playbackLevelRef.current = 0;

      // Cleanup any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return;
    }

    // Create audio context and analyser for playback audio
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Large FFT for smooth analysis
    analyser.smoothingTimeConstant = 0.95; // High smoothing

    audioContextRef.current = audioContext;

    // Create audio element from blob
    const blob = new Blob([audioBlob], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    // Connect audio to analyser
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    // Auto-stop animation when audio ends
    audio.addEventListener('ended', () => {
      console.log('Audio ended - resetting playback level');
      playbackLevelRef.current = 0;
      // Notify Streamlit that audio has ended
      if (onAudioEnded) {
        onAudioEnded();
      }
    });

    // Start playback
    audio.play().catch(err => console.warn('Audio playback failed:', err));

    // Analyze audio levels - SIMPLE approach like breathing (let useEffect do smoothing)
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;

    const updatePlaybackLevel = () => {
      // Only update if audio is still playing
      if (audio.paused || audio.ended) {
        playbackLevelRef.current = 0;
        animationFrame = requestAnimationFrame(updatePlaybackLevel);
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Calculate average amplitude (focus on mid-low frequencies for voice)
      const voiceFreqData = dataArray.slice(0, Math.floor(dataArray.length / 6));
      const average = voiceFreqData.reduce((sum, val) => sum + val, 0) / voiceFreqData.length;
      const normalized = average / 255;

      // CRITICAL: Attenuate to EXTREME levels (like breathing intensity)
      // User reports: still trembling - reduce to 5% of original intensity
      const attenuated = normalized * 0.05; // Reduce to 5% of original (was 0.15)

      // Simply update the ref - let the continuous useEffect do all the smoothing
      playbackLevelRef.current = attenuated;

      animationFrame = requestAnimationFrame(updatePlaybackLevel);
    };

    updatePlaybackLevel();

    // Cleanup on unmount or when playback stops
    return () => {
      cancelAnimationFrame(animationFrame);
      audio.pause();
      audioContext.close();
      URL.revokeObjectURL(url);
    };
  }, [isPlaying, audioBlob]);

  // Determine effective level based on current state
  // - Recording: use microphone level
  // - Playing: use playback audio level (NEW: reacts to TTS audio)
  // - Idle/Processing: use 0 (static breathing animation)
  const effectiveLevel =
    currentState === 'recording' ? level :
    currentState === 'playing' ? playbackLevel :
    0;

  // Time in seconds
  const time = Date.now() / 1000;

  // --- Physics / Math Configuration (ULTRA SLOW & FLUID) ---
  
  // Base breathing parameters
  const BASE_SCALE = 1.1;  // 10% larger orb
  const BASE_FREQ = 0.15; // Extremely slow breathing (6+ seconds per breath)
  const BASE_AMP = 0.06;  // Increased breathing depth (was 0.02)

  // NEW APPROACH: No size changes - only COLOR and MOVEMENT changes when playing
  // Keep breathing animation constant, change visual appearance through color and shader

  // Main breathing animation (always same - no size reaction to audio)
  const breathingScale = BASE_SCALE + Math.sin(time * BASE_FREQ * Math.PI * 2) * BASE_AMP;

  // --- State Logic - NEW APPROACH ---
  // Size stays constant (breathing), only color and movement change

  let scale = breathingScale; // Always use breathing scale
  let shaderSpeed = 0.1;
  let shaderAmp = 0.1;
  let glowOpacity = 0.3;
  let color: [number, number, number] = theme === 'dark'
    ? [0.7, 0.4, 1.0]  // Purple (idle)
    : [0.6, 0.3, 0.95];

  if (currentState === 'processing') {
    // Processing: nervous pulse with purple color
    shaderSpeed = 0.5;
    shaderAmp = 0.3;
    glowOpacity = 0.5 + Math.sin(time * 2.5) * 0.1;
  } else if (currentState === 'playing') {
    // Playing: SMOOTH transition to turquoise/cyan tones with more movement
    // Color shifts from purple [0.7, 0.4, 1.0] to turquoise [0.2, 0.85, 0.95]
    const turquoiseIntensity = Math.min(playbackLevel * 20, 1); // Smooth 0-1 transition
    color = theme === 'dark'
      ? [
          0.7 - (turquoiseIntensity * 0.5),  // R: 0.7 → 0.2 (much less red)
          0.4 + (turquoiseIntensity * 0.45), // G: 0.4 → 0.85 (more green for turquoise)
          1.0 - (turquoiseIntensity * 0.05)  // B: 1.0 → 0.95 (slightly less blue)
        ]
      : [0.6, 0.3, 0.95];

    // More fluid, wavy movement when speaking - INCREASED waves
    shaderSpeed = 0.6 + (playbackLevel * 1.0); // Faster shader movement with more waves
    shaderAmp = 0.6 + (playbackLevel * 0.8);   // More waves/ripples
    glowOpacity = 0.4 + (playbackLevel * 0.3); // Subtle glow
  } else if (currentState === 'recording') {
    // Recording: React to mic input
    shaderSpeed = 0.2 + level * 0.3;
    shaderAmp = 0.2 + level * 0.3;
    glowOpacity = 0.3 + level * 0.4;
  }
  // Idle: use default values (already set above)

  return (
    <div
      className={`orb-container ${theme}`}
      ref={orbRef}
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #121127 0%, #1e1b4b 100%)'
          : '#ffffff'
      }}
    >
      <div className="orb-wrapper">
        {/* Glow effect */}
        <div
          className="orb-glow"
          style={{
            opacity: glowOpacity,
            transition: 'opacity 0.1s ease-out'
          }}
        />

        {/* Iridescent orb */}
        <div
          className="orb-inner"
          style={{
            transform: `scale(${scale})`,
            // Remove CSS transition for scale to allow smooth JS animation
            transition: 'none' 
          }}
        >
          <Iridescence
            color={color}
            speed={shaderSpeed}
            amplitude={shaderAmp}
            theme={theme}
          />
        </div>
      </div>

      {/* Error display */}
      {error && currentState === 'recording' && (
        <div className="orb-error">
          <span>🎤 {error}</span>
        </div>
      )}

      {/* Debug state indicator (optional) */}
      {/* <div className="state-indicator">{currentState} - level: {level.toFixed(2)}</div> */}
    </div>
  );
};

export default AudioOrb;
