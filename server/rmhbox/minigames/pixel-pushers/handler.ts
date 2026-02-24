/**
 * RMHbox — Pixel Pushers Minigame Server Handler
 *
 * Cooperative physics-based game where players push a ball through
 * obstacle courses. Features polarity flips that turn one player
 * into a "magnet" attracting the ball. Server-authoritative physics
 * simulation runs at ~30Hz; state is broadcast at ~15Hz.
 *
 * Phases per level:
 *   LEVEL_PREVIEW → ACTIVE → LEVEL_COMPLETE → (next level or GAME_OVER)
 *
 * Join-in-progress policy: join_immediately — new players get a pusher.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §3
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import type { PPLevel } from '@/lib/rmhbox/pixel-pushers/schemas';
import { PPMoveSchema } from '@/lib/rmhbox/pixel-pushers/schemas';
import { loadLevels, selectLevelsForGame } from '@/lib/rmhbox/pixel-pushers/level-loader';
import {
  PP_TOTAL_LEVELS, PP_CANVAS_WIDTH, PP_CANVAS_HEIGHT,
  PP_LEVEL_PREVIEW_SECONDS, PP_ACTIVE_DURATION_SECONDS, PP_LEVEL_COMPLETE_SECONDS,
  PP_PUSHER_RADIUS, PP_BALL_RADIUS, PP_PUSHER_SPEED,
  PP_PUSH_FORCE, PP_BALL_FRICTION, PP_BALL_MAX_SPEED, PP_BALL_WALL_RESTITUTION,
  PP_POLARITY_INTERVAL_SECONDS, PP_POLARITY_WARNING_SECONDS,
  PP_ATTRACT_RADIUS, PP_ATTRACT_FORCE, PP_MAX_ATTRACT_FORCE,
  PP_WAYPOINT_RADIUS, PP_MOVE_INPUT_RATE,
  PP_SIMULATION_TICK_MS, PP_STATE_BROADCAST_RATE,
  PP_LEVEL_COMPLETE_POINTS, PP_WAYPOINT_POINTS, PP_TIME_BONUS_PER_SECOND,
  PP_MVP_BONUS, PP_POLARITY_CONTROL_BONUS, PP_DISCONNECT_GHOST_DELAY_MS,
  PP_PUSHER_COLORS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  circleCircleCollision, circleAABBCollision, pointInAABB,
  normalizeVector, clampMagnitude,
} from './physics';
import type {
  PPPhase, BallPhysics, PusherState, PPWaypoint, PPFinalRanking,
  PixelPushersState, GameLogAction,
} from './types';

// ─── Rate Limiter ────────────────────────────────────────────────

/** Simple per-player input rate limiter. */
class InputRateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  /** Returns true if the input should be allowed. */
  allow(userId: string, maxPerSecond: number): boolean {
    const now = Date.now();
    const windowMs = 1000;
    let times = this.timestamps.get(userId);
    if (!times) {
      times = [];
      this.timestamps.set(userId, times);
    }
    // Remove timestamps outside the window
    while (times.length > 0 && times[0] < now - windowMs) {
      times.shift();
    }
    if (times.length >= maxPerSecond) return false;
    times.push(now);
    return true;
  }
}

// ─── Pixel Pushers Minigame ──────────────────────────────────────

export class PixelPushersMinigame extends BaseMinigame {
  private state!: PixelPushersState;
  private levelPool: PPLevel[];
  private rateLimiter = new InputRateLimiter();
  private startedAt = 0;

  constructor(context: MinigameContext) {
    super(context);
    this.levelPool = loadLevels();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalLevels = this.getSetting('totalLevels', PP_TOTAL_LEVELS);
    const usedIds = new Set<string>();
    const levels = selectLevelsForGame(this.levelPool, totalLevels, usedIds);

    logger.info({
      event: 'pixel_pushers:start',
      lobbyId: this.context.lobbyId,
      totalLevels,
      playerCount: this.context.players.size,
      levelIds: levels.map((l) => l.id),
    });

    this.state = {
      currentLevel: 0,
      totalLevels,
      phase: 'LEVEL_PREVIEW',
      canvasWidth: PP_CANVAS_WIDTH,
      canvasHeight: PP_CANVAS_HEIGHT,
      currentLevelData: null,
      walls: [],
      goalZone: { x: 0, y: 0, width: 0, height: 0 },
      waypoints: [],
      nextWaypointIndex: 0,
      ball: this.createDefaultBall(),
      pushers: new Map(),
      polarityFlippedUserId: null,
      nextPolarityFlipAt: 0,
      polarityWarningEmitted: false,
      playerScores: new Map(),
      polarityFlipsHandled: new Map(),
      levelStartedAt: 0,
      phaseStartedAt: Date.now(),
      phaseEndsAt: 0,
      simulationInterval: null,
      broadcastInterval: null,
      levels,
      lastBallTouchUserId: null,
      levelCompletionTimes: [],
      wallProximityTime: new Map(),
      actionLog: [],
      actionSeq: 0,
    };

    // Initialize scores
    for (const userId of this.context.players.keys()) {
      this.state.playerScores.set(userId, 0);
      this.state.polarityFlipsHandled.set(userId, 0);
      this.state.wallProximityTime.set(userId, 0);
    }

    this.startNextLevel();
  }

  private createDefaultBall(): BallPhysics {
    return {
      position: { x: 0, y: 0 },
      velocity: { vx: 0, vy: 0 },
      radius: PP_BALL_RADIUS,
      friction: PP_BALL_FRICTION,
      mass: 1.0,
    };
  }

  // ─── Level Lifecycle ─────────────────────────────────────────

  private startNextLevel(): void {
    this.state.currentLevel++;

    if (this.state.currentLevel > this.state.totalLevels) {
      this.endGame();
      return;
    }

    const levelData = this.state.levels[this.state.currentLevel - 1];
    if (!levelData) {
      this.endGame();
      return;
    }

    this.state.currentLevelData = levelData;
    this.state.walls = [...levelData.walls];
    this.state.goalZone = { ...levelData.goalZone };
    this.state.waypoints = levelData.waypoints
      .sort((a, b) => a.order - b.order)
      .map((w) => ({ x: w.x, y: w.y, order: w.order, reached: false }));
    this.state.nextWaypointIndex = 0;

    // Initialize ball
    this.state.ball = {
      position: { ...levelData.ballStart },
      velocity: { vx: 0, vy: 0 },
      radius: PP_BALL_RADIUS,
      friction: PP_BALL_FRICTION,
      mass: 1.0,
    };

    // Initialize pushers
    this.state.pushers.clear();
    let i = 0;
    for (const [userId] of this.context.players) {
      const startPos = levelData.playerStartPositions[i % levelData.playerStartPositions.length];
      this.state.pushers.set(userId, {
        userId,
        position: { x: startPos.x, y: startPos.y },
        color: PP_PUSHER_COLORS[i % PP_PUSHER_COLORS.length],
        polarity: 'push',
        moveDirection: null,
        pushCount: 0,
        isDisconnected: false,
        disconnectedAt: null,
        isGhost: false,
      });
      i++;
    }

    this.state.polarityFlippedUserId = null;
    this.state.nextPolarityFlipAt = Date.now() + PP_POLARITY_INTERVAL_SECONDS * 1000;
    this.state.polarityWarningEmitted = false;
    this.state.lastBallTouchUserId = null;
    this.state.phase = 'LEVEL_PREVIEW';
    this.state.phaseStartedAt = Date.now();

    this.broadcastRound(this.state.currentLevel, this.state.totalLevels);

    // Log level start
    this.logAction('level_start', {
      levelIndex: this.state.currentLevel - 1,
      layoutId: levelData.id,
      timeLimit: this.getSetting('activeDuration', PP_ACTIVE_DURATION_SECONDS),
    });

    // Broadcast level start
    const playerCount = this.context.players.size;
    this.context.broadcastAction({
      type: 'PP_LEVEL_START',
      payload: {
        level: this.state.currentLevel,
        levelName: levelData.name,
        layout: {
          walls: this.state.walls,
          goalZone: this.state.goalZone,
          waypoints: this.state.waypoints.map((w) => ({ x: w.x, y: w.y, order: w.order })),
          ballStart: { ...levelData.ballStart },
          playerStartPositions: levelData.playerStartPositions.slice(0, playerCount),
        },
        activeDurationSeconds: this.getSetting('activeDuration', PP_ACTIVE_DURATION_SECONDS),
      },
    });

    logger.info({
      event: 'pixel_pushers:level_start',
      lobbyId: this.context.lobbyId,
      level: this.state.currentLevel,
      levelId: levelData.id,
    });

    // Schedule active phase after preview
    this.setTimeout(() => this.startActivePhase(), PP_LEVEL_PREVIEW_SECONDS * 1000);
  }

  private startActivePhase(): void {
    if (!this.isRunning) return;

    const activeDuration = this.getSetting('activeDuration', PP_ACTIVE_DURATION_SECONDS);
    this.state.phase = 'ACTIVE';
    this.state.levelStartedAt = Date.now();
    this.state.phaseStartedAt = Date.now();
    this.state.phaseEndsAt = Date.now() + activeDuration * 1000;

    // Start phase timer for countdown display
    this.startPhaseTimer(activeDuration);

    // Start simulation loop (~30Hz)
    this.state.simulationInterval = this.setInterval(() => this.simulationTick(), PP_SIMULATION_TICK_MS);

    // Start broadcast loop (~15Hz)
    this.state.broadcastInterval = this.setInterval(
      () => this.broadcastState(),
      Math.round(1000 / PP_STATE_BROADCAST_RATE),
    );

    // Schedule timeout
    this.setTimeout(() => {
      if (this.state.phase === 'ACTIVE') {
        this.endLevel('TIMEOUT');
      }
    }, activeDuration * 1000);

    logger.info({
      event: 'pixel_pushers:active_phase',
      lobbyId: this.context.lobbyId,
      level: this.state.currentLevel,
    });
  }

  private endLevel(reason: 'GOAL' | 'TIMEOUT'): void {
    if (this.state.phase !== 'ACTIVE') return;

    // Stop simulation and broadcast
    this.stopSimulation();
    this.clearPhaseTimer();

    const elapsedMs = Date.now() - this.state.levelStartedAt;
    const timeRemainingSeconds = Math.max(0, (this.state.phaseEndsAt - Date.now()) / 1000);

    if (reason === 'GOAL') {
      this.state.phase = 'LEVEL_COMPLETE';
      const timeBonus = Math.floor(timeRemainingSeconds * PP_TIME_BONUS_PER_SECOND);
      const reachedCount = this.state.waypoints.filter((w) => w.reached).length;

      // Award points to all players
      for (const userId of this.state.playerScores.keys()) {
        this.addScore(userId, PP_LEVEL_COMPLETE_POINTS + timeBonus);
      }

      // MVP bonus (most pushes)
      let mvpUserId: string | null = null;
      let maxPushes = 0;
      for (const [userId, pusher] of this.state.pushers) {
        if (pusher.pushCount > maxPushes) {
          maxPushes = pusher.pushCount;
          mvpUserId = userId;
        }
      }
      if (mvpUserId) {
        this.addScore(mvpUserId, PP_MVP_BONUS);
      }

      this.state.levelCompletionTimes.push(elapsedMs);

      // Log level complete
      this.logAction('level_complete', {
        levelIndex: this.state.currentLevel - 1,
        completionTime: elapsedMs,
        waypointsCollected: reachedCount,
        timeBonus,
      });

      this.context.broadcastAction({
        type: 'PP_LEVEL_COMPLETE',
        payload: {
          timeMs: elapsedMs,
          waypointsReached: reachedCount,
          totalWaypoints: this.state.waypoints.length,
        },
      });

      logger.info({
        event: 'pixel_pushers:level_complete',
        lobbyId: this.context.lobbyId,
        level: this.state.currentLevel,
        timeMs: elapsedMs,
        reason,
      });

      this.setTimeout(() => this.startNextLevel(), PP_LEVEL_COMPLETE_SECONDS * 1000);
    } else {
      // TIMEOUT
      this.logAction('level_failed', {
        levelIndex: this.state.currentLevel - 1,
        reason: 'timeout',
        elapsed: elapsedMs,
      });

      this.context.broadcastAction({
        type: 'PP_LEVEL_FAILED',
        payload: { reason: 'TIMEOUT' },
      });

      logger.info({
        event: 'pixel_pushers:level_failed',
        lobbyId: this.context.lobbyId,
        level: this.state.currentLevel,
        reason: 'TIMEOUT',
      });

      this.setTimeout(() => this.startNextLevel(), 2000);
    }
  }

  private endGame(): void {
    this.state.phase = 'GAME_OVER';
    this.stopSimulation();
    this.clearPhaseTimer();

    const results = this.computeResults();

    // Log game complete
    const playerStats = Array.from(this.state.pushers.entries()).map(([userId, p]) => ({
      userId,
      waypointsHit: 0, // simplified — could track per-player
      flipsReceived: this.state.polarityFlipsHandled.get(userId) ?? 0,
    }));
    const mvpUserId = this.getMvpUserId();
    this.logAction('game_complete', {
      levelsCleared: this.state.levelCompletionTimes.length,
      totalTime: Date.now() - this.startedAt,
      mvpUserId,
      playerStats,
    });

    const finalRankings = this.buildFinalRankings();
    this.context.broadcastAction({
      type: 'PP_GAME_OVER',
      payload: {
        finalRankings,
        levelsCompleted: this.state.levelCompletionTimes.length,
        totalPushes: this.getTotalPushes(),
      },
    });

    logger.info({
      event: 'pixel_pushers:game_over',
      lobbyId: this.context.lobbyId,
      levelsCompleted: this.state.levelCompletionTimes.length,
    });

    this.context.onComplete(results);
  }

  // ─── Physics Simulation ──────────────────────────────────────

  private simulationTick(): void {
    if (this.state.phase !== 'ACTIVE') return;

    const enablePolarity = this.getSetting('enablePolarityFlip', true);

    // Step 1: Apply pusher movement
    for (const [, pusher] of this.state.pushers) {
      if (pusher.isGhost || pusher.isDisconnected) continue;
      if (!pusher.moveDirection) continue;

      const dir = normalizeVector(pusher.moveDirection);
      if (dir.x === 0 && dir.y === 0) continue;

      let newX = pusher.position.x + dir.x * PP_PUSHER_SPEED;
      let newY = pusher.position.y + dir.y * PP_PUSHER_SPEED;

      // Clamp to canvas bounds
      newX = Math.max(PP_PUSHER_RADIUS, Math.min(PP_CANVAS_WIDTH - PP_PUSHER_RADIUS, newX));
      newY = Math.max(PP_PUSHER_RADIUS, Math.min(PP_CANVAS_HEIGHT - PP_PUSHER_RADIUS, newY));

      // Wall collision for pushers
      let blocked = false;
      for (const wall of this.state.walls) {
        const col = circleAABBCollision(
          { x: newX, y: newY, radius: PP_PUSHER_RADIUS },
          wall,
        );
        if (col) {
          // Push back along collision normal
          newX += col.normal.x * col.overlap;
          newY += col.normal.y * col.overlap;
          blocked = true;
        }
      }

      pusher.position.x = newX;
      pusher.position.y = newY;

      // Track wall proximity for Wall Flower award
      if (blocked) {
        const current = this.state.wallProximityTime.get(pusher.userId) ?? 0;
        this.state.wallProximityTime.set(pusher.userId, current + 1);
      }
    }

    // Step 2: Apply polarity attraction
    if (enablePolarity && this.state.polarityFlippedUserId) {
      const attractedPusher = this.state.pushers.get(this.state.polarityFlippedUserId);
      if (attractedPusher && !attractedPusher.isGhost) {
        const dx = attractedPusher.position.x - this.state.ball.position.x;
        const dy = attractedPusher.position.y - this.state.ball.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0 && dist <= PP_ATTRACT_RADIUS) {
          const attractDir = normalizeVector({ x: dx, y: dy });
          let forceMag = PP_ATTRACT_FORCE / (dist * dist);
          forceMag = Math.min(forceMag, PP_MAX_ATTRACT_FORCE);

          this.state.ball.velocity.vx += attractDir.x * forceMag;
          this.state.ball.velocity.vy += attractDir.y * forceMag;
        }
      }
    }

    // Step 3: Pusher-ball push collisions
    for (const [, pusher] of this.state.pushers) {
      if (pusher.isGhost) continue;
      if (pusher.polarity === 'attract') continue;

      const col = circleCircleCollision(
        { x: pusher.position.x, y: pusher.position.y, radius: PP_PUSHER_RADIUS },
        { x: this.state.ball.position.x, y: this.state.ball.position.y, radius: PP_BALL_RADIUS },
      );

      if (col) {
        // Apply impulse to ball
        const impulseX = col.normal.x * PP_PUSH_FORCE * col.overlap;
        const impulseY = col.normal.y * PP_PUSH_FORCE * col.overlap;

        this.state.ball.velocity.vx += impulseX;
        this.state.ball.velocity.vy += impulseY;

        // Separate ball from pusher
        this.state.ball.position.x += col.normal.x * col.overlap;
        this.state.ball.position.y += col.normal.y * col.overlap;

        pusher.pushCount++;
        this.state.lastBallTouchUserId = pusher.userId;

        // Broadcast push event
        const player = this.context.players.get(pusher.userId);
        this.context.broadcastAction({
          type: 'PP_PUSH_EVENT',
          payload: {
            userId: pusher.userId,
            userName: player?.userName ?? 'Unknown',
            impulse: { x: impulseX, y: impulseY },
          },
        });
      }
    }

    // Step 4: Apply ball velocity
    this.state.ball.position.x += this.state.ball.velocity.vx;
    this.state.ball.position.y += this.state.ball.velocity.vy;

    // Apply friction
    this.state.ball.velocity.vx *= PP_BALL_FRICTION;
    this.state.ball.velocity.vy *= PP_BALL_FRICTION;

    // Clamp speed
    const vel = clampMagnitude(
      { x: this.state.ball.velocity.vx, y: this.state.ball.velocity.vy },
      PP_BALL_MAX_SPEED,
    );
    this.state.ball.velocity.vx = vel.x;
    this.state.ball.velocity.vy = vel.y;

    // Stop near-zero velocities
    if (Math.abs(this.state.ball.velocity.vx) < 0.01) this.state.ball.velocity.vx = 0;
    if (Math.abs(this.state.ball.velocity.vy) < 0.01) this.state.ball.velocity.vy = 0;

    // Step 5: Ball-wall collisions
    for (const wall of this.state.walls) {
      const col = circleAABBCollision(
        { x: this.state.ball.position.x, y: this.state.ball.position.y, radius: PP_BALL_RADIUS },
        wall,
      );
      if (col) {
        // Push ball out
        this.state.ball.position.x += col.normal.x * col.overlap;
        this.state.ball.position.y += col.normal.y * col.overlap;

        // Reflect velocity
        const dot = this.state.ball.velocity.vx * col.normal.x + this.state.ball.velocity.vy * col.normal.y;
        this.state.ball.velocity.vx -= (1 + PP_BALL_WALL_RESTITUTION) * dot * col.normal.x;
        this.state.ball.velocity.vy -= (1 + PP_BALL_WALL_RESTITUTION) * dot * col.normal.y;
      }
    }

    // Ball canvas bounds
    const b = this.state.ball;
    if (b.position.x - b.radius < 0) {
      b.position.x = b.radius;
      b.velocity.vx = Math.abs(b.velocity.vx) * PP_BALL_WALL_RESTITUTION;
    }
    if (b.position.x + b.radius > PP_CANVAS_WIDTH) {
      b.position.x = PP_CANVAS_WIDTH - b.radius;
      b.velocity.vx = -Math.abs(b.velocity.vx) * PP_BALL_WALL_RESTITUTION;
    }
    if (b.position.y - b.radius < 0) {
      b.position.y = b.radius;
      b.velocity.vy = Math.abs(b.velocity.vy) * PP_BALL_WALL_RESTITUTION;
    }
    if (b.position.y + b.radius > PP_CANVAS_HEIGHT) {
      b.position.y = PP_CANVAS_HEIGHT - b.radius;
      b.velocity.vy = -Math.abs(b.velocity.vy) * PP_BALL_WALL_RESTITUTION;
    }

    // Step 6: Ball-waypoint check
    if (this.state.nextWaypointIndex < this.state.waypoints.length) {
      const wp = this.state.waypoints[this.state.nextWaypointIndex];
      const dx = b.position.x - wp.x;
      const dy = b.position.y - wp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PP_WAYPOINT_RADIUS) {
        wp.reached = true;
        // Award waypoint points to all
        for (const userId of this.state.playerScores.keys()) {
          this.addScore(userId, PP_WAYPOINT_POINTS);
        }
        this.state.nextWaypointIndex++;

        this.logAction('waypoint_hit', {
          userId: this.state.lastBallTouchUserId ?? 'unknown',
          waypointId: `wp_${wp.order}`,
          elapsed: Date.now() - this.state.levelStartedAt,
        });

        const nextWp = this.state.waypoints[this.state.nextWaypointIndex];
        this.context.broadcastAction({
          type: 'PP_WAYPOINT_REACHED',
          payload: {
            waypointOrder: wp.order,
            nextWaypointOrder: nextWp?.order ?? null,
          },
        });
      }
    }

    // Step 7: Goal zone check
    const allWaypointsReached = this.state.nextWaypointIndex >= this.state.waypoints.length;
    if (allWaypointsReached && pointInAABB(b.position, this.state.goalZone)) {
      this.endLevel('GOAL');
      return;
    }

    // Step 8: Polarity flip timer
    if (enablePolarity) {
      this.handlePolarityFlip();
    }

    // Step 9: Disconnected player ghost transition
    const now = Date.now();
    for (const [, pusher] of this.state.pushers) {
      if (
        pusher.isDisconnected &&
        pusher.disconnectedAt &&
        now - pusher.disconnectedAt > PP_DISCONNECT_GHOST_DELAY_MS &&
        !pusher.isGhost
      ) {
        pusher.isGhost = true;
        // If this was the polarity target, reassign
        if (this.state.polarityFlippedUserId === pusher.userId) {
          pusher.polarity = 'push';
          this.state.polarityFlippedUserId = null;
        }
      }
    }
  }

  private handlePolarityFlip(): void {
    const now = Date.now();
    const polarityInterval = this.getSetting('polarityInterval', PP_POLARITY_INTERVAL_SECONDS);

    // Warning phase
    if (
      now >= this.state.nextPolarityFlipAt - PP_POLARITY_WARNING_SECONDS * 1000 &&
      !this.state.polarityWarningEmitted
    ) {
      const target = this.selectPolarityTarget();
      if (target) {
        const player = this.context.players.get(target);
        this.context.broadcastAction({
          type: 'PP_POLARITY_WARNING',
          payload: {
            targetUserId: target,
            targetUserName: player?.userName ?? 'Unknown',
            secondsUntilFlip: PP_POLARITY_WARNING_SECONDS,
          },
        });
      }
      this.state.polarityWarningEmitted = true;
    }

    // Flip
    if (now >= this.state.nextPolarityFlipAt) {
      // Restore previous
      if (this.state.polarityFlippedUserId) {
        const prev = this.state.pushers.get(this.state.polarityFlippedUserId);
        if (prev) {
          prev.polarity = 'push';
          const prevPlayer = this.context.players.get(prev.userId);

          // Simple polarity control evaluation
          const handled = this.state.polarityFlipsHandled.get(prev.userId) ?? 0;
          this.state.polarityFlipsHandled.set(prev.userId, handled + 1);
          this.addScore(prev.userId, PP_POLARITY_CONTROL_BONUS);

          this.context.broadcastAction({
            type: 'PP_POLARITY_RESTORE',
            payload: {
              userId: prev.userId,
              userName: prevPlayer?.userName ?? 'Unknown',
            },
          });
        }
      }

      // Select new target
      const newTarget = this.selectPolarityTarget();
      if (newTarget) {
        const newPusher = this.state.pushers.get(newTarget);
        if (newPusher) {
          newPusher.polarity = 'attract';
          this.state.polarityFlippedUserId = newTarget;

          const newPlayer = this.context.players.get(newTarget);

          this.logAction('polarity_flip', {
            targetUserId: newTarget,
            flippedBy: 'server',
            newPolarity: 'attract',
            elapsed: Date.now() - this.state.levelStartedAt,
          });

          this.context.broadcastAction({
            type: 'PP_POLARITY_FLIP',
            payload: {
              userId: newTarget,
              userName: newPlayer?.userName ?? 'Unknown',
              newPolarity: 'attract',
            },
          });
        }
      }

      this.state.nextPolarityFlipAt = now + polarityInterval * 1000;
      this.state.polarityWarningEmitted = false;
    }
  }

  private selectPolarityTarget(): string | null {
    const eligible = Array.from(this.state.pushers.values()).filter(
      (p) => !p.isGhost && !p.isDisconnected && p.userId !== this.state.polarityFlippedUserId,
    );
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)].userId;
  }

  // ─── State Broadcasting ──────────────────────────────────────

  private broadcastState(): void {
    if (this.state.phase !== 'ACTIVE') return;

    this.context.broadcastAction({
      type: 'PP_STATE_UPDATE',
      payload: {
        ball: {
          x: this.state.ball.position.x,
          y: this.state.ball.position.y,
          vx: this.state.ball.velocity.vx,
          vy: this.state.ball.velocity.vy,
        },
        pushers: Array.from(this.state.pushers.values()).map((p) => ({
          userId: p.userId,
          x: p.position.x,
          y: p.position.y,
          polarity: p.polarity,
          isGhost: p.isGhost,
        })),
      },
    });
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (action !== 'PP_MOVE') return;
    if (this.state.phase !== 'ACTIVE') return;

    // Rate limit
    if (!this.rateLimiter.allow(userId, PP_MOVE_INPUT_RATE)) return;

    // Validate
    const result = PPMoveSchema.safeParse(data);
    if (!result.success) return;

    const pusher = this.state.pushers.get(userId);
    if (!pusher || pusher.isGhost || pusher.isDisconnected) return;

    const { dx, dy } = result.data;
    if (dx === 0 && dy === 0) {
      pusher.moveDirection = null;
    } else {
      pusher.moveDirection = { x: dx, y: dy };
    }
  }

  // ─── State for Player/Spectator ──────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const scores = this.getScoresArray();

    switch (this.state.phase) {
      case 'LEVEL_PREVIEW':
        return {
          phase: 'LEVEL_PREVIEW',
          level: this.state.currentLevel,
          levelName: this.state.currentLevelData?.name ?? '',
          layout: {
            walls: this.state.walls,
            goalZone: this.state.goalZone,
            waypoints: this.state.waypoints.map((w) => ({ x: w.x, y: w.y, order: w.order })),
            ballStart: this.state.currentLevelData?.ballStart ?? { x: 0, y: 0 },
            playerStartPositions: this.state.currentLevelData?.playerStartPositions ?? [],
          },
          timeRemaining: PP_LEVEL_PREVIEW_SECONDS,
          scores,
        };

      case 'ACTIVE':
        return {
          phase: 'ACTIVE',
          level: this.state.currentLevel,
          ball: { x: this.state.ball.position.x, y: this.state.ball.position.y },
          pushers: Array.from(this.state.pushers.values()).map((p) => {
            const player = this.context.players.get(p.userId);
            return {
              userId: p.userId,
              userName: player?.userName ?? 'Unknown',
              x: p.position.x,
              y: p.position.y,
              color: p.color,
              polarity: p.polarity,
              isGhost: p.isGhost,
            };
          }),
          waypoints: this.state.waypoints.map((w) => ({
            x: w.x, y: w.y, order: w.order, reached: w.reached,
          })),
          goalZone: this.state.goalZone,
          walls: this.state.walls,
          timeRemaining: Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000)),
          myUserId: userId,
          scores,
          // Push counts HIDDEN during active phase (per spec §3.6)
        };

      case 'LEVEL_COMPLETE':
        return {
          phase: 'LEVEL_COMPLETE',
          level: this.state.currentLevel,
          timeMs: this.state.levelCompletionTimes[this.state.levelCompletionTimes.length - 1] ?? 0,
          waypointsReached: this.state.waypoints.filter((w) => w.reached).length,
          totalWaypoints: this.state.waypoints.length,
          scores,
        };

      case 'GAME_OVER':
        return {
          phase: 'GAME_OVER',
          finalRankings: this.buildFinalRankings(),
          levelsCompleted: this.state.levelCompletionTimes.length,
          totalPushes: this.getTotalPushes(),
          scores,
        };

      default:
        return { phase: this.state.phase };
    }
  }

  getStateForSpectator(): unknown {
    const playerState = this.getStateForPlayer('spectator');
    if (this.state.phase === 'ACTIVE') {
      // Spectators can see push counts
      const spectatorState = playerState as Record<string, unknown>;
      const pushers = spectatorState.pushers as Array<Record<string, unknown>>;
      return {
        ...spectatorState,
        pushers: pushers.map((p) => {
          const pusher = this.state.pushers.get(p.userId as string);
          return { ...p, pushCount: pusher?.pushCount ?? 0 };
        }),
      };
    }
    return playerState;
  }

  // ─── Join-in-Progress ────────────────────────────────────────

  handlePlayerJoin(userId: string): void {
    if (this.state.pushers.has(userId)) return;

    // Initialize score
    if (!this.state.playerScores.has(userId)) {
      this.state.playerScores.set(userId, 0);
      this.state.polarityFlipsHandled.set(userId, 0);
      this.state.wallProximityTime.set(userId, 0);
    }

    // Find a valid spawn position
    const levelData = this.state.currentLevelData;
    const existingPositions = Array.from(this.state.pushers.values()).map((p) => p.position);
    let spawnPos = { x: PP_CANVAS_WIDTH / 2, y: PP_CANVAS_HEIGHT / 2 };

    if (levelData) {
      for (const pos of levelData.playerStartPositions) {
        const isOccupied = existingPositions.some(
          (ep) => Math.abs(ep.x - pos.x) < PP_PUSHER_RADIUS * 2 && Math.abs(ep.y - pos.y) < PP_PUSHER_RADIUS * 2,
        );
        if (!isOccupied) {
          spawnPos = { ...pos };
          break;
        }
      }
    }

    const colorIndex = this.state.pushers.size % PP_PUSHER_COLORS.length;
    this.state.pushers.set(userId, {
      userId,
      position: spawnPos,
      color: PP_PUSHER_COLORS[colorIndex],
      polarity: 'push',
      moveDirection: null,
      pushCount: 0,
      isDisconnected: false,
      disconnectedAt: null,
      isGhost: false,
    });

    // Send full state
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));

    logger.info({
      event: 'pixel_pushers:player_join',
      lobbyId: this.context.lobbyId,
      userId,
    });
  }

  handlePlayerDisconnect(userId: string): void {
    const pusher = this.state.pushers.get(userId);
    if (!pusher) return;

    pusher.isDisconnected = true;
    pusher.disconnectedAt = Date.now();
    pusher.moveDirection = null;

    logger.info({
      event: 'pixel_pushers:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
    });
  }

  handlePlayerReconnect(userId: string): void {
    const pusher = this.state.pushers.get(userId);
    if (pusher) {
      pusher.isDisconnected = false;
      pusher.disconnectedAt = null;
      pusher.isGhost = false;
    }

    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));

    logger.info({
      event: 'pixel_pushers:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
    });
  }

  // ─── Results ─────────────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.buildPlayerRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        levelsCompleted: this.state.levelCompletionTimes.length,
        totalLevels: this.state.totalLevels,
        totalPushes: this.getTotalPushes(),
        levelCompletionTimes: this.state.levelCompletionTimes,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private buildPlayerRankings(): PlayerRanking[] {
    const entries = Array.from(this.state.playerScores.entries())
      .map(([userId, score]) => {
        const player = this.context.players.get(userId);
        return {
          userId,
          userName: player?.userName ?? 'Unknown',
          score,
          rank: 0,
          deltas: {} as Record<string, number>,
        };
      })
      .sort((a, b) => b.score - a.score);

    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  private buildFinalRankings(): PPFinalRanking[] {
    return Array.from(this.state.playerScores.entries())
      .map(([userId, score]) => {
        const player = this.context.players.get(userId);
        const pusher = this.state.pushers.get(userId);
        return {
          userId,
          userName: player?.userName ?? 'Unknown',
          rank: 0,
          totalScore: score,
          totalPushes: pusher?.pushCount ?? 0,
          polarityFlipsHandled: this.state.polarityFlipsHandled.get(userId) ?? 0,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const pushers = Array.from(this.state.pushers.entries());

    // Heavy Hitter — most ball pushes
    let maxPushes = 0;
    let heavyHitter: string | null = null;
    for (const [userId, p] of pushers) {
      if (p.pushCount > maxPushes) {
        maxPushes = p.pushCount;
        heavyHitter = userId;
      }
    }
    if (heavyHitter) {
      const player = this.context.players.get(heavyHitter);
      awards.push({
        userId: heavyHitter,
        title: 'Heavy Hitter',
        description: `Most ball pushes (${maxPushes})`,
        icon: 'hand-metal',
      });
    }

    // Gravity Master — best polarity handling
    let maxFlips = 0;
    let gravityMaster: string | null = null;
    for (const [userId, count] of this.state.polarityFlipsHandled) {
      if (count > maxFlips) {
        maxFlips = count;
        gravityMaster = userId;
      }
    }
    if (gravityMaster && maxFlips > 0) {
      awards.push({
        userId: gravityMaster,
        title: 'Gravity Master',
        description: `Handled ${maxFlips} polarity flips`,
        icon: 'magnet',
      });
    }

    // Goal Scorer — last touch before goal
    if (this.state.lastBallTouchUserId) {
      awards.push({
        userId: this.state.lastBallTouchUserId,
        title: 'Goal Scorer',
        description: 'Last touch before the goal',
        icon: 'target',
      });
    }

    // Speed Demon — fastest level
    if (this.state.levelCompletionTimes.length > 0) {
      const fastestTime = Math.min(...this.state.levelCompletionTimes);
      // Award to MVP of that level (simplified: overall MVP)
      const mvp = this.getMvpUserId();
      if (mvp) {
        awards.push({
          userId: mvp,
          title: 'Speed Demon',
          description: `Fastest level: ${(fastestTime / 1000).toFixed(1)}s`,
          icon: 'zap',
        });
      }
    }

    // Wall Flower — most time near walls
    let maxWallTime = 0;
    let wallFlower: string | null = null;
    for (const [userId, time] of this.state.wallProximityTime) {
      if (time > maxWallTime) {
        maxWallTime = time;
        wallFlower = userId;
      }
    }
    if (wallFlower && maxWallTime > 0) {
      awards.push({
        userId: wallFlower,
        title: 'Wall Flower',
        description: 'Spent the most time hugging walls',
        icon: 'flower',
      });
    }

    return awards;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private stopSimulation(): void {
    if (this.state.simulationInterval) {
      clearInterval(this.state.simulationInterval);
      this.intervals = this.intervals.filter((i) => i !== this.state.simulationInterval);
      this.state.simulationInterval = null;
    }
    if (this.state.broadcastInterval) {
      clearInterval(this.state.broadcastInterval);
      this.intervals = this.intervals.filter((i) => i !== this.state.broadcastInterval);
      this.state.broadcastInterval = null;
    }
  }

  private addScore(userId: string, points: number): void {
    const current = this.state.playerScores.get(userId) ?? 0;
    this.state.playerScores.set(userId, current + points);
  }

  private getScoresArray(): Array<{ userId: string; userName: string; totalScore: number }> {
    return Array.from(this.state.playerScores.entries()).map(([userId, score]) => {
      const player = this.context.players.get(userId);
      return { userId, userName: player?.userName ?? 'Unknown', totalScore: score };
    });
  }

  private getTotalPushes(): number {
    let total = 0;
    for (const [, pusher] of this.state.pushers) {
      total += pusher.pushCount;
    }
    return total;
  }

  private getMvpUserId(): string | null {
    let maxPushes = 0;
    let mvp: string | null = null;
    for (const [userId, pusher] of this.state.pushers) {
      if (pusher.pushCount > maxPushes) {
        maxPushes = pusher.pushCount;
        mvp = userId;
      }
    }
    return mvp;
  }

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: this.state.actionSeq++,
      timestamp: Date.now(),
      type,
      payload,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    return {
      minigameId: 'pixel-pushers',
      version: 1,
      players: Array.from(this.context.players.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
      })),
      initialState: {
        levelSequence: this.state.levels.map((l) => l.id),
        totalLevels: this.state.totalLevels,
        playerCount: this.context.players.size,
        initialPolarity: Object.fromEntries(
          Array.from(this.state.pushers.entries()).map(([uid]) => [uid, 'positive']),
        ),
        gameSettings: this.context.gameSettings,
      },
      actions: this.state.actionLog,
      finalResults: this.buildFinalRankings().map((r) => ({
        userId: r.userId,
        userName: r.userName,
        score: r.totalScore,
        rank: r.rank,
      })),
    };
  }

  cleanup(): void {
    this.stopSimulation();
    super.cleanup();
  }
}
