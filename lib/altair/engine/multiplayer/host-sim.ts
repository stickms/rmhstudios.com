// =============================================================================
// ALTAIR ENGINE -- Multiplayer host simulation (2-4 players)
// =============================================================================
// Pure logic: no DOM, WebGL, sockets or timers. The host's page calls
// setInput() as guest input arrives and step() 60 times a second; every 3rd
// step it asks for getSnapshot() and sends it through the hub.
//
// It runs the SAME systems as single-player (sim-step.ts) using a per-step
// context swap (player-state.ts): the player-owned phases run once per player
// with that player's entity / weapons / abilities swapped into the engine's
// single-player slots; the shared phases (enemy AI, boss, wave director,
// corpses) run once. See docs/altair-multiplayer.md "Simulation model".
//
// Determinism: given the same Math.random stream, the same players and the same
// setInput() calls between steps, an N-player run is bit-identical. Players are
// always processed in slot order; nothing reads a clock.
// =============================================================================

import type {
  GameWorld,
  MultiplayerGameWorld,
  MultiplayerPlayerEntity,
  PlayerEntity,
  EnemyEntity,
  PickupEntity,
  ScalingState,
} from '../types';
import { PLAYER_SLOT_COLORS } from '../types';
import { createGameWorld, createTileGenerator } from '../game-loop';
import { createCamera } from '../camera';
import { createInputState } from '../input';
import { CLASSES } from '../../data/classes';
import { xpRequired, type UpgradeChoice } from '../../stores/game-store';
import { generateUpgradeChoices, checkEvolution } from '../level-up-system';
import { handleCollisions, processEnemyDeaths, tickCorpses } from '../collisions';
import { enforceBossDpsCap } from '../boss-system';
import { createSimRuntime, type GameLoopCallbacks, type SimRuntime } from '../sim-runtime';
import {
  recomputeStats,
  refreshInventoryStats,
  stepWorldPrep,
  stepPlayerActions,
  stepEnemiesAndBoss,
  stepPlayerPost,
  stepWorldPost,
  drainTilePickups,
} from '../sim-step';
import { createPlayerSim, swapIn, swapOut, type PlayerSim } from './player-state';
import type { TileGenerator } from '../tile-generator';
import type { GameEvent } from '../../multiplayer/types';
import { PLAYER_ALIVE, PLAYER_DOWNED, PLAYER_DEAD, type GameStateSnapshot, type PlayerStateSnapshot } from '../../multiplayer/types';
import { encodeSnapshot, quantise, type SnapshotSource } from '../../multiplayer/snapshot';

// ---- Tunables ---------------------------------------------------------------

export const FIXED_DT = 1 / 60;
/** Seconds a player lies downed before they are dead (revivable until then). */
export const DOWN_SECONDS = 25;
/** Seconds a teammate must stand beside a downed player to revive them. */
export const REVIVE_SECONDS = 3;
export const REVIVE_RADIUS = 70;
/** HP fraction restored on revive, and the grace after it. */
export const REVIVE_HP_FRACTION = 0.5;
export const REVIVE_INVULN = 2.5;
/** An open level-up overlay is auto-picked (first option) after this many real seconds. */
export const LEVEL_UP_TIMEOUT = 10;
/** Share of an XP pickup that trickles to each living teammate. */
export const XP_TRICKLE = 0.25;
/** The shared systems (spawns, boss aim) target one living player, rotating every this many game seconds. */
export const FOCUS_PERIOD = 2;

// ---- Public types -----------------------------------------------------------

export interface HostPlayerInit {
  playerId: string;
  classId: string;
  slot: number;
}

export interface HostSimOptions {
  players: HostPlayerInit[];
  doubleTime?: boolean;
  /** Override the level-up auto-pick timeout (tests). */
  levelUpTimeout?: number;
}

export type HostStatus = 'playing' | 'victory' | 'defeat';

export interface PendingLevelUp {
  choices: UpgradeChoice[];
  /** Real seconds until the first option is auto-picked. */
  remaining: number;
}

export interface HostPlayerStats {
  playerId: string;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coins: number;
  timeSurvived: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  wasAliveAtEnd: boolean;
}

interface HostPlayer {
  id: string;
  slot: number;
  classId: string;
  sim: PlayerSim;
  entity: MultiplayerPlayerEntity;
  intentX: number;
  intentY: number;
  xp: number;
  level: number;
  kills: number;
  coins: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  levelUpQueue: number;
  pending: PendingLevelUp | null;
  diedAt: number | null;
  banished: Set<string>;
  damageThisStep: number;
}

// ---- Host -------------------------------------------------------------------

export class HostSim {
  readonly world: MultiplayerGameWorld;
  readonly rt: SimRuntime;
  readonly tileGen: TileGenerator;
  status: HostStatus = 'playing';
  tick = 0;
  bossesDefeated: string[] = [];

  private readonly players: HostPlayer[] = [];
  private readonly byId = new Map<string, HostPlayer>();
  private readonly events: GameEvent[] = [];
  private readonly callbacks: GameLoopCallbacks;
  private readonly levelUpTimeout: number;
  private current: HostPlayer | null = null;
  private scaledMaxId = 0;
  private realTime = 0;
  // scratch (reused every step: the step allocates nothing proportional to entities)
  private readonly active: HostPlayer[] = [];
  private readonly buckets: PickupEntity[][] = [[], [], [], []];
  private snapOut: GameStateSnapshot | undefined;
  private readonly nearScratch: { x: number; y: number }[] = [];

  constructor(opts: HostSimOptions) {
    if (opts.players.length < 1 || opts.players.length > 4) {
      throw new Error('HostSim needs 1-4 players');
    }
    this.levelUpTimeout = opts.levelUpTimeout ?? LEVEL_UP_TIMEOUT;
    const first = opts.players[0];
    const base = createGameWorld(1280, 720, first.classId, !!opts.doubleTime);
    const scaling: ScalingState = {
      targetPlayerCount: 1,
      currentPlayerCount: 1,
      transitionTimer: 0,
      transitionDuration: 0,
      hpMultiplier: 1,
      damageMultiplier: 1,
      spawnBudgetMultiplier: 1,
      bossHpMultiplier: 1,
      maxEnemies: 0,
      coinDropRate: 1,
    };
    this.world = Object.assign(base, {
      isMultiplayer: true as const,
      players: new Map<string, MultiplayerPlayerEntity>(),
      playerCount: 0,
      alivePlayerCount: 0,
      scalingState: scaling,
      sharedKills: 0,
      hostPlayerId: first.playerId,
      xpTrickleAccum: new Map<string, number>(),
    });
    this.world.camera = createCamera(1280, 720);
    this.rt = createSimRuntime(this.world);
    this.tileGen = createTileGenerator();
    this.callbacks = this.makeCallbacks();

    for (const init of opts.players) this.addPlayer(init);
    this.world.player = this.players[0].entity;
    this.scaledMaxId = this.world.nextId;
  }

  // ---- Players -------------------------------------------------------------

  /** Add a player (match start or drop-in). Drop-ins appear beside the nearest living player. */
  addPlayer(init: HostPlayerInit): void {
    if (this.byId.has(init.playerId) || this.players.length >= 4) return;
    const world = this.world;
    const def = CLASSES.find((c) => c.id === init.classId) || CLASSES[0];
    const maxHp = (def.baseStats.maxHp as number) || 100;
    const slot = Math.max(0, Math.min(3, init.slot));
    const dropIn = this.players.length > 0;

    let x = (slot - 1.5) * 48;
    let y = 0;
    let level = 1;
    if (dropIn) {
      const anchor = this.nearestActive(0, 0);
      if (anchor) {
        x = anchor.entity.x + 40;
        y = anchor.entity.y;
      }
      let sum = 0;
      let n = 0;
      for (const p of this.players) {
        if (!p.entity.isDead) {
          sum += p.level;
          n++;
        }
      }
      if (n > 0) level = Math.max(1, Math.round(sum / n));
    }

    const entity = {
      id: this.nextEntityId(),
      x,
      y,
      radius: 12,
      facingX: 1,
      facingY: 0,
      hp: maxHp,
      maxHp,
      iFrames: dropIn ? REVIVE_INVULN : 0,
      shieldHp: 0,
      positionHistory: [],
      playerId: init.playerId,
      classId: init.classId,
      color: PLAYER_SLOT_COLORS[slot],
      slot,
      isDowned: false,
      downTimer: 0,
      revivalProgress: 0,
      reviverId: null,
      isSpectating: false,
      isDead: false,
      weapons: [],
      passives: [],
      catalysts: [],
      abilityState: {},
      inputState: createInputState(),
      camera: createCamera(1280, 720),
      threatScore: 0,
      damageDealt: 0,
      lastInputTime: world.time,
      isAfk: false,
      invulnTimer: 0,
      mightBuff: 0,
      mightBuffAmount: 0,
      joinTime: world.time,
    } as MultiplayerPlayerEntity;

    const weapons = [{ weaponId: def.startingWeaponId, level: 1, evolved: false, cooldownTimer: 0 }];
    entity.weapons = weapons;
    const sim = createPlayerSim(entity as PlayerEntity, init.classId, weapons, entity.inputState);

    const hp: HostPlayer = {
      id: init.playerId,
      slot,
      classId: init.classId,
      sim,
      entity,
      intentX: 0,
      intentY: 0,
      xp: 0,
      level,
      kills: 0,
      coins: 0,
      revivesGiven: 0,
      revivesReceived: 0,
      wasDowned: false,
      levelUpQueue: 0,
      pending: null,
      diedAt: null,
      banished: new Set(),
      damageThisStep: 0,
    };
    this.players.push(hp);
    this.players.sort((a, b) => a.slot - b.slot);
    this.byId.set(hp.id, hp);
    world.players.set(hp.id, entity);
    this.refreshCounts();
  }

  /** Remove a player for good (left past the reconnect grace). */
  removePlayer(playerId: string): void {
    const p = this.byId.get(playerId);
    if (!p) return;
    this.byId.delete(playerId);
    this.world.players.delete(playerId);
    const i = this.players.indexOf(p);
    if (i >= 0) this.players.splice(i, 1);
    this.refreshCounts();
  }

  /**
   * Movement intent from a guest (untrusted): finite, clamped to the unit
   * circle. Never positions, HP or damage.
   */
  setInput(playerId: string, dx: number, dy: number): void {
    const p = this.byId.get(playerId);
    if (!p) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      dx = 0;
      dy = 0;
    }
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    p.intentX = dx;
    p.intentY = dy;
    p.entity.lastInputTime = this.world.time;
  }

  // ---- Level-ups -------------------------------------------------------------

  /** The choices a player must pick from, or null. */
  getPendingLevelUp(playerId: string): PendingLevelUp | null {
    return this.byId.get(playerId)?.pending ?? null;
  }

  /** Players whose overlay is open right now. */
  pendingLevelUpPlayers(): string[] {
    const out: string[] = [];
    for (const p of this.players) if (p.pending) out.push(p.id);
    return out;
  }

  /** Apply the player's pick. False if nothing is pending or the index is invalid. */
  chooseUpgrade(playerId: string, index: number): boolean {
    const p = this.byId.get(playerId);
    if (!p || !p.pending) return false;
    if (!Number.isInteger(index) || index < 0 || index >= p.pending.choices.length) return false;
    this.applyUpgrade(p, p.pending.choices[index]);
    p.pending = null;
    return true;
  }

  // ---- Queries --------------------------------------------------------------

  playerIds(): string[] {
    return this.players.map((p) => p.id);
  }

  getPlayer(playerId: string): Readonly<MultiplayerPlayerEntity> | undefined {
    return this.byId.get(playerId)?.entity;
  }

  getPlayerProgress(playerId: string): { level: number; xp: number; kills: number; coins: number } | undefined {
    const p = this.byId.get(playerId);
    return p && { level: p.level, xp: p.xp, kills: p.kills, coins: p.coins };
  }

  getLoadout(playerId: string) {
    const p = this.byId.get(playerId);
    return p && { weapons: p.sim.weapons, passives: p.sim.passives, catalysts: p.sim.catalysts };
  }

  getPlayerStats(): HostPlayerStats[] {
    return this.players.map((p) => ({
      playerId: p.id,
      classId: p.classId,
      slot: p.slot,
      level: p.level,
      kills: p.kills,
      coins: p.coins,
      timeSurvived: (p.diedAt ?? this.world.time) - p.entity.joinTime,
      revivesGiven: p.revivesGiven,
      revivesReceived: p.revivesReceived,
      wasDowned: p.wasDowned,
      wasAliveAtEnd: !p.entity.isDead && !p.entity.isDowned,
    }));
  }

  /** Take (and clear) the events raised since the last call. */
  drainEvents(): GameEvent[] {
    if (this.events.length === 0) return this.events;
    return this.events.splice(0, this.events.length);
  }

  // ---- Step -----------------------------------------------------------------

  /** Advance one fixed 60 Hz step. No-op once the run is over. */
  step(): void {
    if (this.status !== 'playing') return;
    const world = this.world;
    const rt = this.rt;
    const scaledDt = FIXED_DT * world.timeScale;
    this.tick++;
    this.realTime += FIXED_DT;
    world.time += scaledDt;

    this.updateLevelUps();
    this.updateDownedAndRevive(scaledDt);
    const act = this.collectActive();
    if (act.length === 0) {
      this.finish('defeat');
      return;
    }

    // Shared systems aim/spawn around ONE living player, rotating deterministically.
    const focus = act[Math.floor(world.time / FOCUS_PERIOD) % act.length];
    world.player = focus.entity;
    world.classId = focus.classId;

    // Terrain around the team (one tile generator, centred on the living players).
    let cx = 0;
    let cy = 0;
    for (const p of act) {
      cx += p.entity.x;
      cy += p.entity.y;
    }
    world.camera.x = cx / act.length;
    world.camera.y = cy / act.length;
    this.tileGen.update(world.camera);
    drainTilePickups(world, this.tileGen);

    this.applyScaling(act.length);

    stepWorldPrep(world, rt, this.tileGen, scaledDt);

    // ---- per-player: movement, abilities, catalysts, weapons ----
    for (const p of act) {
      this.enter(p);
      const stats = this.statsFor(p);
      const inp = p.sim.inputState;
      if (p.pending) {
        inp.dx = 0;
        inp.dy = 0;
      } else {
        inp.dx = p.intentX;
        inp.dy = p.intentY;
      }
      stepPlayerActions(world, rt, stats, scaledDt);
      this.afterPhase(p);
      this.leave(p);
    }

    // ---- shared: enemy AI, boss ----
    stepEnemiesAndBoss(world, rt, this.callbacks, scaledDt);

    // ---- per-player: combat (each pass owns its player's projectiles etc.) ----
    const stepId = this.tick;
    for (let i = 0; i < act.length; i++) {
      const p = act[i];
      if (p.entity.isDowned) continue; // went down earlier this step
      this.enter(p);
      const damage = handleCollisions(
        world,
        rt.effectiveStats!,
        scaledDt,
        rt.abilityState,
        this.callbacks,
        this.tileGen,
        rt.propHash,
        rt.damageablePropHash,
        rt.catalystStates,
        { ownerId: p.id, advanceShared: i === 0, stepId, skipDeaths: true },
      );
      p.entity.damageDealt += damage;
      p.entity.threatScore = p.entity.threatScore * 0.995 + damage;
      p.damageThisStep = damage;
      this.afterPhase(p);
      this.leave(p);
    }
    if (rt.bossState) enforceBossDpsCap(rt.bossState, scaledDt);

    // ---- deaths: credit each kill to its killer, run their on-kill hooks ----
    this.processDeaths(act, focus);
    tickCorpses(world, scaledDt);

    // ---- per-player: lifesteal and pickups ----
    this.bucketPickups(act);
    for (let i = 0; i < act.length; i++) {
      const p = act[i];
      if (p.entity.isDowned) continue;
      this.enter(p);
      world.pickups = this.buckets[i];
      stepPlayerPost(world, rt, rt.effectiveStats!, this.callbacks, scaledDt, p.damageThisStep);
      this.buckets[i] = world.pickups;
      this.afterPhase(p);
      this.leave(p);
    }
    this.mergePickups(act.length);

    // ---- shared: particles, wave director (team-scaled), animation ----
    world.player = focus.entity;
    world.classId = focus.classId;
    stepWorldPost(world, rt, this.callbacks, scaledDt, false, scaledDt * world.scalingState.spawnBudgetMultiplier);
    this.scaleNewEnemies();

    this.checkTeamWipe();
  }

  // ---- Snapshots ---------------------------------------------------------------

  /**
   * Encode the current world. Pass nothing to reuse one internal snapshot object
   * (safe when the result is emitted before the next call).
   */
  getSnapshot(out?: GameStateSnapshot): GameStateSnapshot {
    const world = this.world;
    const players: PlayerStateSnapshot[] = [];
    const near = this.nearScratch;
    near.length = 0;
    for (const p of this.players) {
      const e = p.entity;
      const state = e.isDead ? PLAYER_DEAD : e.isDowned ? PLAYER_DOWNED : PLAYER_ALIVE;
      if (state !== PLAYER_DEAD) near.push(e);
      players.push({
        playerId: p.id,
        x: quantise(e.x),
        y: quantise(e.y),
        hp: Math.max(0, Math.ceil(e.hp)),
        maxHp: Math.round(e.maxHp),
        fx: Math.round(e.facingX * 100),
        fy: Math.round(e.facingY * 100),
        state,
        downTimer: Math.ceil(Math.max(0, e.downTimer)),
        revive: Math.round(Math.max(0, Math.min(1, e.revivalProgress)) * 100),
        invuln: e.iFrames > 0,
        classId: p.classId,
        slot: p.slot,
        level: p.level,
        kills: p.kills,
        coins: p.coins,
        levelUpPending: p.pending !== null,
      });
    }
    // Spectators/dead players still need terrain context: fall back to everyone.
    if (near.length === 0) for (const p of this.players) near.push(p.entity);
    const src: SnapshotSource = {
      tick: this.tick,
      time: world.time,
      sharedKills: world.sharedKills,
      bossActive: world.bossActive,
      bossWarning: world.bossWarning,
      players,
      enemies: world.enemies,
      projectiles: world.projectiles,
      pickups: world.pickups,
    };
    const target = out ?? this.snapOut;
    const snap = encodeSnapshot(src, near, target);
    if (!out) this.snapOut = snap;
    return snap;
  }

  // ---- internals ---------------------------------------------------------------

  private nextEntityId(): number {
    return ++this.world.nextId;
  }

  private refreshCounts(): void {
    let alive = 0;
    for (const p of this.players) if (!p.entity.isDowned && !p.entity.isDead) alive++;
    this.world.playerCount = this.players.length;
    this.world.alivePlayerCount = alive;
  }

  private collectActive(): HostPlayer[] {
    const act = this.active;
    act.length = 0;
    for (const p of this.players) {
      if (!p.entity.isDowned && !p.entity.isDead) act.push(p);
    }
    this.refreshCounts();
    return act;
  }

  private nearestActive(x: number, y: number): HostPlayer | null {
    let best: HostPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.entity.isDowned || p.entity.isDead) continue;
      const dx = p.entity.x - x;
      const dy = p.entity.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Point the engine's single-player slots at `p`. */
  private enter(p: HostPlayer): void {
    swapIn(this.world, this.rt, p.sim);
    this.current = p;
  }

  private leave(p: HostPlayer): void {
    swapOut(this.world, this.rt, p.sim);
    this.current = null;
  }

  /** Effective stats for the swapped-in player, recomputed when their loadout changed. */
  private statsFor(p: HostPlayer) {
    const world = this.world;
    const rt = this.rt;
    refreshInventoryStats(world, rt);
    if (p.classId === 'berserker') rt.effectiveStats = recomputeStats(world, rt);
    return rt.effectiveStats!;
  }

  /** After any phase for `p`: stamp what they spawned, credit what they killed, check for going down. */
  private afterPhase(p: HostPlayer): void {
    const w = this.world;
    for (const pr of w.projectiles) if (!pr.isEnemy && pr.ownerId === undefined) pr.ownerId = p.id;
    for (const h of w.meleeHitboxes) if (h.ownerId === undefined) h.ownerId = p.id;
    for (const a of w.auras) if (a.ownerId === undefined) a.ownerId = p.id;
    for (const s of w.summons) if (s.ownerId === undefined) s.ownerId = p.id;
    for (const e of w.enemies) if (e.hp <= 0 && !e.isDead && e.lastHitBy === undefined) e.lastHitBy = p.id;

    const ent = p.entity;
    if (!ent.isDowned && !ent.isDead && ent.hp <= 0) {
      ent.hp = 0;
      ent.isDowned = true;
      ent.downTimer = DOWN_SECONDS;
      ent.revivalProgress = 0;
      ent.reviverId = null;
      ent.iFrames = 0;
      p.wasDowned = true;
      this.emit('player_downed', p.id);
    }
  }

  private processDeaths(act: HostPlayer[], focus: HostPlayer): void {
    const world = this.world;
    // A kill credited to someone no longer active (went down this step) or to
    // nobody (poison tick, bomb) falls to the focus player.
    for (const e of world.enemies) {
      if (e.hp <= 0 && !e.isDead) {
        const killer = e.lastHitBy === undefined ? undefined : this.byId.get(e.lastHitBy);
        if (!killer || killer.entity.isDowned || killer.entity.isDead) e.lastHitBy = focus.id;
      }
    }
    for (const p of act) {
      if (p.entity.isDowned) continue;
      this.enter(p);
      const id = p.id;
      processEnemyDeaths(
        world,
        this.rt.effectiveStats!,
        this.rt.abilityState,
        this.callbacks,
        this.rt.catalystStates,
        (e: EnemyEntity) => e.lastHitBy === id,
      );
      this.afterPhase(p);
      this.leave(p);
    }
  }

  // ---- pickups: each goes to its nearest living player ---------------------------

  private bucketPickups(act: HostPlayer[]): void {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
    const pickups = this.world.pickups;
    for (let k = 0; k < pickups.length; k++) {
      const pk = pickups[k];
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < act.length; i++) {
        const dx = act[i].entity.x - pk.x;
        const dy = act[i].entity.y - pk.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      this.buckets[best].push(pk);
    }
    // Keep the main array identity; it is refilled by mergePickups.
    this.mainPickups = pickups;
  }
  private mainPickups: PickupEntity[] = [];

  private mergePickups(n: number): void {
    const main = this.mainPickups;
    main.length = 0;
    for (let i = 0; i < n; i++) {
      const b = this.buckets[i];
      for (let k = 0; k < b.length; k++) main.push(b[k]);
    }
    this.world.pickups = main;
  }

  // ---- downed / revive / level-up timers ------------------------------------------

  private updateDownedAndRevive(dt: number): void {
    for (const p of this.players) {
      const e = p.entity;
      if (!e.isDowned || e.isDead) continue;
      e.downTimer -= dt;

      // Nearest living teammate within reach fills the revive bar.
      let reviver: HostPlayer | null = null;
      let bestD = REVIVE_RADIUS * REVIVE_RADIUS;
      for (const q of this.players) {
        if (q === p || q.entity.isDowned || q.entity.isDead) continue;
        const dx = q.entity.x - e.x;
        const dy = q.entity.y - e.y;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          reviver = q;
        }
      }
      if (reviver) {
        e.reviverId = reviver.id;
        e.revivalProgress += dt / REVIVE_SECONDS;
      } else {
        e.reviverId = null;
        e.revivalProgress = Math.max(0, e.revivalProgress - dt / REVIVE_SECONDS);
      }

      if (e.revivalProgress >= 1 && reviver) {
        e.isDowned = false;
        e.downTimer = 0;
        e.revivalProgress = 0;
        e.reviverId = null;
        e.hp = Math.max(1, Math.ceil(e.maxHp * REVIVE_HP_FRACTION));
        e.iFrames = REVIVE_INVULN;
        reviver.revivesGiven++;
        p.revivesReceived++;
        this.emit('player_revived', p.id, { by: reviver.id });
      } else if (e.downTimer <= 0) {
        e.isDowned = false;
        e.isDead = true;
        e.isSpectating = true;
        e.hp = 0;
        e.revivalProgress = 0;
        e.reviverId = null;
        p.diedAt = this.world.time;
        p.pending = null;
        p.levelUpQueue = 0;
        this.emit('player_dead', p.id);
      }
    }
  }

  private updateLevelUps(): void {
    for (const p of this.players) {
      const e = p.entity;
      if (e.isDead) continue;
      if (!p.pending && p.levelUpQueue > 0 && !e.isDowned) {
        p.levelUpQueue--;
        const choices = generateUpgradeChoices(p.sim.weapons, p.sim.passives, p.sim.catalysts, p.banished, false, 0);
        if (choices.length > 0) {
          p.pending = { choices, remaining: this.levelUpTimeout };
          this.emit('player_level_up', p.id, { level: p.level });
        }
      }
      if (p.pending) {
        // The overlay never pauses the world; the player is invulnerable while it is open.
        e.iFrames = Math.max(e.iFrames, 0.1);
        p.pending.remaining -= FIXED_DT;
        if (p.pending.remaining <= 0) {
          this.applyUpgrade(p, p.pending.choices[0]);
          p.pending = null;
        }
      }
    }
  }

  /** Mutates the loadout IN PLACE (weapon runtime state is keyed by object identity). */
  private applyUpgrade(p: HostPlayer, c: UpgradeChoice): void {
    const sim = p.sim;
    switch (c.type) {
      case 'new_weapon':
        if (sim.weapons.length < 6 && !sim.weapons.some((w) => w.weaponId === c.weaponId)) {
          sim.weapons.push({ weaponId: c.weaponId, level: 1, evolved: false, cooldownTimer: 0 });
        }
        break;
      case 'upgrade_weapon': {
        const w = sim.weapons.find((x) => x.weaponId === c.weaponId);
        if (w && w.level < 8) w.level++;
        break;
      }
      case 'new_passive':
        if (sim.passives.length + sim.catalysts.length < 6 && !sim.passives.some((x) => x.passiveId === c.passiveId)) {
          sim.passives.push({ passiveId: c.passiveId, level: 1 });
        }
        break;
      case 'upgrade_passive': {
        const x = sim.passives.find((y) => y.passiveId === c.passiveId);
        if (x && x.level < 5) x.level++;
        break;
      }
      case 'new_catalyst':
        if (sim.passives.length + sim.catalysts.length < 6 && !sim.catalysts.some((x) => x.catalystId === c.catalystId)) {
          sim.catalysts.push({ catalystId: c.catalystId, level: 1 });
        }
        break;
      case 'upgrade_catalyst': {
        const x = sim.catalysts.find((y) => y.catalystId === c.catalystId);
        if (x && x.level < 3) x.level++;
        break;
      }
      case 'gold':
        p.coins += c.amount;
        break;
    }
    const evo = checkEvolution(sim.weapons, sim.catalysts);
    if (evo) {
      const w = sim.weapons.find((x) => x.weaponId === evo.weaponId);
      if (w) {
        w.weaponId = evo.evolvedId;
        w.evolved = true;
      }
      const ci = sim.catalysts.findIndex((x) => x.catalystId === evo.consumedCatalystId);
      if (ci >= 0) sim.catalysts.splice(ci, 1);
    }
    // Stats are cached until the loadout SIZE changes; a level bump must refresh them too.
    sim.effectiveStats = null;
  }

  // ---- XP -------------------------------------------------------------------------

  private grantXp(p: HostPlayer, amount: number, trickle: boolean): void {
    const growth = p.sim.effectiveStats?.growth ?? 1;
    const gain = Math.floor(amount * growth);
    if (gain <= 0) return;
    p.xp += gain;
    while (p.xp >= xpRequired(p.level)) {
      p.xp -= xpRequired(p.level);
      p.level++;
      p.levelUpQueue++;
    }
    if (!trickle) return;
    for (const q of this.players) {
      if (q === p || q.entity.isDowned || q.entity.isDead) continue;
      const acc = (this.world.xpTrickleAccum.get(q.id) ?? 0) + gain * XP_TRICKLE;
      const whole = Math.floor(acc);
      this.world.xpTrickleAccum.set(q.id, acc - whole);
      if (whole > 0) this.grantXp(q, whole, false);
    }
  }

  // ---- scaling --------------------------------------------------------------------

  private applyScaling(alive: number): void {
    const s = this.world.scalingState;
    const extra = Math.max(0, alive - 1);
    s.targetPlayerCount = alive;
    s.currentPlayerCount = alive;
    s.hpMultiplier = 1 + 0.5 * extra;
    s.damageMultiplier = 1 + 0.15 * extra;
    s.spawnBudgetMultiplier = 1 + 0.6 * extra;
    s.bossHpMultiplier = 1 + 0.8 * extra;
    s.coinDropRate = 1;
  }

  /** Enemies created since the last step (spawns, splits, minions, the boss) take the team multipliers once. */
  private scaleNewEnemies(): void {
    const s = this.world.scalingState;
    const world = this.world;
    const from = this.scaledMaxId;
    if (world.nextId === from) return;
    this.scaledMaxId = world.nextId;
    if (s.hpMultiplier === 1 && s.damageMultiplier === 1 && s.bossHpMultiplier === 1) return;
    for (const e of world.enemies) {
      if (e.id <= from) continue;
      const hpMul = e.isBoss ? s.bossHpMultiplier : s.hpMultiplier;
      e.hp *= hpMul;
      e.maxHp *= hpMul;
      e.damage *= s.damageMultiplier;
    }
  }

  // ---- end of run -----------------------------------------------------------------

  private checkTeamWipe(): void {
    if (this.status !== 'playing') return;
    for (const p of this.players) if (!p.entity.isDowned && !p.entity.isDead) return;
    this.emit('tpk');
    this.finish('defeat');
  }

  private finish(status: HostStatus): void {
    if (this.status !== 'playing') return;
    this.status = status;
    if (status === 'victory') this.emit('victory');
    else if (!this.events.some((e) => e.type === 'tpk')) this.emit('tpk');
  }

  private emit(type: GameEvent['type'], playerId?: string, data?: Record<string, unknown>): void {
    this.events.push({ type, playerId, data, timestamp: Math.round(this.world.time * 1000) });
  }

  // ---- engine callbacks (routed to whoever is swapped in) --------------------------

  private makeCallbacks(): GameLoopCallbacks {
    return {
      onPlayerDamage: () => {},
      onPlayerHeal: () => {},
      onXPGain: (amount) => {
        if (this.current) this.grantXp(this.current, amount, true);
      },
      onCoinGain: (amount) => {
        if (this.current) this.current.coins += amount;
      },
      onKill: () => {
        this.world.sharedKills++;
        if (this.current) this.current.kills++;
      },
      onEnemySpawns: () => {},
      onLevelUp: () => {},
      onBossSpawn: (bossId) => this.emit('boss_spawn', undefined, { bossId }),
      onBossKill: (bossId) => {
        if (!this.bossesDefeated.includes(bossId)) this.bossesDefeated.push(bossId);
        this.emit('boss_kill', undefined, { bossId });
      },
      onVictory: () => this.finish('victory'),
      onWeaponDisable: () => {},
    };
  }
}

/** Convenience factory. */
export function createHostSim(opts: HostSimOptions): HostSim {
  return new HostSim(opts);
}

// GameWorld is re-exported for tests that want to hash the whole host world.
export type { GameWorld };
