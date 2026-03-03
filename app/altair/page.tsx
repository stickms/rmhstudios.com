/**
 * Altair — Main page orchestrating all game screens.
 * Routes between menu, class select, game, game over, meta shop, and settings
 * based on the game store phase.
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAltairGameStore, GamePhase } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import AltairHeader from '@/components/altair/AltairHeader';
import MenuScreen from '@/components/altair/screens/MenuScreen';
import ClassSelectScreen from '@/components/altair/screens/ClassSelectScreen';
import GameOverScreen from '@/components/altair/screens/GameOverScreen';
import MetaShopScreen from '@/components/altair/screens/MetaShopScreen';
import SettingsScreen from '@/components/altair/screens/SettingsScreen';

// Dynamic import for the game canvas (no SSR)
const GameScreen = dynamic(() => import('@/components/altair/screens/GameScreen'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-(--altair-bg) flex items-center justify-center">
      <div className="text-(--altair-accent) font-mono tracking-widest animate-pulse text-sm">
        INITIALIZING...
      </div>
    </div>
  ),
});

export default function AltairPage() {
  const router = useRouter();
  const phase = useAltairGameStore((s) => s.phase);
  const setPhase = useAltairGameStore((s) => s.setPhase);
  const goToMenu = useAltairGameStore((s) => s.goToMenu);
  const goToClassSelect = useAltairGameStore((s) => s.goToClassSelect);
  const startRun = useAltairGameStore((s) => s.startRun);

  const settingsDoubleTime = useAltairSettingsStore((s) => s.doubleTime);
  const [showSettings, setShowSettings] = useState(false);

  const handleClassSelect = useCallback((classId: string) => {
    const meta = useAltairMetaStore.getState();
    const bonuses = meta.getMetaStatBonuses();
    const rerolls = meta.getUpgradeLevel('reroll');
    const banishes = meta.getUpgradeLevel('banish');
    const revival = meta.getUpgradeLevel('revival');
    const extraChoice = meta.getUpgradeLevel('extra_choice') > 0;

    startRun(classId, settingsDoubleTime && meta.doubleTimeUnlocked, bonuses, rerolls, banishes, revival, extraChoice);
    meta.incrementRuns();
    scoreSubmittedRef.current = false;
  }, [startRun, settingsDoubleTime]);

  // Track whether score has been submitted for this run to prevent duplicates
  const scoreSubmittedRef = useRef(false);

  // Load meta progress from DB on mount, then check retroactive unlocks
  useEffect(() => {
    useAltairMetaStore.getState().loadFromServer();
  }, []);

  // Retroactive unlock check — runs on mount and when entering class select
  // so players who already met conditions (e.g. after condition changes) get their unlocks
  useEffect(() => {
    useAltairMetaStore.getState().checkUnlocks();
  }, [phase]);

  const handleGameEnd = useCallback(() => {
    const gameState = useAltairGameStore.getState();
    const meta = useAltairMetaStore.getState();

    const greedLevel = meta.getUpgradeLevel('greed');
    const greedMultiplier = 1 + greedLevel * 0.1;
    const dtMultiplier = gameState.doubleTime ? 1.5 : 1;
    const finalCoins = Math.floor(gameState.coins * greedMultiplier * dtMultiplier);

    if (gameState.phase === 'victory' && gameState.selectedClassId) {
      const bonus = meta.recordFirstClear(gameState.selectedClassId);
      if (bonus > 0) {
        useAltairGameStore.getState().addCoins(bonus, 'firstClearBonus');
      }
      meta.unlockDoubleTime();
    }

    // Persist best run stats and check all unlock conditions (retroactive)
    meta.updateRunStats(
      gameState.timeSurvived,
      gameState.kills,
      gameState.bossesDefeatedThisRun,
    );
    meta.checkUnlocks();

    meta.addCoins(finalCoins);

    // Submit score to leaderboard API (fire-and-forget)
    if (!scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      fetch('/api/altair/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeSurvived: gameState.timeSurvived,
          kills: gameState.kills,
          totalXP: gameState.xp,
          gold: finalCoins,
        }),
      }).catch(() => { /* silently ignore leaderboard submission failures */ });
    }
  }, []);

  // Submit score immediately when game ends (death or victory)
  useEffect(() => {
    if (phase !== 'dead' && phase !== 'victory') return;
    if (scoreSubmittedRef.current) return;

    const gameState = useAltairGameStore.getState();
    const meta = useAltairMetaStore.getState();

    const greedLevel = meta.getUpgradeLevel('greed');
    const greedMultiplier = 1 + greedLevel * 0.1;
    const dtMultiplier = gameState.doubleTime ? 1.5 : 1;
    const finalCoins = Math.floor(gameState.coins * greedMultiplier * dtMultiplier);

    scoreSubmittedRef.current = true;
    fetch('/api/altair/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeSurvived: gameState.timeSurvived,
        kills: gameState.kills,
        totalXP: gameState.xp,
        gold: finalCoins,
      }),
    }).catch(() => { /* silently ignore leaderboard submission failures */ });
  }, [phase]);

  if (showSettings) {
    return (
      <>
        <AltairHeader context="settings" title="Settings" onBack={() => setShowSettings(false)} />
        <SettingsScreen onBack={() => setShowSettings(false)} />
      </>
    );
  }

  switch (phase) {
    case 'menu':
      return (
        <>
          <AltairHeader context="menu" />
          <MenuScreen
            onPlay={goToClassSelect}
            onMultiplayer={() => router.push('/altair/multiplayer')}
            onMetaShop={() => setPhase('meta_shop')}
            onSettings={() => setShowSettings(true)}
          />
        </>
      );

    case 'class_select':
      return (
        <>
          <AltairHeader context="class_select" title="Class Select" onBack={goToMenu} />
          <ClassSelectScreen onSelect={handleClassSelect} onBack={goToMenu} />
        </>
      );

    case 'playing':
    case 'paused':
    case 'upgrading':
      return (
        <GameScreen
          onQuit={() => {
            handleGameEnd();
            goToMenu();
          }}
          onSettings={() => setShowSettings(true)}
        />
      );

    case 'dead':
    case 'victory':
      return (
        <GameOverScreen
          onPlayAgain={() => {
            handleGameEnd();
            goToClassSelect();
          }}
          onMetaShop={() => {
            handleGameEnd();
            setPhase('meta_shop');
          }}
          onMenu={() => {
            handleGameEnd();
            goToMenu();
          }}
        />
      );

    case 'meta_shop':
      return (
        <>
          <AltairHeader context="meta_shop" title="Meta Shop" onBack={goToMenu} />
          <MetaShopScreen onBack={goToMenu} />
        </>
      );

    default:
      return null;
  }
}
