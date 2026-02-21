'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveDataToState, computeOfflineProgress, useAutoSave, saveToServer } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { SaveData } from '@/lib/temple-of-joy/types';
import TabBar from '@/components/temple-of-joy/ui/TabBar';
import SmileButton from '@/components/temple-of-joy/ui/SmileButton';
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

export function TempleOfJoyGame({ initialSaveData }: { initialSaveData?: SaveData | null }) {
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
      .finally(() => { window.location.href = '/games'; });
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
      className="h-screen flex flex-col overflow-hidden font-sans"
      style={{
        background: theme === 'dark' ? '#1a120b' : '#f5f0e8',
        color: theme === 'dark' ? '#e8d5b0' : '#3d2c1e',
      }}
    >
      {/* Header */}
      <header
        className="flex items-center px-4 py-3 border-b shrink-0"
        style={{
          borderColor: theme === 'dark' ? '#6b4c2a' : '#c4a97a',
          background: theme === 'dark' ? '#2c1d12' : '#ede7d9',
        }}
      >
        <a
          href="/games"
          onClick={handleBackToGames}
          className="w-24 text-sm opacity-70 hover:opacity-100 transition-opacity shrink-0"
          style={{ color: theme === 'dark' ? '#d4a847' : '#8b6914' }}
        >
          ← Games
        </a>
        <h1
          className="flex-1 text-center text-xl font-bold tracking-wide"
          style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
        >
          Temple of Joy
        </h1>
        <div className="w-24 shrink-0" />
      </header>

      {/* Tab Bar — sticky below header */}
      <div className="shrink-0">
        <TabBar />
      </div>

      {/* Main content — scrollable area */}
      <main className="flex-1 min-h-0 w-full mx-auto">
        {activeTab === 'temple' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 overflow-y-auto gap-4 p-4 pb-16 md:pb-4 h-full min-h-0">
            {/* Left: Sources panel */}
            <div className="hidden lg:flex lg:flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <SourcesPanel />
              </div>
            </div>
            {/* Center: SmileButton + StatsPanel */}
            <div className="flex flex-col items-center gap-4">
              <SmileButton />
              <StatsPanel />
            </div>
            {/* Right: Upgrades summary */}
            <div className="hidden lg:flex lg:flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <UpgradesPanel />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sources'    && <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0"><SourcesPanel /></div>}
        {activeTab === 'upgrades'     && <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0"><UpgradesPanel /></div>}
        {activeTab === 'relics'       && <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0"><RelicsPanel /></div>}
        {activeTab === 'wheel'        && <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0"><WheelOfSamsara /></div>}
        {activeTab === 'achievements' && (
          <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0">
            <AchievementsPanel />
            <MilestonesPanel />
          </div>
        )}
        {activeTab === 'settings'     && <div className="overflow-y-auto p-4 pb-16 md:pb-4 h-full min-h-0"><SettingsPanel /></div>}
      </main>

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
