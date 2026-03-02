/**
 * StageManager — Drives phase progression, wave spawning, and boss AI
 * for a single stage of Dream Rift.
 *
 * Lifecycle:
 *   intro (180 frames) -> waves1 -> midBoss -> waves2 -> boss -> clear (180 frames)
 *
 * The StageManager is ticked every fixed-update frame by the engine. It
 * manages the current phase, spawns enemies from wave data, runs boss AI
 * (firing patterns at specified intervals), and advances spell cards when
 * boss HP crosses phase thresholds.
 */

import type { StageDef, Boss, WaveDef, BulletPatternDef } from './types';
import type { DreamRiftEngine } from './engine';
import { PLAYFIELD_WIDTH } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StagePhase = 'intro' | 'waves1' | 'midBoss' | 'waves2' | 'boss' | 'clear';

/** Internal state for tracking wave progression within a wave set. */
interface WaveState {
  waveIndex: number;
  waveTimer: number;
  enemySpawnTimers: number[];
  spawned: boolean[];
}

/** Internal state for tracking a live boss encounter. */
interface BossState {
  boss: Boss;
  /** Cumulative damage dealt to the boss across all spell phases. */
  totalDamageDealt: number;
  /** Damage dealt within the current spell card phase. */
  phaseDamageDealt: number;
  /** Frame counter since the current spell card started. */
  spellTimer: number;
  /** Per-pattern fire timers (one per pattern in the current spell card). */
  patternTimers: number[];
  /** True when the boss has been fully defeated. */
  defeated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTRO_DURATION = 180;  // 3 seconds at 60fps
const CLEAR_DURATION = 180;  // 3 seconds at 60fps
const BOSS_MOVE_SPEED = 1.2; // pixels per frame for boss drift
const BOSS_MOVE_RANGE = 80;  // max horizontal drift from centre

// ---------------------------------------------------------------------------
// StageManager
// ---------------------------------------------------------------------------

export class StageManager {
  private stage: StageDef;
  private phase: StagePhase = 'intro';
  private phaseTimer = 0;

  // Wave tracking
  private waveState: WaveState = { waveIndex: 0, waveTimer: 0, enemySpawnTimers: [], spawned: [] };
  private currentWaves: WaveDef[] = [];

  // Boss tracking
  private bossState: BossState | null = null;
  private activeBoss: Boss | null = null;

  // Boss movement
  private bossMoveDir = 1;
  private bossMoveAccum = 0;

  // Store reference for nextStage()
  private storeRef: { nextStage: () => void } | null = null;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(stage: StageDef) {
    this.stage = stage;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Return the current phase. */
  getPhase(): StagePhase {
    return this.phase;
  }

  /** Return the currently active boss, or null if no boss phase is running. */
  getActiveBoss(): Boss | null {
    return this.activeBoss;
  }

  /** Return the current spell card name if a boss is active, otherwise null. */
  getCurrentSpellName(): string | null {
    if (!this.activeBoss || !this.bossState) return null;
    const idx = this.activeBoss.currentSpellIndex;
    const card = this.activeBoss.spellCards[idx];
    return card ? card.name : null;
  }

  /** Return remaining time (frames) for the current spell card, or -1. */
  getSpellTimeRemaining(): number {
    if (!this.bossState || !this.activeBoss) return -1;
    const card = this.activeBoss.spellCards[this.activeBoss.currentSpellIndex];
    if (!card) return -1;
    return Math.max(0, card.timeLimit - this.bossState.spellTimer);
  }

  /**
   * Attach a store reference so the manager can call nextStage() on clear.
   * Expects an object with at least a `nextStage()` method.
   */
  setStore(store: { nextStage: () => void }): void {
    this.storeRef = store;
  }

  /** Force-start a specific phase. Useful for debugging or cutscene skips. */
  startPhase(phase: StagePhase): void {
    this.phase = phase;
    this.phaseTimer = 0;

    switch (phase) {
      case 'intro':
        break;

      case 'waves1':
        this.initWaves(this.stage.waves1);
        break;

      case 'midBoss':
        this.initBoss(this.stage.midBoss);
        break;

      case 'waves2':
        this.initWaves(this.stage.waves2);
        break;

      case 'boss':
        this.initBoss(this.stage.boss);
        break;

      case 'clear':
        this.activeBoss = null;
        this.bossState = null;
        break;
    }
  }

  /**
   * Apply damage to the currently active boss. Called by the engine when
   * player bullets collide with the boss.
   */
  damageBoss(amount: number): void {
    if (!this.bossState || !this.activeBoss || this.bossState.defeated) return;

    this.bossState.totalDamageDealt += amount;
    this.bossState.phaseDamageDealt += amount;

    // Check if current spell card HP is depleted
    const currentSpell = this.activeBoss.spellCards[this.activeBoss.currentSpellIndex];
    if (currentSpell && this.bossState.phaseDamageDealt >= currentSpell.hp) {
      this.advanceSpellCard();
    }
  }

  /**
   * Main update tick — called once per fixed-update frame by the engine.
   * Drives all phase transitions, wave spawning, and boss AI.
   */
  update(engine: DreamRiftEngine): void {
    this.phaseTimer++;

    switch (this.phase) {
      case 'intro':
        this.updateIntro();
        break;

      case 'waves1':
        this.updateWaves(engine);
        break;

      case 'midBoss':
        this.updateBoss(engine);
        break;

      case 'waves2':
        this.updateWaves(engine);
        break;

      case 'boss':
        this.updateBoss(engine);
        break;

      case 'clear':
        this.updateClear();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Phase update logic
  // -------------------------------------------------------------------------

  private updateIntro(): void {
    if (this.phaseTimer >= INTRO_DURATION) {
      this.startPhase('waves1');
    }
  }

  private updateClear(): void {
    if (this.phaseTimer >= CLEAR_DURATION) {
      this.storeRef?.nextStage();
    }
  }

  // -------------------------------------------------------------------------
  // Wave logic
  // -------------------------------------------------------------------------

  private initWaves(waves: WaveDef[]): void {
    this.currentWaves = waves;
    this.waveState = {
      waveIndex: 0,
      waveTimer: 0,
      enemySpawnTimers: [],
      spawned: [],
    };
    if (waves.length > 0) {
      this.prepareWave(0);
    }
  }

  private prepareWave(index: number): void {
    const wave = this.currentWaves[index];
    if (!wave) return;
    this.waveState.waveIndex = index;
    this.waveState.waveTimer = 0;
    this.waveState.enemySpawnTimers = wave.enemies.map(() => 0);
    this.waveState.spawned = wave.enemies.map(() => false);
  }

  private updateWaves(engine: DreamRiftEngine): void {
    const ws = this.waveState;
    const wave = this.currentWaves[ws.waveIndex];
    if (!wave) {
      // All waves complete — advance to next phase
      this.advanceFromWaves();
      return;
    }

    ws.waveTimer++;

    // Check if we have passed the wave delay (time before this wave starts spawning)
    if (ws.waveTimer < wave.delay) return;

    const frameInWave = ws.waveTimer - wave.delay;

    // Spawn enemies whose delay has been reached
    let allSpawned = true;
    for (let i = 0; i < wave.enemies.length; i++) {
      if (ws.spawned[i]) continue;
      const def = wave.enemies[i];
      if (frameInWave >= def.delay) {
        // Spawn this enemy — fire its patterns via the engine
        this.spawnEnemy(engine, def);
        ws.spawned[i] = true;
      } else {
        allSpawned = false;
      }
    }

    if (!allSpawned) return;

    // All enemies in this wave have been spawned.
    // Wait a grace period for patterns to finish, then advance to next wave.
    // (A simple heuristic: wait the longest pattern duration in the wave.)
    const longestDuration = wave.enemies.reduce((max, e) => {
      const maxPat = e.patterns.reduce((m, p) => Math.max(m, p.duration), 0);
      return Math.max(max, maxPat);
    }, 0);

    const waveEndFrame = wave.delay + Math.max(...wave.enemies.map(e => e.delay)) + longestDuration;

    if (ws.waveTimer >= waveEndFrame) {
      // Advance to next wave
      const nextIndex = ws.waveIndex + 1;
      if (nextIndex < this.currentWaves.length) {
        this.prepareWave(nextIndex);
      } else {
        this.advanceFromWaves();
      }
    }
  }

  /**
   * Spawn an enemy by firing its patterns through the engine.
   * In a full implementation this would create a live Enemy entity that
   * follows its path. For now we fire the initial patterns from the spawn
   * position (the first path waypoint or the spawn x/y).
   */
  private spawnEnemy(
    engine: DreamRiftEngine,
    def: { x: number; y: number; patterns: BulletPatternDef[]; path: { x: number; y: number }[] },
  ): void {
    const spawnX = def.path.length > 0 ? def.path[0].x : def.x;
    const spawnY = def.path.length > 0 ? def.path[0].y : def.y;

    for (const pattern of def.patterns) {
      engine.spawnEnemyPattern(spawnX, spawnY, pattern);
    }
  }

  private advanceFromWaves(): void {
    if (this.phase === 'waves1') {
      this.startPhase('midBoss');
    } else if (this.phase === 'waves2') {
      this.startPhase('boss');
    }
  }

  // -------------------------------------------------------------------------
  // Boss logic
  // -------------------------------------------------------------------------

  private initBoss(bossTemplate: Boss): void {
    // Deep-clone the boss template so we can mutate it freely
    const boss: Boss = {
      ...bossTemplate,
      position: { ...bossTemplate.position },
      velocity: { ...bossTemplate.velocity },
      spellCards: bossTemplate.spellCards.map(sc => ({
        ...sc,
        patterns: sc.patterns.map(p => ({ ...p, modifiers: p.modifiers ? [...p.modifiers] : undefined })),
      })),
      phaseHp: [...bossTemplate.phaseHp],
      currentSpellIndex: 0,
    };

    this.activeBoss = boss;
    this.bossState = {
      boss,
      totalDamageDealt: 0,
      phaseDamageDealt: 0,
      spellTimer: 0,
      patternTimers: this.initPatternTimers(boss),
      defeated: false,
    };
    this.bossMoveDir = 1;
    this.bossMoveAccum = 0;
  }

  private initPatternTimers(boss: Boss): number[] {
    const card = boss.spellCards[boss.currentSpellIndex];
    if (!card) return [];
    return card.patterns.map(() => 0);
  }

  private updateBoss(engine: DreamRiftEngine): void {
    const bs = this.bossState;
    const boss = this.activeBoss;
    if (!bs || !boss || bs.defeated) return;

    bs.spellTimer++;

    // --- Boss movement: gentle horizontal drift ---
    this.bossMoveAccum += BOSS_MOVE_SPEED * this.bossMoveDir;
    if (Math.abs(this.bossMoveAccum) > BOSS_MOVE_RANGE) {
      this.bossMoveDir *= -1;
    }
    boss.position.x = PLAYFIELD_WIDTH / 2 + this.bossMoveAccum;

    // --- Check spell card time limit ---
    const currentCard = boss.spellCards[boss.currentSpellIndex];
    if (currentCard && bs.spellTimer >= currentCard.timeLimit) {
      // Time expired — advance to next spell card (no capture bonus)
      this.advanceSpellCard();
      return;
    }

    // --- Fire patterns from the current spell card ---
    if (currentCard) {
      for (let i = 0; i < currentCard.patterns.length; i++) {
        const pattern = currentCard.patterns[i];
        bs.patternTimers[i]++;

        if (bs.patternTimers[i] >= pattern.interval) {
          bs.patternTimers[i] = 0;
          engine.spawnEnemyPattern(
            boss.position.x,
            boss.position.y,
            pattern,
          );
        }
      }
    }
  }

  /**
   * Advance to the next spell card phase, or defeat the boss if all
   * spell cards have been exhausted.
   */
  private advanceSpellCard(): void {
    const boss = this.activeBoss;
    const bs = this.bossState;
    if (!boss || !bs) return;

    const nextIndex = boss.currentSpellIndex + 1;

    if (nextIndex >= boss.spellCards.length) {
      // Boss defeated
      bs.defeated = true;
      this.onBossDefeated();
      return;
    }

    // Advance to next spell card
    boss.currentSpellIndex = nextIndex;
    bs.phaseDamageDealt = 0;
    bs.spellTimer = 0;
    bs.patternTimers = this.initPatternTimers(boss);
  }

  private onBossDefeated(): void {
    if (this.phase === 'midBoss') {
      this.startPhase('waves2');
    } else if (this.phase === 'boss') {
      this.startPhase('clear');
    }
  }
}
