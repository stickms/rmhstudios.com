'use client';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveDataToState, computeOfflineProgress, useAutoSave, saveToServer } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { SaveData, GameState } from '@/lib/temple-of-joy/types';
import PanelOverlay from '@/components/temple-of-joy/ui/PanelOverlay';
import StatsPanel from '@/components/temple-of-joy/ui/StatsPanel';
import SourcesPanel from '@/components/temple-of-joy/ui/SourcesPanel';
import UpgradesPanel from '@/components/temple-of-joy/ui/UpgradesPanel';
import RelicsPanel from '@/components/temple-of-joy/ui/RelicsPanel';
import WheelOfSamsara from '@/components/temple-of-joy/ui/WheelOfSamsara';
import AscensionPanel from '@/components/temple-of-joy/ui/AscensionPanel';
import ObjectivesPanel from '@/components/temple-of-joy/ui/ObjectivesPanel';
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
    ascension:    { title: t('tab-ascension',    { defaultValue: 'Ascension' }),    node: <AscensionPanel /> },
    objectives:   { title: t('tab-objectives',   { defaultValue: 'Objectives' }),   node: <ObjectivesPanel /> },
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
      {/* 3D temple world — fills the screen. All persistent chrome (HUD, tabs,
          controls, back button) now lives inside it as real 3D meshes. */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <TempleScene />
        </Suspense>
      </div>

      {/* Active data panel — opened by the 3D tab bar. (Modals + dense list
          panels are the final piece still being converted to in-world 3D.) */}
      {panel && <PanelOverlay title={panel.title}>{panel.node}</PanelOverlay>}

      {/* Transient overlays */}
      <VibeCheck />
      <EventModal />
      <EventEffectSummary />
      <TranscendenceModal />
      <OfflineModal />
      <AchievementToast />
    </div>
  );
}
