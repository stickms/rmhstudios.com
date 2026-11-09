/**
 * GameScreen — Canvas wrapper + HUD overlay for the actual game.
 * This is the core component that hosts the Canvas element and manages
 * the game loop lifecycle, level-up flow, and boss info syncing.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markGamePlaying } from '@/lib/game-capabilities';
import { useAltairGameStore } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import { createGameLoop } from '@/lib/altair/engine/game-loop';
import { createInputState, setupInputListeners, setMobileInput } from '@/lib/altair/engine/input';
import { SoloRun } from '@/lib/altair/solo/solo-run';
import { loadoutFromUpgrades } from '@/lib/altair/solo/loadout';
import { beginSoloSession, setActiveRun } from '@/lib/altair/solo/session';
import { altairSfx } from '@/lib/altair/audio/sfx';
import { BOSSES } from '@/lib/altair/data/bosses';
import { getAllSpriteEntries } from '@/lib/altair/engine/sprites/sprite-defs';
import { preloadAllSprites } from '@/lib/altair/engine/sprites/sprite-loader';
import GameHUD from '@/components/altair/hud/GameHUD';
import BossHealthBar from '@/components/altair/hud/BossHealthBar';
import LevelUpScreen from '@/components/altair/screens/LevelUpScreen';
import PauseOverlay from '@/components/altair/screens/PauseOverlay';
import MobileDPad from '@/components/altair/mobile/MobileDPad';
import MobileControls from '@/components/altair/mobile/MobileControls';
import { WebGLUnavailable, useWebGLSupport } from '@/components/shared/WebGLUnavailable';

interface GameScreenProps {
  onQuit: () => void;
  onSettings: () => void;
}

// Altair renders through WebGL. A browser that cannot start it (Firefox here,
// blocklisted GPUs) used to throw 'WebGL not supported' into the generic
// "Game crashed" boundary; show the shared, actionable message instead.
export default function GameScreen(props: GameScreenProps) {
  const webglSupported = useWebGLSupport();
  if (!webglSupported) {
    return (
      <div className="fixed inset-0">
        <WebGLUnavailable gameName="Altair" />
      </div>
    );
  }
  return <GameScreenInner {...props} />;
}

function GameScreenInner({ onQuit, onSettings }: GameScreenProps) {
  const { t } = useTranslation("c-altair");
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<ReturnType<typeof createGameLoop> | null>(null);
  const runRef = useRef<SoloRun | null>(null);
  // What the player is pressing right now. The run samples it once per fixed step and records it.
  const liveInputRef = useRef(createInputState());

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
  const prevPausePhaseRef = useRef(phase);

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

  // Initialize game world and loop (waits for sprites to preload)
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !selectedClassId || !spritesReady) return;

    // Resize canvas to fill screen (handles orientation changes on mobile)
    const resizeCanvas = () => {
      // Use window dimensions directly to include safe-area regions (viewport-fit=cover)
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
      const zoomTiles = useAltairSettingsStore.getState().zoomTiles;
      const minVisibleWorldSpan = 64 * zoomTiles * 2; // zoomTiles in each direction from center

      // Scale uniformly so the smaller axis shows the desired tile count,
      // preserving aspect ratio to prevent squishing
      const minDim = Math.min(viewportWidth, viewportHeight);
      const scale = Math.max(1, minVisibleWorldSpan / minDim);
      const targetWidth = viewportWidth * scale;
      const targetHeight = viewportHeight * scale;

      canvas.width = Math.max(1, Math.round(targetWidth));
      canvas.height = Math.max(1, Math.round(targetHeight));
      // Update the run's camera and terrain window if it exists
      const run = runRef.current;
      if (run) {
        run.world.camera.width = canvas.width;
        run.world.camera.height = canvas.height;
        run.setViewport(canvas.width, canvas.height);
      }
    };
    resizeCanvas();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeCanvas)
      : null;
    resizeObserver?.observe(root);
    window.addEventListener('resize', resizeCanvas);
    // Re-apply zoom when the setting changes mid-game
    let prevZoom = useAltairSettingsStore.getState().zoomTiles;
    const unsubZoom = useAltairSettingsStore.subscribe((s) => {
      if (s.zoomTiles !== prevZoom) {
        prevZoom = s.zoomTiles;
        resizeCanvas();
      }
    });

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      useAltairGameStore.getState().pause();
      addToast(t("webgl-context-lost", { defaultValue: "WebGL context lost! Please reload the page." }), 'error');
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    // The run: sim step, rules (XP, level-ups, coins, revives) and the seeded random stream live in
    // SoloRun, shared with the server's replay verifier. This component only feeds it input and draws.
    const meta = useAltairMetaStore.getState();
    const session = beginSoloSession(loadoutFromUpgrades(meta.upgrades));
    const run = new SoloRun({
      setup: { seed: session.seed, classId: selectedClassId, doubleTime, loadout: session.loadout },
      viewport: { w: canvas.width, h: canvas.height },
      inputSource: () => liveInputRef.current,
      hooks: {
        onPlayerHit: () => altairSfx.play('player_hit'),
        onHeal: () => altairSfx.play('player_heal'),
        onXp: (amount) => altairSfx.play('pickup_xp', Math.min(1.5, 0.7 + amount / 20)),
        onLevelUp: () => altairSfx.play('level_up'),
        onCoin: (amount) => altairSfx.play('pickup_coin', Math.min(1.5, 0.7 + amount / 8)),
        onKill: (defId) => {
          altairSfx.play('enemy_kill');
          useAltairMetaStore.getState().recordBestiaryKill(defId);
        },
        onEnemySpawns: (defIds) => useAltairMetaStore.getState().recordBestiaryEncounterBatch(defIds),
        onBossSpawn: (bossId) => {
          altairSfx.play('boss_spawn');
          const bossDef = BOSSES.find((b) => b.id === bossId);
          addToast(t("boss-approaches", { defaultValue: "{{title}} APPROACHES!", title: bossDef?.title ?? 'BOSS' }), 'warning');
        },
        onBossKill: (bossId) => {
          altairSfx.play('boss_kill');
          setBossInfo(null);
          const bossDef = BOSSES.find((b) => b.id === bossId);
          addToast(t("boss-defeated", { defaultValue: "{{name}} defeated!", name: bossDef?.name ?? 'Boss' }), 'success');
        },
        onWeaponDisable: (duration) => {
          altairSfx.play('weapon_disabled');
          addToast(t("weapons-disabled", { defaultValue: "Weapons disabled for {{duration}}s!", duration: duration.toFixed(1) }), 'error');
        },
        onRevive: () => {
          addToast(t("revived", { defaultValue: "Revived!" }), 'success');
          altairSfx.play('revive');
        },
        onDeath: (sourceDefId) => {
          // Record "killed by" in bestiary
          if (sourceDefId) useAltairMetaStore.getState().recordBestiaryKilledBy(sourceDefId);
        },
        onPicked: () => altairSfx.play('upgrade_pick'),
        onRerolled: () => altairSfx.play('upgrade_reroll'),
        onEvolved: () => addToast(t("weapon-evolved", { defaultValue: "Weapon evolved!" }), 'success'),
      },
    });
    runRef.current = run;
    setActiveRun(run);
    if (import.meta.env.DEV) (window as unknown as { __altairRun?: SoloRun }).__altairRun = run;

    // Set up input (keys and the on-screen stick write to the live state; the run samples it)
    const cleanupInput = setupInputListeners(
      liveInputRef.current,
      keybinds,
      () => useAltairGameStore.getState().togglePause(),
    );

    const loop = createGameLoop(canvas, run.world, run.tileGen, run.callbacks, run);

    loopRef.current = loop;
    loop.start();

    return () => {
      loop.destroy();
      cleanupInput();
      resizeObserver?.disconnect();
      unsubZoom();
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, [selectedClassId, spritesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // `html[data-game-state="playing"]` while the run is live (not paused or
  // levelling up): the jelly material's ambient motion and arcs stop (R16).
  useEffect(() => {
    if (phase !== 'playing') return;
    return markGamePlaying();
  }, [phase]);

  // Auto-pause when the tab/app is backgrounded (phone call, app switch, tab
  // change) so the run isn't lost to a frozen-then-resumed loop, and release
  // any held movement so the player doesn't run off on return.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      liveInputRef.current.keys.clear();
      setMobileInput(liveInputRef.current, 0, 0);
      if (useAltairGameStore.getState().phase === 'playing') {
        useAltairGameStore.getState().togglePause();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // Pause/unpause the game loop based on phase
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) return;

    const prevPhase = prevPausePhaseRef.current;
    if (phase === 'paused' && prevPhase === 'playing') {
      altairSfx.play('pause');
    } else if (phase === 'playing' && prevPhase === 'paused') {
      altairSfx.play('resume');
    }
    prevPausePhaseRef.current = phase;

    if (phase === 'playing') {
      loop.resume();
    } else {
      loop.pause();
    }
  }, [phase]);

  // Periodic sync: world → store (HP, time, boss info)
  useEffect(() => {
    if (phase !== 'playing') return;

    const interval = setInterval(() => {
      const world = runRef.current?.world;
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
    setMobileInput(liveInputRef.current, dx, dy);
  }, []);

  // Show loading screen while sprites preload
  if (!spritesReady) {
    const pct = loadProgress.total > 0
      ? Math.round((loadProgress.loaded / loadProgress.total) * 100)
      : 0;

    return (
      <div className="fixed inset-0 bg-(--altair-hud-scrim) flex flex-col items-center justify-center gap-4">
        <h1
          className="text-3xl font-bold text-(--altair-accent) tracking-wider"
          style={{ fontFamily: 'var(--altair-font-display)' }}
        >
          ALTAIR
        </h1>
        <p className="text-sm text-(--altair-text-muted)">
          {t("loading-assets", { defaultValue: "Loading assets... {{loaded}}/{{total}}", loaded: loadProgress.loaded, total: loadProgress.total })}
        </p>
        <div className="w-48 h-2 bg-(--altair-surface) rounded-full overflow-hidden">
          <div
            className="h-full bg-(--altair-accent) w-full origin-left transition-transform duration-150"
            style={{ transform: `scaleX(${(pct) / 100})` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 bg-(--altair-hud-scrim) overflow-hidden"
      // touch-action none + no overscroll: stops pull-to-refresh, double-tap
      // zoom and page pan while a run is live on iOS/Android.
      style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <canvas
        data-jelly-zone="playfield"
        ref={canvasRef}
        className="block"
        style={{
          width: '100vw',
          height: '100dvh',
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
      <LevelUpScreen
        onPick={(i) => runRef.current?.pick(i)}
        onBanish={(i) => runRef.current?.banish(i)}
        onReroll={() => runRef.current?.reroll()}
      />

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
