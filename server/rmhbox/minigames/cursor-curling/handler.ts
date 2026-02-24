/**
 * RMHbox — Cursor Curling Minigame Server Handler
 *
 * A momentum-based accuracy game inspired by curling. Players launch
 * stones toward a target (the "House") and others can sweep to reduce
 * friction. Server-authoritative physics simulation handles motion,
 * collisions, and wall bouncing.
 *
 * Phases per end:
 *   END_START → AIM → POWER → SIMULATION → (next thrower or END_RESULTS)
 *     → TRANSITION → (next end or GAME_OVER)
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §3
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { ThrowStoneSchema, SweepSchema } from '@/lib/rmhbox/cursor-curling/schemas';
import {
  CU_TOTAL_ENDS,
  CU_END_START_SECONDS,
  CU_AIM_DURATION_SECONDS,
  CU_POWER_DURATION_SECONDS,
  CU_END_RESULTS_SECONDS,
  CU_TRANSITION_SECONDS,
  CU_CANVAS_WIDTH,
  CU_CANVAS_HEIGHT,
  CU_HOUSE_CENTER,
  CU_BULLSEYE_RADIUS,
  CU_INNER_RADIUS,
  CU_OUTER_RADIUS,
  CU_HOUSE_RADIUS,
  CU_STONE_RADIUS,
  CU_LAUNCH_Y,
  CU_BASE_FRICTION,
  CU_SWEPT_FRICTION,
  CU_MAX_LAUNCH_SPEED,
  CU_SIMULATION_TICK_MS,
  CU_STOP_THRESHOLD,
  CU_RESTITUTION,
  CU_SWEEP_WINDOW_MS,
  CU_SWEEP_THRESHOLD,
  CU_SWEEP_INPUT_RATE_LIMIT,
  CU_BULLSEYE_POINTS,
  CU_INNER_RING_POINTS,
  CU_OUTER_RING_POINTS,
  CU_HOUSE_POINTS,
  CU_CLOSEST_BONUS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  CUPhase,
  CurlingStone,
  StonePhysics,
  EndResult,
  StoneResult,
  CursorCurlingState,
} from './types';

// ─── Player Color Palette ────────────────────────────────────────

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

// ─── Cursor Curling Minigame ─────────────────────────────────────

export class CursorCurlingGame extends BaseMinigame {
  private state!: CursorCurlingState;
  private startedAt: number = 0;
  private simulationInterval: NodeJS.Timeout | null = null;
  /** Tracks sweep input timestamps per player for rate limiting. */
  private sweepRateLimits: Map<string, number[]> = new Map();
  /** Color assignment per player. */
  private playerColors: Map<string, string> = new Map();

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.startedAt = Date.now();
    this.isRunning = true;

    // Assign colors to players
    const playerIds = Array.from(this.context.players.keys());
    playerIds.forEach((id, i) => {
      this.playerColors.set(id, PLAYER_COLORS[i % PLAYER_COLORS.length]);
    });

    // Initialize state
    this.state = {
      currentEnd: 0,
      totalEnds: this.getSetting('totalEnds', CU_TOTAL_ENDS),
      phase: 'END_START',
      throwOrder: [],
      currentThrowerIndex: 0,
      stones: [],
      activeStoneSim: null,
      collidedStones: new Map(),
      sweepStates: new Map(),
      playerScores: new Map(),
      endResults: [],
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now(),
      sweepEffectiveness: new Map(),
      knockOuts: new Map(),
      outOfBounds: new Map(),
      bestDistance: new Map(),
      actionLog: [],
    };

    // Initialize per-player tracking
    for (const id of playerIds) {
      this.state.playerScores.set(id, 0);
      this.state.sweepEffectiveness.set(id, 0);
      this.state.knockOuts.set(id, 0);
      this.state.outOfBounds.set(id, 0);
      this.state.bestDistance.set(id, Infinity);
    }

    logger.info({
      event: 'cursor_curling_start',
      roomId: this.context.lobbyId,
      playerCount: playerIds.length,
      totalEnds: this.state.totalEnds,
    });

    this.startNextEnd();
  }

  // ─── End Lifecycle ───────────────────────────────────────────

  private startNextEnd(): void {
    this.state.currentEnd++;

    if (this.state.currentEnd > this.state.totalEnds) {
      this.endGame();
      return;
    }

    // Randomize throw order each end
    const playerIds = Array.from(this.context.players.keys());
    this.state.throwOrder = this.shuffleArray([...playerIds]);
    this.state.currentThrowerIndex = 0;
    this.state.stones = [];
    this.state.activeStoneSim = null;
    this.state.collidedStones = new Map();

    this.setPhase('END_START');

    this.logAction('end_start', {
      end: this.state.currentEnd,
      throwOrder: this.state.throwOrder,
    });

    const throwOrderInfo = this.state.throwOrder.map((id) => ({
      userId: id,
      userName: this.getPlayerName(id),
    }));

    this.context.broadcastAction({
      type: 'CU_END_START',
      payload: {
        endNumber: this.state.currentEnd,
        throwOrder: throwOrderInfo,
      },
    });

    this.broadcastRound(this.state.currentEnd, this.state.totalEnds);

    this.setTimeout(() => {
      this.startAimPhase();
    }, CU_END_START_SECONDS * 1000);
  }

  private startAimPhase(): void {
    if (!this.isRunning) return;

    const aimDuration = this.getSetting('aimDuration', CU_AIM_DURATION_SECONDS);
    this.setPhase('AIM');

    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];
    const throwerName = this.getPlayerName(throwerId);

    this.context.broadcastAction({
      type: 'CU_THROWER_ACTIVE',
      payload: {
        userId: throwerId,
        userName: throwerName,
        aimDurationSeconds: aimDuration,
      },
    });

    this.startPhaseTimer(aimDuration);

    // Auto-advance to power phase after aim duration
    this.setTimeout(() => {
      if (this.state.phase === 'AIM') {
        this.startPowerPhase();
      }
    }, aimDuration * 1000);
  }

  private startPowerPhase(): void {
    if (!this.isRunning) return;

    const powerDuration = this.getSetting('powerDuration', CU_POWER_DURATION_SECONDS);
    this.setPhase('POWER');

    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];

    this.context.sendToPlayer(throwerId, 'rmhbox:game:action', {
      type: 'CU_POWER_PHASE',
      payload: { powerDurationSeconds: powerDuration },
    });

    this.startPhaseTimer(powerDuration);

    // Auto-throw with low power if timer expires
    this.setTimeout(() => {
      if (this.state.phase === 'POWER') {
        this.executeThrow(throwerId, 0, 0.1);
      }
    }, powerDuration * 1000);
  }

  private executeThrow(throwerId: string, angle: number, power: number): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    const stoneId = `stone-${this.state.currentEnd}-${this.state.currentThrowerIndex}`;
    const launchX = CU_CANVAS_WIDTH / 2;
    const launchY = CU_LAUNCH_Y;

    // Compute launch velocity
    const speed = power * CU_MAX_LAUNCH_SPEED;
    const vx = Math.sin(angle) * speed;
    const vy = -Math.cos(angle) * speed; // negative = upward

    // Create stone entity
    const stone: CurlingStone = {
      id: stoneId,
      userId: throwerId,
      position: { x: launchX, y: launchY },
      isInPlay: true,
      color: this.playerColors.get(throwerId) ?? '#ffffff',
    };
    this.state.stones.push(stone);

    // Initialize physics
    this.state.activeStoneSim = {
      position: { x: launchX, y: launchY },
      velocity: { vx, vy },
      friction: CU_BASE_FRICTION,
      isMoving: true,
    };

    this.state.collidedStones = new Map();

    // Initialize sweep states for non-throwers
    const enableSweeping = this.getSetting('enableSweeping', true);
    this.state.sweepStates = new Map();
    if (enableSweeping) {
      for (const id of this.state.throwOrder) {
        if (id !== throwerId) {
          this.state.sweepStates.set(id, {
            userId: id,
            recentInputs: [],
            isSweeping: false,
          });
        }
      }
    }

    this.setPhase('SIMULATION');

    this.context.broadcastAction({
      type: 'CU_STONE_LAUNCHED',
      payload: { userId: throwerId, angle, power },
    });

    this.logAction('throw', {
      end: this.state.currentEnd,
      userId: throwerId,
      angle,
      power,
      swept: false,
    });

    logger.info({
      event: 'stone_launched',
      roomId: this.context.lobbyId,
      userId: throwerId,
      angle,
      power,
    });

    this.runSimulationLoop();
  }

  // ─── Physics Simulation ──────────────────────────────────────

  private runSimulationLoop(): void {
    this.simulationInterval = this.setInterval(() => {
      if (!this.state.activeStoneSim || !this.isRunning) {
        this.stopSimulation();
        return;
      }

      // Check if anyone is sweeping
      const anySweeping = this.isAnySweeping();

      // Simulate the active stone
      this.simulateStone(
        this.state.activeStoneSim,
        anySweeping ? CU_SWEPT_FRICTION : CU_BASE_FRICTION,
      );

      // Check collisions with resting stones
      this.checkCollisions();

      // Simulate any collided stones
      for (const [sId, physics] of this.state.collidedStones) {
        if (physics.isMoving) {
          this.simulateStone(physics, CU_BASE_FRICTION);
          // Update the resting stone position
          const stone = this.state.stones.find((s) => s.id === sId);
          if (stone) {
            stone.position = { ...physics.position };
          }
          // Broadcast position for collided stones
          this.context.broadcastAction({
            type: 'CU_STONE_POSITION',
            payload: {
              stoneId: sId,
              x: physics.position.x,
              y: physics.position.y,
              vx: physics.velocity.vx,
              vy: physics.velocity.vy,
            },
          });
        }
      }

      // Update stone entity position
      const activeStone = this.state.stones[this.state.stones.length - 1];
      if (activeStone && this.state.activeStoneSim) {
        activeStone.position = { ...this.state.activeStoneSim.position };
      }

      // Broadcast active stone position
      if (this.state.activeStoneSim?.isMoving) {
        this.context.broadcastAction({
          type: 'CU_STONE_POSITION',
          payload: {
            stoneId: activeStone?.id,
            x: this.state.activeStoneSim.position.x,
            y: this.state.activeStoneSim.position.y,
            vx: this.state.activeStoneSim.velocity.vx,
            vy: this.state.activeStoneSim.velocity.vy,
          },
        });
      }

      // Emit sweep effect
      if (anySweeping) {
        this.context.broadcastAction({
          type: 'CU_SWEPT_EFFECT',
          payload: {
            stoneId: activeStone?.id,
            frictionReduced: true,
          },
        });
      }

      // Check if all stones have stopped
      if (this.allStonesStopped()) {
        this.stopSimulation();
        this.onAllStonesStopped();
      }
    }, CU_SIMULATION_TICK_MS);
  }

  private simulateStone(physics: StonePhysics, friction: number): void {
    if (!physics.isMoving) return;

    // Apply friction
    physics.velocity.vx *= friction;
    physics.velocity.vy *= friction;

    // Update position
    physics.position.x += physics.velocity.vx;
    physics.position.y += physics.velocity.vy;

    // Wall collisions (left/right bounce)
    if (physics.position.x < CU_STONE_RADIUS) {
      physics.position.x = CU_STONE_RADIUS;
      physics.velocity.vx = -physics.velocity.vx;
    } else if (physics.position.x > CU_CANVAS_WIDTH - CU_STONE_RADIUS) {
      physics.position.x = CU_CANVAS_WIDTH - CU_STONE_RADIUS;
      physics.velocity.vx = -physics.velocity.vx;
    }

    // Top boundary — stone slides off
    if (physics.position.y < 0) {
      physics.isMoving = false;
      // Mark stone out of play
      const stone = this.state.stones.find(
        (s) =>
          Math.abs(s.position.x - physics.position.x) < 1 &&
          Math.abs(s.position.y - physics.position.y) < 1,
      );
      if (stone) stone.isInPlay = false;
      return;
    }

    // Bottom boundary — stone stays in launch zone = out of play
    if (physics.position.y > CU_CANVAS_HEIGHT - CU_STONE_RADIUS) {
      physics.position.y = CU_CANVAS_HEIGHT - CU_STONE_RADIUS;
      physics.velocity.vy = -physics.velocity.vy * 0.5; // Weak bounce back
    }

    // Speed check — stop if below threshold
    const speed = Math.sqrt(
      physics.velocity.vx ** 2 + physics.velocity.vy ** 2,
    );
    if (speed < CU_STOP_THRESHOLD) {
      physics.velocity.vx = 0;
      physics.velocity.vy = 0;
      physics.isMoving = false;

      // Check if stone stopped in launch zone
      if (physics.position.y > CU_LAUNCH_Y - 20) {
        const stone = this.state.stones.find(
          (s) =>
            Math.abs(s.position.x - physics.position.x) < 1 &&
            Math.abs(s.position.y - physics.position.y) < 1,
        );
        if (stone) stone.isInPlay = false;
      }
    }
  }

  private checkCollisions(): void {
    if (!this.state.activeStoneSim || !this.state.activeStoneSim.isMoving) return;

    const activePos = this.state.activeStoneSim.position;
    const activeStone = this.state.stones[this.state.stones.length - 1];

    for (let i = 0; i < this.state.stones.length - 1; i++) {
      const other = this.state.stones[i];
      if (!other.isInPlay) continue;

      const dx = other.position.x - activePos.x;
      const dy = other.position.y - activePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CU_STONE_RADIUS * 2) {
        // Elastic collision
        const nx = dx / dist;
        const ny = dy / dist;

        const activeVel = this.state.activeStoneSim.velocity;
        const otherPhysics = this.state.collidedStones.get(other.id);

        const otherVx = otherPhysics?.velocity.vx ?? 0;
        const otherVy = otherPhysics?.velocity.vy ?? 0;

        // Relative velocity
        const dvx = activeVel.vx - otherVx;
        const dvy = activeVel.vy - otherVy;
        const dvDotN = dvx * nx + dvy * ny;

        // Only collide if stones are approaching
        if (dvDotN > 0) {
          const impulse = dvDotN * (1 + CU_RESTITUTION) / 2;

          activeVel.vx -= impulse * nx;
          activeVel.vy -= impulse * ny;

          const newOtherVx = otherVx + impulse * nx;
          const newOtherVy = otherVy + impulse * ny;

          // Create/update physics for the collided stone
          this.state.collidedStones.set(other.id, {
            position: { ...other.position },
            velocity: { vx: newOtherVx, vy: newOtherVy },
            friction: CU_BASE_FRICTION,
            isMoving: true,
          });

          // Separate stones to prevent overlap
          const overlap = CU_STONE_RADIUS * 2 - dist;
          activePos.x -= (overlap / 2) * nx;
          activePos.y -= (overlap / 2) * ny;
          other.position.x += (overlap / 2) * nx;
          other.position.y += (overlap / 2) * ny;

          // Track knockouts — if collision knocks stone out of house
          const otherDistBefore = this.distanceToCenter(other.position);
          if (otherDistBefore <= CU_HOUSE_RADIUS) {
            // Will track after it stops; increment in post-sim
          }

          this.context.broadcastAction({
            type: 'CU_STONE_COLLISION',
            payload: {
              movingStoneId: activeStone?.id,
              hitStoneId: other.id,
              newPositions: [
                { id: activeStone?.id, x: activePos.x, y: activePos.y },
                { id: other.id, x: other.position.x, y: other.position.y },
              ],
            },
          });

          logger.debug({
            event: 'stone_collision',
            roomId: this.context.lobbyId,
            movingStoneId: activeStone?.id,
            hitStoneId: other.id,
          });
        }
      }
    }
  }

  private allStonesStopped(): boolean {
    if (this.state.activeStoneSim?.isMoving) return false;
    for (const [, physics] of this.state.collidedStones) {
      if (physics.isMoving) return false;
    }
    return true;
  }

  private stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.intervals = this.intervals.filter((i) => i !== this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  private onAllStonesStopped(): void {
    if (!this.isRunning) return;

    const activeStone = this.state.stones[this.state.stones.length - 1];
    if (activeStone) {
      const zone = this.getZone(activeStone.position);
      const finalPos = { ...activeStone.position };

      // Track out-of-bounds
      if (!activeStone.isInPlay) {
        const count = this.state.outOfBounds.get(activeStone.userId) ?? 0;
        this.state.outOfBounds.set(activeStone.userId, count + 1);
      }

      // Track best distance
      if (activeStone.isInPlay) {
        const dist = this.distanceToCenter(activeStone.position);
        const best = this.state.bestDistance.get(activeStone.userId) ?? Infinity;
        if (dist < best) {
          this.state.bestDistance.set(activeStone.userId, dist);
        }
      }

      // Track knockouts from collisions
      for (const [stoneId, physics] of this.state.collidedStones) {
        const stone = this.state.stones.find((s) => s.id === stoneId);
        if (stone && !stone.isInPlay && stone.userId !== activeStone.userId) {
          const count = this.state.knockOuts.get(activeStone.userId) ?? 0;
          this.state.knockOuts.set(activeStone.userId, count + 1);
        }
        // Update final position of collided stones
        if (stone) {
          stone.position = { ...physics.position };
        }
      }

      // Check if throw was swept
      const wasSwepped = Array.from(this.state.sweepStates.values()).some(
        (s) => s.isSweeping,
      );

      this.logAction('stone_rest', {
        end: this.state.currentEnd,
        userId: activeStone.userId,
        position: finalPos,
        distanceToBullseye: this.distanceToCenter(finalPos),
      });

      // Update logged throw with swept info
      const throwAction = this.state.actionLog.find(
        (a) =>
          a.type === 'throw' &&
          (a.payload as Record<string, unknown>).end === this.state.currentEnd &&
          (a.payload as Record<string, unknown>).userId === activeStone.userId,
      );
      if (throwAction) {
        (throwAction.payload as Record<string, unknown>).swept = wasSwepped;
      }

      this.context.broadcastAction({
        type: 'CU_STONE_STOPPED',
        payload: {
          stoneId: activeStone.id,
          finalPosition: finalPos,
          inPlay: activeStone.isInPlay,
          zone: activeStone.isInPlay ? zone : null,
        },
      });
    }

    this.state.activeStoneSim = null;
    this.state.collidedStones = new Map();

    this.nextThrowOrEndPhase();
  }

  private nextThrowOrEndPhase(): void {
    this.state.currentThrowerIndex++;

    if (this.state.currentThrowerIndex >= this.state.throwOrder.length) {
      // All players have thrown → compute end results
      this.computeEndResults();
    } else {
      this.startAimPhase();
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeEndResults(): void {
    if (!this.isRunning) return;

    const stonePositions: StoneResult[] = [];
    let closestUserId: string | null = null;
    let closestDist = Infinity;

    for (const stone of this.state.stones) {
      const dist = this.distanceToCenter(stone.position);
      const zone = stone.isInPlay ? this.getZone(stone.position) : 'outside';
      const points = stone.isInPlay ? this.getZonePoints(zone) : 0;

      stonePositions.push({
        userId: stone.userId,
        userName: this.getPlayerName(stone.userId),
        position: { ...stone.position },
        distance: dist,
        zone,
        points,
      });

      // Award points
      const currentScore = this.state.playerScores.get(stone.userId) ?? 0;
      this.state.playerScores.set(stone.userId, currentScore + points);

      // Track closest
      if (stone.isInPlay && dist < closestDist) {
        closestDist = dist;
        closestUserId = stone.userId;
      }
    }

    // Award closest bonus
    if (closestUserId) {
      const currentScore = this.state.playerScores.get(closestUserId) ?? 0;
      this.state.playerScores.set(closestUserId, currentScore + CU_CLOSEST_BONUS);
    }

    const endResult: EndResult = {
      endNumber: this.state.currentEnd,
      stonePositions,
      closestUserId,
    };
    this.state.endResults.push(endResult);

    this.logAction('end_result', {
      end: this.state.currentEnd,
      scores: Object.fromEntries(this.state.playerScores),
      closestUserId,
      stonePositions: stonePositions.map((s) => ({
        userId: s.userId,
        x: s.position.x,
        y: s.position.y,
      })),
    });

    this.setPhase('END_RESULTS');

    this.context.broadcastAction({
      type: 'CU_END_RESULTS',
      payload: endResult,
    });

    this.startPhaseTimer(CU_END_RESULTS_SECONDS);

    this.setTimeout(() => {
      this.startTransition();
    }, CU_END_RESULTS_SECONDS * 1000);
  }

  private startTransition(): void {
    if (!this.isRunning) return;

    this.setPhase('TRANSITION');
    this.setTimeout(() => {
      this.startNextEnd();
    }, CU_TRANSITION_SECONDS * 1000);
  }

  // ─── Game End ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;

    this.setPhase('GAME_OVER');
    this.stopSimulation();

    const rankings = this.computeResults();

    this.logAction('game_end', {
      finalScores: Object.fromEntries(this.state.playerScores),
      placements: rankings.rankings.map((r) => ({
        userId: r.userId,
        placement: r.rank,
        score: r.score,
      })),
    });

    this.context.broadcastAction({
      type: 'CU_GAME_OVER',
      payload: { finalRankings: rankings.rankings },
    });

    logger.info({
      event: 'cursor_curling_end',
      roomId: this.context.lobbyId,
      duration: Date.now() - this.startedAt,
    });

    this.context.onComplete(rankings);
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning) return;

    switch (action) {
      case 'THROW_STONE':
        this.handleThrow(userId, data);
        break;
      case 'SWEEP':
        this.handleSweep(userId, data);
        break;
      default:
        logger.warn({
          event: 'unknown_action',
          roomId: this.context.lobbyId,
          userId,
          action,
        });
    }
  }

  private handleThrow(userId: string, data: unknown): void {
    // Only the active thrower can throw, during AIM or POWER phase
    if (this.state.phase !== 'AIM' && this.state.phase !== 'POWER') return;

    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];
    if (userId !== throwerId) return;

    const parsed = ThrowStoneSchema.safeParse(data);
    if (!parsed.success) return;

    this.executeThrow(userId, parsed.data.angle, parsed.data.power);
  }

  private handleSweep(userId: string, data: unknown): void {
    if (this.state.phase !== 'SIMULATION') return;

    // Thrower cannot sweep their own stone
    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];
    if (userId === throwerId) return;

    const parsed = SweepSchema.safeParse(data);
    if (!parsed.success) return;

    // Rate limit: max CU_SWEEP_INPUT_RATE_LIMIT per second
    const now = Date.now();
    const timestamps = this.sweepRateLimits.get(userId) ?? [];
    const recentTimestamps = timestamps.filter((t) => now - t < 1000);
    if (recentTimestamps.length >= CU_SWEEP_INPUT_RATE_LIMIT) return;
    recentTimestamps.push(now);
    this.sweepRateLimits.set(userId, recentTimestamps);

    // Record sweep input
    const sweepState = this.state.sweepStates.get(userId);
    if (!sweepState) return;

    sweepState.recentInputs.push({
      x: parsed.data.x,
      y: parsed.data.y,
      timestamp: now,
    });

    // Prune old inputs
    sweepState.recentInputs = sweepState.recentInputs.filter(
      (input) => now - input.timestamp < CU_SWEEP_WINDOW_MS,
    );

    // Check sweep effectiveness
    const wasSweeping = sweepState.isSweeping;
    sweepState.isSweeping = sweepState.recentInputs.length >= CU_SWEEP_THRESHOLD;

    // Track sweep effectiveness (time spent sweeping)
    if (sweepState.isSweeping) {
      const current = this.state.sweepEffectiveness.get(userId) ?? 0;
      this.state.sweepEffectiveness.set(
        userId,
        current + CU_SIMULATION_TICK_MS,
      );
    }

    // Broadcast sweep state change
    if (sweepState.isSweeping !== wasSweeping) {
      this.context.broadcastAction({
        type: 'CU_SWEEP_ACTIVE',
        payload: {
          userId,
          userName: this.getPlayerName(userId),
          isActive: sweepState.isSweeping,
        },
      });
    }
  }

  // ─── State Views ─────────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];
    const isMyTurn = userId === throwerId;
    const timeRemaining = Math.max(
      0,
      Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000),
    );

    const stones = this.state.stones.map((s) => ({
      id: s.id,
      userId: s.userId,
      x: s.position.x,
      y: s.position.y,
      isInPlay: s.isInPlay,
      color: s.color,
    }));

    const scores = Array.from(this.state.playerScores.entries()).map(
      ([id, score]) => ({
        userId: id,
        userName: this.getPlayerName(id),
        totalScore: score,
      }),
    );

    const base = {
      currentEnd: this.state.currentEnd,
      totalEnds: this.state.totalEnds,
      phase: this.state.phase,
      stones,
      scores,
      timeRemaining,
    };

    if (this.state.phase === 'AIM' || this.state.phase === 'POWER') {
      return {
        ...base,
        isMyTurn,
        throwerId,
        throwerName: this.getPlayerName(throwerId),
        // Aim/power data hidden from non-throwers
      };
    }

    if (this.state.phase === 'SIMULATION') {
      const sweepingPlayers = Array.from(this.state.sweepStates.values())
        .filter((s) => s.isSweeping)
        .map((s) => ({ userId: s.userId, userName: this.getPlayerName(s.userId) }));

      return {
        ...base,
        canSweep: userId !== throwerId,
        sweepingPlayers,
        activeStonId: this.state.stones[this.state.stones.length - 1]?.id,
      };
    }

    if (this.state.phase === 'END_RESULTS') {
      return {
        ...base,
        endResults: this.state.endResults[this.state.endResults.length - 1],
      };
    }

    return base;
  }

  getStateForSpectator(): unknown {
    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];

    const stones = this.state.stones.map((s) => ({
      id: s.id,
      userId: s.userId,
      x: s.position.x,
      y: s.position.y,
      isInPlay: s.isInPlay,
      color: s.color,
    }));

    const scores = Array.from(this.state.playerScores.entries()).map(
      ([id, score]) => ({
        userId: id,
        userName: this.getPlayerName(id),
        totalScore: score,
      }),
    );

    return {
      currentEnd: this.state.currentEnd,
      totalEnds: this.state.totalEnds,
      phase: this.state.phase,
      stones,
      scores,
      throwerId,
      throwerName: this.getPlayerName(throwerId),
      // Spectators see aim/power (omniscient view)
      sweepingPlayers: Array.from(this.state.sweepStates.values())
        .filter((s) => s.isSweeping)
        .map((s) => ({ userId: s.userId, userName: this.getPlayerName(s.userId) })),
      endResults: this.state.endResults,
    };
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const playerIds = Array.from(this.context.players.keys());

    // Build rankings sorted by score descending
    const sortedPlayers = playerIds
      .map((id) => ({
        userId: id,
        userName: this.getPlayerName(id),
        score: this.state.playerScores.get(id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    const rankings: PlayerRanking[] = sortedPlayers.map((p, idx) => ({
      userId: p.userId,
      userName: p.userName,
      score: p.score,
      rank: idx + 1,
      deltas: { curling: p.score },
    }));

    // Compute awards
    const awards: Award[] = [];

    // Bullseye! — hit bullseye in any end
    for (const result of this.state.endResults) {
      for (const sp of result.stonePositions) {
        if (sp.zone === 'bullseye') {
          awards.push({
            userId: sp.userId,
            title: 'Bullseye!',
            description: 'Hit the bullseye in an end',
            icon: 'target',
          });
          break;
        }
      }
    }

    // Master Sweeper — most effective sweeping
    let maxSweep = 0;
    let sweeperId = '';
    for (const [id, ms] of this.state.sweepEffectiveness) {
      if (ms > maxSweep) {
        maxSweep = ms;
        sweeperId = id;
      }
    }
    if (sweeperId && maxSweep > 0) {
      awards.push({
        userId: sweeperId,
        title: 'Master Sweeper',
        description: 'Most effective sweeping',
        icon: 'wind',
      });
    }

    // Demolition Derby — knocked most opponent stones out
    let maxKnockouts = 0;
    let demolitionId = '';
    for (const [id, count] of this.state.knockOuts) {
      if (count > maxKnockouts) {
        maxKnockouts = count;
        demolitionId = id;
      }
    }
    if (demolitionId && maxKnockouts > 0) {
      awards.push({
        userId: demolitionId,
        title: 'Demolition Derby',
        description: 'Knocked the most opponent stones out of play',
        icon: 'boom',
      });
    }

    // Gentle Touch — stone closest to bullseye center
    let bestDist = Infinity;
    let gentleId = '';
    for (const [id, dist] of this.state.bestDistance) {
      if (dist < bestDist) {
        bestDist = dist;
        gentleId = id;
      }
    }
    if (gentleId && bestDist < Infinity) {
      awards.push({
        userId: gentleId,
        title: 'Gentle Touch',
        description: 'Stone stopped closest to the bullseye center',
        icon: 'feather',
      });
    }

    // Off the Rails — most out of bounds
    let maxOOB = 0;
    let oobId = '';
    for (const [id, count] of this.state.outOfBounds) {
      if (count > maxOOB) {
        maxOOB = count;
        oobId = id;
      }
    }
    if (oobId && maxOOB > 0) {
      awards.push({
        userId: oobId,
        title: 'Off the Rails',
        description: 'Stone went out of bounds the most times',
        icon: 'slash',
      });
    }

    return {
      rankings,
      awards,
      gameSpecificData: {
        totalEnds: this.state.totalEnds,
        endResults: this.state.endResults,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  // ─── Game Log ────────────────────────────────────────────────

  private buildGameLog(): Record<string, unknown> {
    return {
      minigameId: 'cursor-curling',
      version: 1,
      players: Array.from(this.context.players.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
      })),
      initialState: {
        totalEnds: this.state.totalEnds,
        playerCount: this.context.players.size,
        canvasSize: { width: CU_CANVAS_WIDTH, height: CU_CANVAS_HEIGHT },
        houseCenter: CU_HOUSE_CENTER,
        bullseyeRadius: CU_BULLSEYE_RADIUS,
        stoneRadius: CU_STONE_RADIUS,
        throwOrder: this.state.throwOrder,
      },
      actions: this.state.actionLog,
      gameSettings: { ...this.context.gameSettings },
    };
  }

  // ─── Disconnect / Reconnect ──────────────────────────────────

  handlePlayerDisconnect(userId: string): void {
    // If it's the disconnected player's turn to throw, auto-throw a dud
    const throwerId = this.state.throwOrder[this.state.currentThrowerIndex];
    if (
      userId === throwerId &&
      (this.state.phase === 'AIM' || this.state.phase === 'POWER')
    ) {
      logger.info({
        event: 'auto_throw_disconnect',
        roomId: this.context.lobbyId,
        userId,
      });
      this.setTimeout(() => {
        if (
          this.state.phase === 'AIM' ||
          this.state.phase === 'POWER'
        ) {
          this.executeThrow(userId, 0, 0);
        }
      }, 2000);
    }
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );
  }

  // ─── Utility Helpers ─────────────────────────────────────────

  private setPhase(phase: CUPhase): void {
    this.state.phase = phase;
    this.state.phaseStartedAt = Date.now();
    // Calculate phase end based on known durations
    const durations: Partial<Record<CUPhase, number>> = {
      END_START: CU_END_START_SECONDS * 1000,
      AIM: this.getSetting('aimDuration', CU_AIM_DURATION_SECONDS) * 1000,
      POWER: this.getSetting('powerDuration', CU_POWER_DURATION_SECONDS) * 1000,
      END_RESULTS: CU_END_RESULTS_SECONDS * 1000,
      TRANSITION: CU_TRANSITION_SECONDS * 1000,
    };
    this.state.phaseEndsAt =
      Date.now() + (durations[phase] ?? 0);

    logger.debug({
      event: 'phase_change',
      roomId: this.context.lobbyId,
      phase,
    });
  }

  private distanceToCenter(pos: { x: number; y: number }): number {
    const dx = pos.x - CU_HOUSE_CENTER.x;
    const dy = pos.y - CU_HOUSE_CENTER.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getZone(pos: { x: number; y: number }): string {
    const dist = this.distanceToCenter(pos);
    if (dist <= CU_BULLSEYE_RADIUS) return 'bullseye';
    if (dist <= CU_INNER_RADIUS) return 'inner';
    if (dist <= CU_OUTER_RADIUS) return 'outer';
    if (dist <= CU_HOUSE_RADIUS) return 'house';
    return 'outside';
  }

  private getZonePoints(zone: string): number {
    switch (zone) {
      case 'bullseye': return CU_BULLSEYE_POINTS;
      case 'inner': return CU_INNER_RING_POINTS;
      case 'outer': return CU_OUTER_RING_POINTS;
      case 'house': return CU_HOUSE_POINTS;
      default: return 0;
    }
  }

  private getPlayerName(userId: string): string {
    return this.context.players.get(userId)?.userName ?? 'Unknown';
  }

  private isAnySweeping(): boolean {
    for (const [, state] of this.state.sweepStates) {
      if (state.isSweeping) return true;
    }
    return false;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: this.state.actionLog.length + 1,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  cleanup(): void {
    this.stopSimulation();
    super.cleanup();
  }
}
