// =============================================================================
// ALTAIR SOLO -- the single-player run driver
// =============================================================================
// ONE synchronous driver for a single-player run, shared by the browser's GameScreen (which feeds it
// live input once per fixed step and draws what it produces) and by the server's replay verifier
// (which feeds it the recorded log). Both run the identical code: the sim step, the rules that used
// to live in GameScreen's callbacks (XP, level-ups, coins, revives, evolution), the seeded random
// stream, and the terrain window. So a run is a pure function of
//   (seed, class + loadout, viewport size, input changes, level-up picks/rerolls/banishes)
// and the server can recompute any number a client reports. See lib/altair/solo/solo-log.ts.
//
// What it deliberately does NOT own: rendering, audio, toasts, the bestiary (UI sinks, `SoloHooks`,
// none of which touch the random stream or the sim), and the wall clock (no step reads one).
//
// The per-run rules state (XP, level, coins, picks, rerolls, revivals) lives in the zustand run store
// (stores/game-store.ts), exactly as before: the HUD reads it, and the headless replay uses the same
// store module in Node. The store is process-global, so replays run one at a time (verify/replay.ts
// runExclusive), like every other piece of module-level engine state.
// =============================================================================

import { createGameWorld, createTileGenerator } from '../engine/game-loop';
import { createCamera } from '../engine/camera';
import { createSeededRng, withRng, type RandomSource } from '../engine/rng';
import { resetEnemyNavigation } from '../engine/enemy-navigation';
import { resetPickupSystem } from '../engine/pickup-system';
import { resetPositionHistoryAccum } from '../engine/player-system';
import { createSimRuntime, type GameLoopCallbacks, type SimRuntime } from '../engine/sim-runtime';
import { drainTilePickups, refreshInventoryStats, stepSimulation } from '../engine/sim-step';
import { generateUpgradeChoices, checkEvolution } from '../engine/level-up-system';
import { spawnEvolution, spawnLevelUp } from '../engine/particle-system';
import { createInputState } from '../engine/input';
import type { TileGenerator } from '../engine/tile-generator';
import type { Camera, CatalystState, GameWorld, InputState, PassiveState, WeaponState } from '../engine/types';
import { useAltairGameStore } from '../stores/game-store';
import { finalCoinsFor } from './loadout';
import {
  KEY_DOWN,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_UP,
  SEV_BANISH,
  SEV_INPUT,
  SEV_PICK,
  SEV_REROLL,
  SEV_VIEWPORT,
  SOLO_LOG_VERSION,
  SoloRecorder,
  clampViewport,
  quantiseStick,
  type SoloEnd,
  type SoloEvent,
  type SoloLoadout,
  type SoloLog,
} from './solo-log';

export const FIXED_DT = 1 / 60;

export interface SoloSetup {
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: SoloLoadout;
}

/** UI-only sinks (sound, toasts, bestiary). They must not touch the sim or the random stream. */
export interface SoloHooks {
  onPlayerHit?: () => void;
  onHeal?: () => void;
  onXp?: (amount: number) => void;
  onLevelUp?: () => void;
  onCoin?: (amount: number) => void;
  onKill?: (defId: string) => void;
  onEnemySpawns?: (defIds: string[]) => void;
  onBossSpawn?: (bossId: string) => void;
  onBossKill?: (bossId: string) => void;
  onWeaponDisable?: (duration: number) => void;
  onRevive?: () => void;
  /** The run is about to end in defeat; `sourceDefId` is what dealt the last hit. */
  onDeath?: (sourceDefId?: string) => void;
  onPicked?: () => void;
  onRerolled?: () => void;
  onEvolved?: () => void;
}

export interface SoloRunOptions {
  setup: SoloSetup;
  /** Canvas size the terrain window follows (clamped). */
  viewport: { w: number; h: number };
  hooks?: SoloHooks;
  /** Live input, sampled once per step. Absent when replaying: input then arrives as log events. */
  inputSource?: () => InputState;
}

export interface SoloResult {
  status: 'victory' | 'dead' | 'incomplete';
  steps: number;
  /** Game-clock seconds. */
  gameTime: number;
  kills: number;
  level: number;
  xp: number;
  /** Coins banked during the run, before multipliers. */
  runCoins: number;
  /** What the run pays out: runCoins x greed x double-time. */
  finalCoins: number;
  coinBreakdown: Record<string, number>;
  bossesDefeated: string[];
}

const store = () => useAltairGameStore.getState();

export { finalCoinsFor };

/** Store -> world: rebuild the world's weapon/passive/catalyst lists from the run store, keeping runtime state. */
export function syncStoreToWorld(world: GameWorld): void {
  const s = store();
  const newWeapons: WeaponState[] = s.weapons.map((sw, i) => {
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
  world.passives = s.passives.map((sp): PassiveState => ({ passiveId: sp.passiveId, level: sp.level }));
  world.catalysts = s.catalysts.map((sc): CatalystState => ({ catalystId: sc.catalystId, level: sc.level }));
}

export class SoloRun {
  readonly world: GameWorld;
  readonly tileGen: TileGenerator;
  readonly rt: SimRuntime;
  readonly setup: SoloSetup;
  readonly recorder: SoloRecorder;
  /** Steps taken so far. */
  tick = 0;
  ended: SoloEnd | null = null;

  private readonly rng: RandomSource;
  private readonly hooks: SoloHooks;
  /** The engine callbacks that carry the rules (the browser loop passes them to its own stepping). */
  readonly callbacks: GameLoopCallbacks;
  private readonly inputSource: (() => InputState) | undefined;
  private readonly simCam: Camera;
  private readonly simInput: InputState;
  private vw: number;
  private vh: number;
  private readonly initialVw: number;
  private readonly initialVh: number;

  constructor(opts: SoloRunOptions) {
    this.setup = opts.setup;
    this.hooks = opts.hooks ?? {};
    this.inputSource = opts.inputSource;
    this.vw = clampViewport(opts.viewport.w);
    this.vh = clampViewport(opts.viewport.h);
    this.initialVw = this.vw;
    this.initialVh = this.vh;
    this.recorder = new SoloRecorder(this.vw, this.vh);
    this.rng = createSeededRng(opts.setup.seed);

    // Module-level engine state (path cache, merge timers) must start as on a fresh page.
    resetEnemyNavigation();
    resetPickupSystem();
    resetPositionHistoryAccum();

    const { classId, doubleTime, loadout } = opts.setup;
    this.world = createGameWorld(this.vw, this.vh, classId, doubleTime);
    // The sim reads a camera of its own (terrain window, Hunter's Mark): the render camera follows the
    // player with frame-rate-dependent smoothing, which a replay cannot reproduce.
    this.simCam = createCamera(this.vw, this.vh);
    this.simInput = createInputState();
    this.world.inputState = this.simInput;
    this.tileGen = createTileGenerator();
    this.rt = createSimRuntime(this.world);
    if (loadout.stats) this.rt.metaBonuses = { ...loadout.stats };
    this.callbacks = this.makeCallbacks();

    store().startRun(classId, doubleTime, {}, loadout.rerolls, loadout.banishes, loadout.revival, loadout.extraChoice);
    store().addWeapon(this.world.weapons[0]?.weaponId || '');
    useAltairGameStore.setState({ hp: this.world.player.hp, maxHp: this.world.player.maxHp });

    // Terrain exists before the first frame is drawn.
    this.simCam.x = this.world.player.x;
    this.simCam.y = this.world.player.y;
    this.tileGen.update(this.simCam);
  }

  // ---- Rules (these were GameScreen's callbacks) --------------------------------

  private makeCallbacks(): GameLoopCallbacks {
    const world = this.world;
    const loadout = this.setup.loadout;
    return {
      onPlayerDamage: (_amount, sourceDefId) => {
        this.hooks.onPlayerHit?.();
        useAltairGameStore.setState({ hp: world.player.hp });
        if (world.player.hp > 0) return;
        const s = store();
        if (s.revivalsRemaining > 0) {
          s.revive();
          // Restore world HP and grant generous post-revival invulnerability
          world.player.hp = world.player.maxHp;
          world.player.iFrames = 2.0;
          // Clear nearby enemy projectiles so the player doesn't instantly die again
          for (let i = world.projectiles.length - 1; i >= 0; i--) {
            const p = world.projectiles[i];
            if (!p.isEnemy) continue;
            const dx = p.x - world.player.x;
            const dy = p.y - world.player.y;
            if (dx * dx + dy * dy <= 150 * 150) world.projectiles.splice(i, 1);
          }
          this.hooks.onRevive?.();
        } else {
          this.hooks.onDeath?.(sourceDefId);
          useAltairGameStore.setState({ timeSurvived: world.time });
          s.die();
        }
      },
      onPlayerHeal: () => {
        this.hooks.onHeal?.();
        useAltairGameStore.setState({ hp: world.player.hp });
      },
      onXPGain: (amount) => {
        this.hooks.onXp?.(amount);
        const prevLevel = store().level;
        store().addXP(amount);
        if (store().level > prevLevel) {
          this.hooks.onLevelUp?.();
          // Level-up: roll the choices and open the picker (the run store flips to 'upgrading')
          store().setUpgradeChoices(
            generateUpgradeChoices(
              world.weapons,
              world.passives,
              world.catalysts,
              store().banishedIds,
              loadout.extraChoice,
              loadout.catalystAffinity * 15,
            ),
          );
          spawnLevelUp(world, world.player.x, world.player.y);
        }
      },
      onCoinGain: (amount) => {
        this.hooks.onCoin?.(amount);
        store().addCoins(amount, 'enemyDrops');
      },
      onKill: (defId) => {
        this.hooks.onKill?.(defId);
        store().addKill(defId);
      },
      onEnemySpawns: (defIds) => this.hooks.onEnemySpawns?.(defIds),
      onLevelUp: () => {
        // Level-up is handled directly in onXPGain above
      },
      onBossSpawn: (bossId) => {
        this.hooks.onBossSpawn?.(bossId);
        store().setBossActive(true);
      },
      onBossKill: (bossId) => {
        this.hooks.onBossKill?.(bossId);
        store().setBossActive(false);
        store().recordBossKill(bossId);
        store().addCoins(25, 'bossKills');
      },
      onVictory: () => {
        useAltairGameStore.setState({ timeSurvived: world.time });
        store().victory();
      },
      onWeaponDisable: (duration) => this.hooks.onWeaponDisable?.(duration),
    };
  }

  // ---- Input ------------------------------------------------------------------

  /** Set the movement input the next step will use (what a log event / the live sampler resolves to). */
  setInput(mdx: number, mdy: number, keys: number): void {
    this.recorder.input(this.tick, mdx, mdy, keys);
    const inp = this.simInput;
    inp.dx = mdx / 100;
    inp.dy = mdy / 100;
    inp.keys.clear();
    if (keys & KEY_UP) inp.keys.add('w');
    if (keys & KEY_DOWN) inp.keys.add('s');
    if (keys & KEY_LEFT) inp.keys.add('a');
    if (keys & KEY_RIGHT) inp.keys.add('d');
  }

  private sampleLiveInput(): void {
    const src = this.inputSource;
    if (!src) return;
    const live = src();
    const k = live.keys;
    const keys =
      (k.has('w') || k.has('arrowup') ? KEY_UP : 0) |
      (k.has('s') || k.has('arrowdown') ? KEY_DOWN : 0) |
      (k.has('a') || k.has('arrowleft') ? KEY_LEFT : 0) |
      (k.has('d') || k.has('arrowright') ? KEY_RIGHT : 0);
    this.setInput(quantiseStick(Number.isFinite(live.dx) ? live.dx : 0), quantiseStick(Number.isFinite(live.dy) ? live.dy : 0), keys);
  }

  /** The canvas was resized: the terrain window follows it (recorded, because it decides which props exist). */
  setViewport(w: number, h: number): void {
    const cw = clampViewport(w);
    const ch = clampViewport(h);
    if (cw === this.vw && ch === this.vh) return;
    this.vw = cw;
    this.vh = ch;
    this.recorder.viewport(this.tick, cw, ch);
  }

  // ---- Stepping ---------------------------------------------------------------

  /** True while the sim can advance: playing, not at a level-up picker, paused or over. */
  get canStep(): boolean {
    return this.ended === null && store().phase === 'playing';
  }

  /** One fixed 60 Hz step. Returns false (and does nothing) when the run cannot advance. */
  step(): boolean {
    if (!this.canStep) return false;
    this.sampleLiveInput();
    const world = this.world;
    const cam = this.simCam;
    withRng(this.rng, () => {
      refreshInventoryStats(world, this.rt);
      cam.x = world.player.x;
      cam.y = world.player.y;
      cam.width = this.vw;
      cam.height = this.vh;
      cam.shakeIntensity = 0;
      cam.shakeDuration = 0;
      const renderCam = world.camera;
      world.camera = cam;
      try {
        this.tileGen.update(cam);
        drainTilePickups(world, this.tileGen);
        stepSimulation(world, this.rt, this.tileGen, this.callbacks, FIXED_DT);
      } finally {
        world.camera = renderCam;
        if (cam.shakeDuration > 0) {
          renderCam.shakeIntensity = cam.shakeIntensity;
          renderCam.shakeDuration = cam.shakeDuration;
        }
      }
    });
    this.tick++;
    const phase = store().phase;
    if (phase === 'dead') this.ended = 'dead';
    else if (phase === 'victory') this.ended = 'victory';
    return true;
  }

  // ---- Level-up picker --------------------------------------------------------

  /** Choose offered upgrade `index`. False if there is no picker open or no such choice. */
  pick(index: number): boolean {
    const s = store();
    if (this.ended || s.phase !== 'upgrading' || !s.upgradeChoices[index]) return false;
    this.recorder.pick(this.tick, index);
    withRng(this.rng, () => {
      s.pickUpgrade(index);
      syncStoreToWorld(this.world);
      const evolution = checkEvolution(this.world.weapons, this.world.catalysts);
      if (evolution) {
        store().evolveWeapon(evolution.weaponId, evolution.evolvedId, evolution.consumedCatalystId);
        syncStoreToWorld(this.world);
        spawnEvolution(this.world, this.world.player.x, this.world.player.y);
        this.hooks.onEvolved?.();
      }
    });
    this.hooks.onPicked?.();
    return true;
  }

  reroll(): boolean {
    const s = store();
    if (this.ended || s.phase !== 'upgrading' || s.rerollsRemaining <= 0) return false;
    this.recorder.reroll(this.tick);
    const l = this.setup.loadout;
    withRng(this.rng, () => {
      s.reroll(
        generateUpgradeChoices(
          this.world.weapons,
          this.world.passives,
          this.world.catalysts,
          s.banishedIds,
          l.extraChoice,
          l.catalystAffinity * 15,
        ),
      );
    });
    this.hooks.onRerolled?.();
    return true;
  }

  banish(index: number): boolean {
    const s = store();
    if (this.ended || s.phase !== 'upgrading' || s.banishesRemaining <= 0 || !s.upgradeChoices[index]) return false;
    this.recorder.banish(this.tick, index);
    s.banish(index);
    return true;
  }

  /** Apply one decoded log event (replay). False when the event is illegal in the current state. */
  apply(ev: SoloEvent): boolean {
    switch (ev.type) {
      case SEV_INPUT:
        this.setInput(ev.mdx, ev.mdy, ev.keys);
        return true;
      case SEV_PICK:
        return this.pick(ev.choice);
      case SEV_REROLL:
        return this.reroll();
      case SEV_BANISH:
        return this.banish(ev.index);
      case SEV_VIEWPORT:
        this.setViewport(ev.w, ev.h);
        return true;
    }
  }

  // ---- Results ----------------------------------------------------------------

  result(): SoloResult {
    const s = store();
    const status = this.ended === 'dead' ? 'dead' : this.ended === 'victory' ? 'victory' : 'incomplete';
    return {
      status,
      steps: this.tick,
      gameTime: this.world.time,
      kills: s.kills,
      level: s.level,
      xp: s.xp,
      runCoins: s.coins,
      finalCoins: finalCoinsFor(s.coins, this.setup.loadout.greed, this.setup.doubleTime),
      coinBreakdown: { ...s.coinBreakdown },
      bossesDefeated: [...s.bossesDefeatedThisRun],
    };
  }

  /** The replayable record. `end` is how the run stopped ('quit' when the player left it running). */
  toLog(end?: SoloEnd): SoloLog {
    return {
      v: SOLO_LOG_VERSION,
      seed: this.setup.seed,
      classId: this.setup.classId,
      doubleTime: this.setup.doubleTime,
      loadout: this.setup.loadout,
      vw: this.initialVw,
      vh: this.initialVh,
      steps: this.tick,
      end: end ?? this.ended ?? 'quit',
      ev: this.recorder.ev.slice(),
    };
  }

}
