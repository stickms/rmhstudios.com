import { useCallback, useEffect, useRef } from 'react';
import { useStudioStore } from '../store';
import { StudioEngine } from '../engine/StudioEngine';
import { TransportController } from '../engine/TransportController';

/**
 * useTransport — bridges the Zustand store to the Tone.js transport.
 *
 * Syncs store state changes (play/pause/bpm/loop/metronome) to the
 * actual audio engine, and pipes position updates back to the store.
 */
export function useTransport(engineReady = false) {
  const controllerRef = useRef<TransportController | null>(null);

  const isPlaying = useStudioStore((s) => s.isPlaying);
  const bpm = useStudioStore((s) => s.bpm);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const metronomeEnabled = useStudioStore((s) => s.metronomeEnabled);

  // The controller is made the first time the engine is up (the shell's first tap, or a take starting it), not at
  // mount: the engine is usually not initialised yet then, and a mount-only effect would never make one.
  const ensureController = useCallback((): TransportController | null => {
    if (controllerRef.current) return controllerRef.current;
    const engine = StudioEngine.getInstance();
    if (!engine.initialized) return null;
    const ctrl = new TransportController(engine);
    controllerRef.current = ctrl;
    // Pipe position updates to store (throttled by 16n scheduling)
    ctrl.setOnPositionUpdate((beat) => {
      useStudioStore.getState().setCurrentBeat(beat);
    });
    return ctrl;
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    [],
  );

  // Sync play/pause state
  useEffect(() => {
    const ctrl = ensureController();
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
  }, [isPlaying, engineReady, ensureController]);

  // Sync BPM
  useEffect(() => {
    const ctrl = ensureController();
    if (!ctrl) return;
    try {
      ctrl.setBpm(bpm);
    } catch {}
  }, [bpm, engineReady, ensureController]);

  // Sync loop
  useEffect(() => {
    const ctrl = ensureController();
    if (!ctrl) return;
    try {
      ctrl.setLoop(loopEnabled, loopStart, loopEnd);
    } catch {}
  }, [loopEnabled, loopStart, loopEnd, engineReady, ensureController]);

  // Sync metronome
  useEffect(() => {
    const ctrl = ensureController();
    if (!ctrl) return;
    try {
      if (metronomeEnabled) {
        ctrl.enableMetronome();
      } else {
        ctrl.disableMetronome();
      }
    } catch {}
  }, [metronomeEnabled, engineReady, ensureController]);

  return controllerRef;
}
