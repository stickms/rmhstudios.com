'use client';
import { useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveDataToState, computeOfflineProgress, useAutoSave } from '@/lib/temple-of-joy/persistence';
import type { SaveData } from '@/lib/temple-of-joy/types';
import TabBar from '@/components/temple-of-joy/ui/TabBar';
import SmileButton from '@/components/temple-of-joy/ui/SmileButton';
import StatsPanel from '@/components/temple-of-joy/ui/StatsPanel';
import BuildingsPanel from '@/components/temple-of-joy/ui/BuildingsPanel';
import UpgradesPanel from '@/components/temple-of-joy/ui/UpgradesPanel';
import RelicsPanel from '@/components/temple-of-joy/ui/RelicsPanel';
import WheelOfSamsara from '@/components/temple-of-joy/ui/WheelOfSamsara';
import AchievementsPanel from '@/components/temple-of-joy/ui/AchievementsPanel';
import SettingsPanel from '@/components/temple-of-joy/ui/SettingsPanel';
import MilestonesPanel from '@/components/temple-of-joy/ui/MilestonesPanel';
import VibeCheck from '@/components/temple-of-joy/ui/VibeCheck';
import PilgrimageOverlay from '@/components/temple-of-joy/ui/PilgrimageOverlay';
import EventModal from '@/components/temple-of-joy/ui/EventModal';
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
      const mergedState = { ...baseState, ...merged, lastClickTime: Date.now(), pageOpenTime: Date.now() };
      const offline = computeOfflineProgress(mergedState, Date.now());
      useTempleStore.setState({
        ...mergedState,
        offlineHappinessOnLoad: offline.happiness,
        offlineSecondsOnLoad: offline.seconds,
        happiness: mergedState.happiness + offline.happiness,
        lifetimeHappiness: mergedState.lifetimeHappiness + offline.happiness,
        showOfflineModal: offline.seconds > 30,
      });
    } else {
      useTempleStore.setState(s => ({
        ...s,
        lastClickTime: Date.now(),
        pageOpenTime: Date.now(),
      }));
    }
    // Signal that initialization is complete
    useTempleStore.setState({ gameInitialized: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // ── RAF Tick Loop ─────────────────────────────────────────────────────────
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let lastTime = performance.now();
    function tick() {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      useTempleStore.getState().tick(delta);
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
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
      <main className="flex-1 overflow-y-auto w-full mx-auto pb-16 md:pb-0">
        {activeTab === 'temple' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {/* Left: Sources panel */}
            <div className="hidden lg:block">
              <BuildingsPanel />
            </div>
            {/* Center: SmileButton + StatsPanel */}
            <div className="flex flex-col items-center gap-4">
              <SmileButton />
              <StatsPanel />
            </div>
            {/* Right: Upgrades summary */}
            <div className="hidden lg:block">
              <UpgradesPanel />
            </div>
          </div>
        )}

        {activeTab === 'buildings'    && <div className="p-4"><BuildingsPanel /></div>}
        {activeTab === 'upgrades'     && <div className="p-4"><UpgradesPanel /></div>}
        {activeTab === 'relics'       && <div className="p-4"><RelicsPanel /></div>}
        {activeTab === 'wheel'        && <div className="p-4"><WheelOfSamsara /></div>}
        {activeTab === 'achievements' && (
          <div className="p-4">
            <AchievementsPanel />
            <MilestonesPanel />
          </div>
        )}
        {activeTab === 'settings'     && <div className="p-4"><SettingsPanel /></div>}
      </main>

      {/* Overlays */}
      <VibeCheck />
      <PilgrimageOverlay />
      <EventModal />
      <TranscendenceModal />
      <OfflineModal />
      <AchievementToast />
    </div>
  );
}
