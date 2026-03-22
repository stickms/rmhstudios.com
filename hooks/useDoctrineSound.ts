/**
 * Sound effect hook for Tung Tung Tung / Sahur mode.
 * Plays sounds on user interactions. Uses the Web Audio API.
 */

import { useCallback, useRef } from 'react';
import { useDoctrineStore } from '@/stores/doctrineStore';

export function useDoctrineSound() {
  const sahurActive = useDoctrineStore(s => s.sahurActive);
  const audioContext = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
    return audioContext.current;
  }, []);

  const playTung = useCallback(() => {
    if (!sahurActive) return;

    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio not available — silent fail
    }
  }, [sahurActive, getContext]);

  const playSuccess = useCallback(() => {
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Silent fail
    }
  }, [getContext]);

  return { playTung, playSuccess };
}
