/**
 * useAudioLevel Hook
 *
 * Captures and normalizes audio input from microphone or audio element.
 * Provides smoothed volume level for visual reactivity.
 */

import { useRef, useState, useCallback, useEffect, MutableRefObject } from 'react';

interface UseAudioLevelReturn {
  levelRef: MutableRefObject<number>;
  ready: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useAudioLevel(): UseAudioLevelReturn {
  const levelRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    if (ctxRef.current) {
      ctxRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    levelRef.current = 0;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      ctxRef.current = ctx;

      // Create analyser
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Connect stream to analyser
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start analyzing audio
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(data);

        // Calculate average frequency
        const avg = data.reduce((a, b) => a + b) / data.length;

        // Normalize to 0-1 range
        const norm = Math.min(1, Math.max(0, (avg - 16) / 90));

        // Smooth with easing
        levelRef.current += (norm - levelRef.current) * 0.15;

        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setReady(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to access microphone');
      console.error('Audio level error:', err);
    }
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { levelRef, ready, error, start, stop };
}
