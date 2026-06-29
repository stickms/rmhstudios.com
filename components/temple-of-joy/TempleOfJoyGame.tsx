'use client';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveDataToState, computeOfflineProgress, useAutoSave, saveToServer } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { SaveData } from '@/lib/temple-of-joy/types';

// The Three.js world is heavy; load it lazily so the rest of the game shell
// (and the loading fallback) can paint immediately.
const TempleScene = lazy(() =>
  import('@/components/temple-of-joy/three/TempleScene').then((m) => ({ default: m.TempleScene })),
);

export function TempleOfJoyGame({ initialSaveData }: { initialSaveData?: SaveData | null }) {
  const theme = useTempleStore(s => s.theme);

  // ── Initialization ────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = initialSaveData ?? null;
    const baseState = useTempleStore.getState();
    if (raw) {
      const merged = saveDataToState(raw, baseState);
      const mergedState = { ...baseState, ...merged, lastClickTime: Date.now(), pageOpenTime: Date.now(), lastTickTime: Date.now() };
      const offline = computeOfflineProgress(mergedState, Date.now());
      useTempleStore.setState({
        ...mergedState,
        offlineHappinessOnLoad: offline.happiness,
        offlineSecondsOnLoad: offline.seconds,
        happiness: mergedState.happiness + offline.happiness,
        lifetimeHappiness: mergedState.lifetimeHappiness + offline.happiness,
        runHappiness: mergedState.runHappiness + offline.happiness,
        pilgrimageActive: offline.pilgrimageActive,
        pilgrimageTimer: offline.pilgrimageTimer,
        pilgrimageCooldown: offline.pilgrimageCooldown,
        totalPilgrimages: offline.totalPilgrimages,
        showOfflineModal: offline.seconds > 30,
      });
    } else {
      useTempleStore.setState(s => ({
        ...s,
        lastClickTime: Date.now(),
        pageOpenTime: Date.now(),
        lastTickTime: Date.now(),
      }));
    }
    // Signal that initialization is complete
    useTempleStore.getState().auditAchievements();
    useTempleStore.setState({ gameInitialized: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // ── RAF Tick Loop ─────────────────────────────────────────────────────────
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function tick() {
      useTempleStore.getState().tick();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Event detection ───────────────────────────────────────────────────────
  const pendingEvent = useTempleStore(s => s.pendingEvent);
  useEffect(() => {
    if (pendingEvent != null) {
      useTempleStore.getState().setShowEventModal(true);
    }
  }, [pendingEvent]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  useAutoSave();
  // ── Audio: init and subscribe to store settings ────────────────────────
  useEffect(() => {
    templeAudio.init();
    const { soundEnabled, musicVolume, sfxVolume } = useTempleStore.getState();
    templeAudio.setMusicVolume(musicVolume);
    templeAudio.setSfxVolume(sfxVolume);
    templeAudio.setEnabled(soundEnabled);

    // Subscribe to sound setting changes
    const unsub1 = useTempleStore.subscribe(
      (s) => s.soundEnabled,
      (enabled) => templeAudio.setEnabled(enabled),
    );
    const unsub2 = useTempleStore.subscribe(
      (s) => s.musicVolume,
      (vol) => templeAudio.setMusicVolume(vol),
    );
    const unsub3 = useTempleStore.subscribe(
      (s) => s.sfxVolume,
      (vol) => templeAudio.setSfxVolume(vol),
    );

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  // ── Audio: unlock autoplay on first user interaction ───────────────────
  useEffect(() => {
    const handleFirstInteraction = () => {
      templeAudio.markInteracted();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);
  // ── Delegated click SFX: play click sound for ALL button clicks in the game ──
  const gameContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = gameContainerRef.current;
    if (!container) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') && !(target.closest('button') as HTMLButtonElement).disabled) {
        templeAudio.playClick();
      }
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, []);

  // ── beforeunload: confirm exit + auto-save ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Fire auto-save in the background (best-effort)
      saveToServer(useTempleStore.getState()).catch(() => {});
      // Show browser confirmation dialog
      e.preventDefault();
      e.returnValue = ''; // Modern browsers ignore custom messages
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={gameContainerRef}
      data-theme={theme}
      className="relative h-screen w-screen overflow-hidden font-sans"
      style={{
        background: theme === 'dark' ? '#0d0904' : '#ece0c8',
        color: 'var(--temple-text)',
      }}
    >
      {/* 3D temple world — fills the screen. All persistent chrome (HUD, tabs,
          controls, back button) now lives inside it as real 3D meshes. */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <TempleScene />
        </Suspense>
      </div>

      {/* All UI — HUD, tabs, controls, panels and modals — now lives inside the
          3D scene (Chrome3D / Modals3D in the Hud layer). Nothing else here. */}
    </div>
  );
}
