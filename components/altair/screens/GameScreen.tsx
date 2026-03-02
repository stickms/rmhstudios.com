/**
 * GameScreen — Canvas wrapper + HUD overlay for the actual game.
 * This is the core component that hosts the Canvas element and manages
 * the game loop lifecycle, level-up flow, and boss info syncing.
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAltairGameStore } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import { createGameWorld, createGameLoop, createTileGenerator } from '@/lib/altair/engine/game-loop';
import { setupInputListeners, setMobileInput } from '@/lib/altair/engine/input';
import { generateUpgradeChoices, checkEvolution } from '@/lib/altair/engine/level-up-system';
import { spawnEvolution, spawnLevelUp } from '@/lib/altair/engine/particle-system';
import { BOSSES } from '@/lib/altair/data/bosses';
import { WeaponState, PassiveState } from '@/lib/altair/engine/types';
import { getAllSpriteEntries } from '@/lib/altair/engine/sprites/sprite-defs';
import { preloadAllSprites } from '@/lib/altair/engine/sprites/sprite-loader';
import GameHUD from '@/components/altair/hud/GameHUD';
import BossHealthBar from '@/components/altair/hud/BossHealthBar';
import LevelUpScreen from '@/components/altair/screens/LevelUpScreen';
import PauseOverlay from '@/components/altair/screens/PauseOverlay';
import MobileDPad from '@/components/altair/mobile/MobileDPad';
import MobileControls from '@/components/altair/mobile/MobileControls';

interface GameScreenProps {
  onQuit: () => void;
  onSettings: () => void;
}

export default function GameScreen({ onQuit, onSettings }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<ReturnType<typeof createGameLoop> | null>(null);
  const worldRef = useRef<ReturnType<typeof createGameWorld> | null>(null);

  const phase = useAltairGameStore((s) => s.phase);
  const selectedClassId = useAltairGameStore((s) => s.selectedClassId);
  const doubleTime = useAltairGameStore((s) => s.doubleTime);
  const bossActive = useAltairGameStore((s) => s.bossActive);
  const togglePause = useAltairGameStore((s) => s.togglePause);

  const keybinds = useAltairSettingsStore((s) => s.keybinds);
  const joystickSide = useAltairSettingsStore((s) => s.joystickSide);
  const addToast = useAltairToastStore((s) => s.addToast);

  const [isMobile, setIsMobile] = useState(false);
  const [spritesReady, setSpritesReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [bossInfo, setBossInfo] = useState<{
    bossName: string;
    bossTitle: string;
    hp: number;
    maxHp: number;
    phase: number;
    totalPhases: number;
    color: string;
  } | null>(null);

  // Track previous phase for sync triggers
  const prevPhaseRef = useRef(phase);

  // Detect mobile
  useEffect(() => {
    setIsMobile(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }, []);

  // Preload sprite assets
  useEffect(() => {
    const entries = getAllSpriteEntries();
    setLoadProgress({ loaded: 0, total: entries.length });
    preloadAllSprites(entries, (loaded, total) => {
      setLoadProgress({ loaded, total });
    }).then(() => {
      setSpritesReady(true);
    });
  }, []);

  // Sync store weapons/passives back to world after upgrading
  const syncStoreToWorld = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const store = useAltairGameStore.getState();

    // Rebuild world.weapons from store, preserving runtime state by position
    const newWeapons: WeaponState[] = store.weapons.map((sw, i) => {
      const existing = i < world.weapons.length ? world.weapons[i] : null;
      return {
        weaponId: sw.weaponId,
        level: sw.level,
        evolved: sw.evolved,
        cooldownTimer: existing?.cooldownTimer ?? 0,
        activeTimer: existing?.activeTimer,
        orbitAngle: existing?.orbitAngle,
      };
    });
    world.weapons = newWeapons;

    // Rebuild world.passives from store
    const newPassives: PassiveState[] = store.passives.map((sp) => ({
      passiveId: sp.passiveId,
      level: sp.level,
    }));
    world.passives = newPassives;
  }, []);

  // Handle reroll from LevelUpScreen
  const handleReroll = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const store = useAltairGameStore.getState();
    if (store.rerollsRemaining <= 0) return;
    const meta = useAltairMetaStore.getState();
    const extraChoice = meta.getUpgradeLevel('extra_choice') > 0;
    const newChoices = generateUpgradeChoices(
      world.weapons,
      world.passives,
      store.banishedIds,
      extraChoice,
    );
    store.reroll(newChoices);
  }, []);

  // When returning from upgrading to playing, sync store → world + check evolution
  useEffect(() => {
    if (phase === 'playing' && prevPhaseRef.current === 'upgrading') {
      syncStoreToWorld();

      // Check for weapon evolution
      const world = worldRef.current;
      if (world) {
        const evolution = checkEvolution(world.weapons, world.passives);
        if (evolution) {
          useAltairGameStore.getState().evolveWeapon(evolution.weaponId, evolution.evolvedId);
          syncStoreToWorld(); // Re-sync after evolution
          spawnEvolution(world, world.player.x, world.player.y);
          addToast('Weapon evolved!', 'success');
        }
      }
    }
    prevPhaseRef.current = phase;
  }, [phase, syncStoreToWorld, addToast]);

  // Initialize game world and loop (waits for sprites to preload)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedClassId || !spritesReady) return;

    // Resize canvas to fill screen (handles orientation changes on mobile)
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Update world camera if it exists
      const w = worldRef.current;
      if (w) {
        w.camera.width = canvas.width;
        w.camera.height = canvas.height;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create game world (handles class stats and starting weapon internally)
    const world = createGameWorld(canvas.width, canvas.height, selectedClassId, doubleTime);
    worldRef.current = world;

    // Sync initial state to store
    useAltairGameStore.getState().addWeapon(world.weapons[0]?.weaponId || '');
    useAltairGameStore.setState({ hp: world.player.hp, maxHp: world.player.maxHp });

    const tileGen = createTileGenerator();

    // Set up input
    const cleanupInput = setupInputListeners(
      world.inputState,
      keybinds,
      () => useAltairGameStore.getState().togglePause(),
    );

    // Create game loop with callbacks
    const loop = createGameLoop(canvas, world, tileGen, {
      onPlayerDamage: (_amount) => {
        // Engine already reduced world.player.hp; sync to store
        useAltairGameStore.setState({ hp: world.player.hp });

        // Check death
        if (world.player.hp <= 0) {
          const store = useAltairGameStore.getState();
          if (store.revivalsRemaining > 0) {
            store.revive();
            // Restore world HP to match revive
            world.player.hp = world.player.maxHp;
          } else {
            store.die();
          }
        }
      },
      onPlayerHeal: (_amount) => {
        // Sync HP from engine to store
        useAltairGameStore.setState({ hp: world.player.hp });
      },
      onXPGain: (amount) => {
        const prevLevel = useAltairGameStore.getState().level;
        useAltairGameStore.getState().addXP(amount);
        const newLevel = useAltairGameStore.getState().level;

        if (newLevel > prevLevel) {
          // Trigger level-up: generate choices and show picker
          const store = useAltairGameStore.getState();
          const meta = useAltairMetaStore.getState();
          const extraChoice = meta.getUpgradeLevel('extra_choice') > 0;
          const choices = generateUpgradeChoices(
            world.weapons,
            world.passives,
            store.banishedIds,
            extraChoice,
          );
          store.setUpgradeChoices(choices);
          spawnLevelUp(world, world.player.x, world.player.y);
        }
      },
      onCoinGain: (amount) => {
        useAltairGameStore.getState().addCoins(amount, 'enemyDrops');
      },
      onKill: () => {
        useAltairGameStore.getState().addKill();
      },
      onLevelUp: () => {
        // Level-up is handled directly in onXPGain above
      },
      onBossSpawn: (bossId) => {
        useAltairGameStore.getState().setBossActive(true);
        const bossDef = BOSSES.find((b) => b.id === bossId);
        addToast(`${bossDef?.title ?? 'BOSS'} APPROACHES!`, 'warning');
      },
      onBossKill: (bossId) => {
        useAltairGameStore.getState().setBossActive(false);
        useAltairGameStore.getState().recordBossKill(bossId);
        setBossInfo(null);
        const bossDef = BOSSES.find((b) => b.id === bossId);
        addToast(`${bossDef?.name ?? 'Boss'} defeated!`, 'success');
        useAltairGameStore.getState().addCoins(25, 'bossKills');
      },
      onVictory: () => {
        useAltairGameStore.getState().victory();
      },
      onWeaponDisable: (duration) => {
        addToast(`Weapons disabled for ${duration.toFixed(1)}s!`, 'error');
      },
    });

    loopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      cleanupInput();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [selectedClassId, spritesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause/unpause the game loop based on phase
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) return;

    if (phase === 'playing') {
      loop.start();
    } else {
      loop.stop();
    }
  }, [phase]);

  // Periodic sync: world → store (HP, time, boss info)
  useEffect(() => {
    if (phase !== 'playing') return;

    const interval = setInterval(() => {
      const world = worldRef.current;
      if (!world) return;

      // Sync time
      useAltairGameStore.setState({ timeSurvived: world.time });

      // Sync HP from world to store
      useAltairGameStore.setState({
        hp: world.player.hp,
        maxHp: world.player.maxHp,
      });

      // Sync boss info for HUD
      const bossEnemy = world.enemies.find((e) => e.isBoss);
      if (bossEnemy && bossEnemy.bossId) {
        const bossDef = BOSSES.find((b) => b.id === bossEnemy.bossId);
        if (bossDef) {
          setBossInfo({
            bossName: bossDef.name,
            bossTitle: bossDef.title,
            hp: bossEnemy.hp,
            maxHp: bossEnemy.maxHp,
            phase: bossEnemy.bossPhase ?? 0,
            totalPhases: bossDef.phases.length,
            color: bossDef.color,
          });
        }
      } else {
        setBossInfo(null);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [phase]);

  // Mobile D-pad handler
  const handleDPad = useCallback((dx: number, dy: number) => {
    const world = worldRef.current;
    if (world) setMobileInput(world.inputState, dx, dy);
  }, []);

  // Show loading screen while sprites preload
  if (!spritesReady) {
    const pct = loadProgress.total > 0
      ? Math.round((loadProgress.loaded / loadProgress.total) * 100)
      : 0;

    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <h1
          className="text-3xl font-bold text-(--altair-accent) tracking-wider"
          style={{ fontFamily: 'var(--altair-font-display)' }}
        >
          ALTAIR
        </h1>
        <p className="text-sm text-(--altair-text-muted)">
          Loading assets... {loadProgress.loaded}/{loadProgress.total}
        </p>
        <div className="w-48 h-2 bg-(--altair-surface) rounded-full overflow-hidden">
          <div
            className="h-full bg-(--altair-accent) transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{
          imageRendering: 'pixelated',
          // @ts-expect-error -- vendor prefix for Safari/older browsers
          WebkitImageRendering: 'pixelated',
          msInterpolationMode: 'nearest-neighbor',
        }}
      />

      {/* Game HUD */}
      {(phase === 'playing' || phase === 'paused') && <GameHUD />}

      {/* Boss HP bar */}
      {bossActive && bossInfo && <BossHealthBar {...bossInfo} />}

      {/* Level-up picker */}
      <LevelUpScreen onReroll={handleReroll} />

      {/* Pause overlay */}
      {phase === 'paused' && (
        <PauseOverlay
          onResume={togglePause}
          onSettings={onSettings}
          onQuit={onQuit}
        />
      )}

      {/* Pause button (all devices) */}
      {phase === 'playing' && <MobileControls onPause={togglePause} />}

      {/* Mobile joystick */}
      {isMobile && phase === 'playing' && (
        <MobileDPad onChange={handleDPad} side={joystickSide} />
      )}
    </div>
  );
}
