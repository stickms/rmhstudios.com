import { useEffect, useRef } from 'react';
import { useStudioStore } from '../store';
import { StudioEngine } from '../engine/StudioEngine';
import { TransportController } from '../engine/TransportController';

/**
 * useTransport — bridges the Zustand store to the Tone.js transport.
 *
 * Syncs store state changes (play/pause/bpm/loop/metronome) to the
 * actual audio engine, and pipes position updates back to the store.
 */
export function useTransport() {
  const controllerRef = useRef<TransportController | null>(null);

  const isPlaying = useStudioStore((s) => s.isPlaying);
  const bpm = useStudioStore((s) => s.bpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const metronomeEnabled = useStudioStore((s) => s.metronomeEnabled);

  // Initialize controller when engine is ready
  useEffect(() => {
    const engine = StudioEngine.getInstance();
    if (!engine.initialized) return;

    const ctrl = new TransportController(engine);
    controllerRef.current = ctrl;

    // Pipe position updates to store (throttled by 16n scheduling)
    ctrl.setOnPositionUpdate((beat) => {
      useStudioStore.getState().setCurrentBeat(beat);
    });

    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Sync play/pause state
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    try {
      if (isPlaying) {
        ctrl.play();
      } else {
        ctrl.pause();
      }
    } catch {
      // Engine may not be initialized yet
    }
  }, [isPlaying]);

  // Sync BPM
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    try {
      ctrl.setBpm(bpm);
    } catch {}
  }, [bpm]);

  // Sync loop
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    try {
      ctrl.setLoop(loopEnabled, loopStart, loopEnd);
    } catch {}
  }, [loopEnabled, loopStart, loopEnd]);

  // Sync metronome
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    try {
      if (metronomeEnabled) {
        ctrl.enableMetronome();
      } else {
        ctrl.disableMetronome();
      }
    } catch {}
  }, [metronomeEnabled]);

  return controllerRef;
}
