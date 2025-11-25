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
  theme = 'dark'
}) => {
  const orbRef = useRef<HTMLDivElement>(null);
  const [currentState, setCurrentState] = useState<OrbState>('idle');
  const { levelRef, ready, error, start, stop } = useAudioLevel();
  const [level, setLevel] = useState(0);

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

  // Simulate audio level for playback state
  // REMOVED: User requested the exact same calm animation as idle, just larger.
  // So we force simulatedLevel to 0 to avoid any jittery speech patterns.
  const simulatedLevel = 0;

  // Determine effective level
  // Only use mic level if we are explicitly in 'recording' state.
  // Otherwise, clamp to 0 to prevent background noise animation when idle or playing.
  const effectiveLevel = (currentState === 'recording' ? level : 0);

  // Time in seconds
  const time = Date.now() / 1000;

  // --- Physics / Math Configuration (ULTRA SLOW & FLUID) ---
  
  // Base breathing parameters
  const BASE_SCALE = 1.0;
  const BASE_FREQ = 0.15; // Extremely slow breathing (6+ seconds per breath)
  const BASE_AMP = 0.06;  // Increased breathing depth (was 0.02)

  // Playback specific boost
  const PLAYING_SCALE_BOOST = 0.25; // Increase size by 25% when playing
  const PLAYING_AMP_BOOST = 0.04;   // Deeper breathing when playing

  // Voice reaction factors (Significantly reduced for stability)
  const AMP_FACTOR = 0.1;    // Minimal depth increase
  const FREQ_FACTOR = 0.05;  // Almost no speed up, keeps it calm
  const SIZE_FACTOR = 0.15;  // Gentle expansion, no "bouncing"

  // Calculate dynamic parameters
  const currentFreq = BASE_FREQ + (effectiveLevel * FREQ_FACTOR);
  
  // Amplitude: Base + Voice Reaction + Playback Boost
  const currentAmp = BASE_AMP + (effectiveLevel * AMP_FACTOR) + (currentState === 'playing' ? PLAYING_AMP_BOOST : 0);

  // Base Scale: Base + Voice Expansion + Playback Boost
  const currentBaseScale = BASE_SCALE + (effectiveLevel * SIZE_FACTOR) + (currentState === 'playing' ? PLAYING_SCALE_BOOST : 0);

  // Main breathing animation
  const breathingScale = currentBaseScale + Math.sin(time * currentFreq * Math.PI * 2) * currentAmp;

  // --- State Logic ---

  let scale = 1.0;
  let shaderSpeed = 0.1;
  let shaderAmp = 0.1;
  let glowOpacity = 0.3;

  // Unified logic: The orb ALWAYS breathes and reacts to audio
  // We just change the intensity slightly based on state
  
  scale = breathingScale;
  
  if (currentState === 'processing') {
    // Processing: slightly faster, nervous pulse
    scale = 1.05 + Math.sin(time * 2.5) * 0.015; // Slower pulse
    shaderSpeed = 0.5;
    shaderAmp = 0.3;
    glowOpacity = 0.5 + Math.sin(time * 2.5) * 0.1;
  } else {
    // Recording, Playing, or Idle
    // Shader reacts to energy - faster base movement
    shaderSpeed = 0.2 + effectiveLevel * 0.3; 
    shaderAmp = 0.2 + effectiveLevel * 0.3;
    glowOpacity = 0.3 + effectiveLevel * 0.4;
    
    // Boost glow slightly when playing
    if (currentState === 'playing') {
        glowOpacity += 0.2;
        shaderSpeed += 0.2; // More movement when playing
    }
  }

  // Purple color theme
  const color: [number, number, number] = theme === 'dark'
    ? [0.7, 0.4, 1.0]
    : [0.6, 0.3, 0.95];

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
