'use client';
import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveDataToState, computeOfflineProgress, useAutoSave, saveToServer } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { SaveData, GameState } from '@/lib/temple-of-joy/types';
import TabBar from '@/components/temple-of-joy/ui/TabBar';
import HUD from '@/components/temple-of-joy/ui/HUD';
import TempleControls from '@/components/temple-of-joy/ui/TempleControls';
import PanelOverlay from '@/components/temple-of-joy/ui/PanelOverlay';
import StatsPanel from '@/components/temple-of-joy/ui/StatsPanel';
import SourcesPanel from '@/components/temple-of-joy/ui/SourcesPanel';
import UpgradesPanel from '@/components/temple-of-joy/ui/UpgradesPanel';
import RelicsPanel from '@/components/temple-of-joy/ui/RelicsPanel';
import WheelOfSamsara from '@/components/temple-of-joy/ui/WheelOfSamsara';
import AchievementsPanel from '@/components/temple-of-joy/ui/AchievementsPanel';
import SettingsPanel from '@/components/temple-of-joy/ui/SettingsPanel';
import MilestonesPanel from '@/components/temple-of-joy/ui/MilestonesPanel';
import VibeCheck from '@/components/temple-of-joy/ui/VibeCheck';
import EventModal from '@/components/temple-of-joy/ui/EventModal';
import EventEffectSummary from '@/components/temple-of-joy/ui/EventEffectSummary';
import TranscendenceModal from '@/components/temple-of-joy/ui/TranscendenceModal';
import OfflineModal from '@/components/temple-of-joy/ui/OfflineModal';
import AchievementToast from '@/components/temple-of-joy/ui/AchievementToast';

// The Three.js world is heavy; load it lazily so the rest of the game shell
// (and the loading fallback) can paint immediately.
const TempleScene = lazy(() =>
  import('@/components/temple-of-joy/three/TempleScene').then((m) => ({ default: m.TempleScene })),
);

export function TempleOfJoyGame({ initialSaveData }: { initialSaveData?: SaveData | null }) {
  const { t } = useTranslation("c-temple-of-joy");
  const activeTab = useTempleStore(s => s.activeTab);
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

  // ── Save-and-navigate helper ──────────────────────────────────────────────
  const handleBackToGames = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    saveToServer(useTempleStore.getState())
      .catch(() => { /* best-effort */ })
      .finally(() => { window.location.href = '/builds'; });
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
  const PANELS: Partial<Record<GameState['activeTab'], { title: string; node: React.ReactNode }>> = {
    sources:      { title: t('tab-sources',      { defaultValue: 'Sources' }),      node: <SourcesPanel /> },
    upgrades:     { title: t('tab-upgrades',     { defaultValue: 'Upgrades' }),     node: <UpgradesPanel /> },
    relics:       { title: t('tab-relics',       { defaultValue: 'Relics' }),       node: <RelicsPanel /> },
    wheel:        { title: t('tab-wheel',        { defaultValue: 'Wheel' }),        node: <WheelOfSamsara /> },
    achievements: { title: t('tab-achievements', { defaultValue: 'Achievements' }), node: <><StatsPanel /><div className="h-4" /><AchievementsPanel /><MilestonesPanel /></> },
    settings:     { title: t('tab-settings',     { defaultValue: 'Settings' }),     node: <SettingsPanel /> },
  };
  const panel = PANELS[activeTab];

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
      {/* 3D temple world — always-on backdrop */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <TempleScene />
        </Suspense>
      </div>

      {/* Header — floats over the scene */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center px-4 py-3">
        <a
          href="/builds"
          onClick={handleBackToGames}
          className="pointer-events-auto w-24 shrink-0 text-sm opacity-70 transition-opacity hover:opacity-100"
          style={{ color: 'var(--temple-accent)' }}
        >
          {t("back-to-builds", { defaultValue: "← Builds" })}
        </a>
        <h1
          className="flex-1 text-center text-xl font-bold tracking-wide"
          style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
        >
          {t("game-title", { defaultValue: "Temple of Joy" })}
        </h1>
        <div className="w-24 shrink-0" />
      </header>

      {/* Happiness HUD + temple controls (hidden while a panel is open) */}
      {!panel && (
        <>
          <HUD />
          <TempleControls />
        </>
      )}

      {/* Active data panel as a themed overlay drawer */}
      {panel && <PanelOverlay title={panel.title}>{panel.node}</PanelOverlay>}

      {/* Tab bar — TabBar renders its own responsive variants (desktop top row
          here, mobile fixed bottom bar via its internal `fixed` styling). */}
      <div className="pointer-events-auto absolute inset-x-0 top-14 z-40">
        <TabBar />
      </div>

      {/* Overlays */}
      <VibeCheck />
      <EventModal />
      <EventEffectSummary />
      <TranscendenceModal />
      <OfflineModal />
      <AchievementToast />
    </div>
  );
}
