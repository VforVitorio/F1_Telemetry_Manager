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
  theme = 'dark'
}) => {
  const orbRef = useRef<HTMLDivElement>(null);
  const [currentState, setCurrentState] = useState<OrbState>('idle');
  const { levelRef, ready, error, start, stop } = useAudioLevel();
  const [level, setLevel] = useState(0);

  // Debug: log theme
  console.log('AudioOrb theme:', theme);

  // Determine current state
  useEffect(() => {
    if (isProcessing) {
      setCurrentState('processing');
    } else if (isRecording) {
      setCurrentState('recording');
    } else {
      setCurrentState('idle');
    }
  }, [isRecording, isProcessing]);

  // Start/stop audio capture based on recording state
  useEffect(() => {
    if (isRecording && !ready) {
      start();
    } else if (!isRecording && ready) {
      stop();
    }
  }, [isRecording, ready, start, stop]);

  // Update level smoothly
  useEffect(() => {
    let raf = 0;
    const update = () => {
      setLevel(prev => {
        const target = levelRef.current;
        return prev + (target - prev) * 0.25;
      });
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  // Calculate audio-reactive parameters
  const amplitude = currentState === 'recording'
    ? 0.18 + level * 1.7
    : currentState === 'processing'
    ? 0.5 + Math.sin(Date.now() * 0.003) * 0.3
    : 0.18;

  const speed = currentState === 'recording'
    ? 0.75 + level * 0.5
    : currentState === 'processing'
    ? 1.2
    : 0.75;

  const scale = currentState === 'recording'
    ? 1 + level * 0.35
    : currentState === 'processing'
    ? 1 + Math.sin(Date.now() * 0.005) * 0.15
    : 1;

  const glowOpacity = currentState === 'recording'
    ? 0.25 + level * 2.45
    : currentState === 'processing'
    ? 0.6 + Math.sin(Date.now() * 0.004) * 0.3
    : 0.25;

  // Purple color theme
  const color: [number, number, number] = theme === 'dark'
    ? [0.7, 0.4, 1.0]  // Brighter purple for dark theme
    : [0.6, 0.3, 0.95]; // Darker purple for light theme

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
            transition: currentState === 'recording' ? 'opacity 0.12s ease-out' : 'opacity 0.3s ease-out'
          }}
        />

        {/* Iridescent orb */}
        <div
          className="orb-inner"
          style={{
            transform: `scale(${scale})`,
            transition: currentState === 'recording' ? 'transform 0.12s ease-out' : 'transform 0.3s ease-out'
          }}
        >
          <Iridescence
            color={color}
            speed={speed}
            amplitude={amplitude}
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
