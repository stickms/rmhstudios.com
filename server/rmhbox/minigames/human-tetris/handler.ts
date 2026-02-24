/**
 * RMHbox — Human Tetris Minigame Server Handler
 *
 * A cooperative spatial awareness game where players position their
 * avatars on a grid to match incoming wall shapes. Extra players must
 * hide in dead zones. The team must collectively fill all holes to
 * succeed each wave.
 *
 * Phases per wave:
 *   WALL_PREVIEW → POSITIONING → WALL_IMPACT → WAVE_RESULTS
 *     → (next wave or GAME_OVER)
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §4
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { HTMoveSchema } from '@/lib/rmhbox/human-tetris/schemas';
import {
  loadShapeTemplates,
  selectShapeForWave,
  buildWallShape,
} from '@/lib/rmhbox/human-tetris/data-loader';
import {
  HT_TOTAL_WAVES,
  HT_GRID_COLS,
  HT_GRID_ROWS,
  HT_EASY_POSITION_SECONDS,
  HT_MEDIUM_POSITION_SECONDS,
  HT_HARD_POSITION_SECONDS,
  HT_WALL_PREVIEW_SECONDS,
  HT_WALL_IMPACT_SECONDS,
  HT_WAVE_RESULTS_SECONDS,
  HT_MOVE_RATE_LIMIT,
  HT_SUCCESS_POINTS,
  HT_PARTIAL_POINTS,
  HT_CORRECT_POSITION_POINTS,
  HT_HIT_PENALTY,
  HT_PERFECT_WAVE_BONUS,
  HT_STREAK_BONUS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  HTPhase,
  GridPosition,
  WallShape,
  WallShapeView,
  WaveResult,
  WallImpactResult,
  PlayerImpactResult,
  HTFinalRanking,
  ShapeTemplate,
  HumanTetrisState,
} from './types';

// ─── Human Tetris Minigame ───────────────────────────────────────

export class HumanTetrisGame extends BaseMinigame {
  private state!: HumanTetrisState;
  private startedAt: number = 0;
  /** Cached shape templates loaded from data file. */
  private templates: ShapeTemplate[] = [];
  /** Set of shape IDs already used in this game. */
  private usedShapeIds: Set<string> = new Set();

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.startedAt = Date.now();
    this.isRunning = true;

    // Load shape templates
    this.templates = loadShapeTemplates();

    const playerIds = Array.from(this.context.players.keys());

    // Initialize state
    this.state = {
      currentWave: 0,
      totalWaves: this.getSetting('totalWaves', HT_TOTAL_WAVES),
      phase: 'WALL_PREVIEW',
      gridCols: HT_GRID_COLS,
      gridRows: HT_GRID_ROWS,
      currentWall: null,
      playerPositions: new Map(),
      waveResults: [],
      consecutiveSuccesses: 0,
      playerScores: new Map(),
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now(),
      lastMoveTimestamps: new Map(),
      correctPositionCounts: new Map(),
      wallHitCounts: new Map(),
      deadZoneHideCounts: new Map(),
      timeRemainingAccum: new Map(),
      actionLog: [],
    };

    // Initialize per-player tracking & random starting positions
    const usedPositions = new Set<string>();
    for (const id of playerIds) {
      this.state.playerScores.set(id, 0);
      this.state.lastMoveTimestamps.set(id, []);
      this.state.correctPositionCounts.set(id, 0);
      this.state.wallHitCounts.set(id, 0);
      this.state.deadZoneHideCounts.set(id, 0);
      this.state.timeRemainingAccum.set(id, []);

      // Assign random non-overlapping starting position
      let pos: GridPosition;
      do {
        pos = {
          col: Math.floor(Math.random() * HT_GRID_COLS),
          row: Math.floor(Math.random() * HT_GRID_ROWS),
        };
      } while (usedPositions.has(`${pos.col},${pos.row}`));
      usedPositions.add(`${pos.col},${pos.row}`);
      this.state.playerPositions.set(id, pos);
    }

    logger.info({
      event: 'human_tetris_start',
      roomId: this.context.lobbyId,
      playerCount: playerIds.length,
      totalWaves: this.state.totalWaves,
    });

    this.startNextWave();
  }

  // ─── Wave Lifecycle ──────────────────────────────────────────

  private startNextWave(): void {
    this.state.currentWave++;

    if (this.state.currentWave > this.state.totalWaves) {
      this.endGame();
      return;
    }

    // Select shape for this wave
    const playerCount = this.context.players.size;
    const { template, requiredPlayers } = selectShapeForWave(
      this.state.currentWave,
      playerCount,
      this.templates,
      this.usedShapeIds,
    );
    this.usedShapeIds.add(template.id);

    // Build wall shape with dead zones
    const enableDeadZones = this.getSetting('enableDeadZones', false);
    const wall = buildWallShape(template, playerCount, requiredPlayers, enableDeadZones);
    this.state.currentWall = wall;

    this.setPhase('WALL_PREVIEW');

    // Compute wall cells for client rendering
    const wallView = this.buildWallView(wall);

    const wallPreviewDuration = this.getSetting(
      'wallPreviewDuration',
      HT_WALL_PREVIEW_SECONDS,
    );

    // Determine positioning time based on difficulty
    const positioningSeconds = this.getPositioningDuration();

    this.logAction('wave_start', {
      wave: this.state.currentWave,
      wallShape: wall.holes,
      requiredPlayers: wall.requiredPlayers,
      difficulty: wall.difficulty,
    });

    this.context.broadcastAction({
      type: 'HT_WAVE_START',
      payload: {
        waveNumber: this.state.currentWave,
        wall: wallView,
        positioningSeconds,
        deadZones: wall.deadZones,
        requiredPlayers: wall.requiredPlayers,
      },
    });

    this.broadcastRound(this.state.currentWave, this.state.totalWaves);

    this.setTimeout(() => {
      this.startPositioning();
    }, wallPreviewDuration * 1000);
  }

  private startPositioning(): void {
    if (!this.isRunning) return;

    const positioningSeconds = this.getPositioningDuration();
    const startingPositionTime = this.getSetting(
      'startingPositionTime',
      positioningSeconds,
    );

    this.setPhase('POSITIONING');
    this.startPhaseTimer(startingPositionTime);

    this.setTimeout(() => {
      if (this.state.phase === 'POSITIONING') {
        this.wallImpact();
      }
    }, startingPositionTime * 1000);
  }

  private wallImpact(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    this.setPhase('WALL_IMPACT');

    const wall = this.state.currentWall!;
    const playerResults: PlayerImpactResult[] = [];

    const holeSet = new Set(wall.holes.map((h) => `${h.col},${h.row}`));
    const deadZoneSet = new Set(wall.deadZones.map((d) => `${d.col},${d.row}`));
    const filledHoles = new Set<string>();

    // Check each player's position
    for (const [userId, pos] of this.state.playerPositions) {
      const key = `${pos.col},${pos.row}`;
      let status: 'IN_HOLE' | 'IN_DEAD_ZONE' | 'HIT_BY_WALL';

      if (holeSet.has(key) && !filledHoles.has(key)) {
        status = 'IN_HOLE';
        filledHoles.add(key);
      } else if (deadZoneSet.has(key)) {
        status = 'IN_DEAD_ZONE';
      } else {
        status = 'HIT_BY_WALL';
      }

      playerResults.push({
        userId,
        userName: this.getPlayerName(userId),
        position: { ...pos },
        status,
      });
    }

    const allHolesFilled = filledHoles.size >= wall.holes.length;
    const allPlayersSafe = playerResults.every(
      (r) => r.status === 'IN_HOLE' || r.status === 'IN_DEAD_ZONE',
    );
    const success = allHolesFilled && allPlayersSafe;

    const impactResult: WallImpactResult = {
      playerResults,
      allHolesFilled,
      allPlayersSafe,
      success,
    };

    this.context.broadcastAction({
      type: 'HT_WALL_IMPACT',
      payload: { results: impactResult },
    });

    this.logAction('wave_impact', {
      wave: this.state.currentWave,
      playerPositions: playerResults.map((r) => ({
        userId: r.userId,
        x: r.position.col,
        y: r.position.row,
      })),
      success,
      playersHit: playerResults
        .filter((r) => r.status === 'HIT_BY_WALL')
        .map((r) => r.userId),
    });

    this.setTimeout(() => {
      this.computeWaveScore(impactResult, wall);
    }, HT_WALL_IMPACT_SECONDS * 1000);
  }

  private computeWaveScore(
    impact: WallImpactResult,
    wall: WallShape,
  ): void {
    if (!this.isRunning) return;

    const filledCount = impact.playerResults.filter(
      (r) => r.status === 'IN_HOLE',
    ).length;
    const totalHoles = wall.holes.length;
    const hitPlayers = impact.playerResults.filter(
      (r) => r.status === 'HIT_BY_WALL',
    );
    const correctPlayers = impact.playerResults.filter(
      (r) => r.status === 'IN_HOLE' || r.status === 'IN_DEAD_ZONE',
    );

    // Calculate positioning time remaining
    const positioningSeconds = this.getPositioningDuration();
    const startingPositionTime = this.getSetting(
      'startingPositionTime',
      positioningSeconds,
    );
    const timeElapsed =
      (Date.now() - this.state.phaseStartedAt) / 1000;
    const timeRemaining = Math.max(0, startingPositionTime - timeElapsed);

    let waveTeamScore = 0;

    if (impact.success) {
      // Full success: all players get success points
      for (const [userId] of this.state.playerPositions) {
        const current = this.state.playerScores.get(userId) ?? 0;
        this.state.playerScores.set(userId, current + HT_SUCCESS_POINTS);
      }
      waveTeamScore += HT_SUCCESS_POINTS * this.context.players.size;

      // Perfect wave bonus (completed with ≥2s remaining)
      if (timeRemaining >= 2) {
        for (const [userId] of this.state.playerPositions) {
          const current = this.state.playerScores.get(userId) ?? 0;
          this.state.playerScores.set(userId, current + HT_PERFECT_WAVE_BONUS);
        }
        waveTeamScore += HT_PERFECT_WAVE_BONUS * this.context.players.size;
      }

      this.state.consecutiveSuccesses++;

      // Streak bonus at max consecutive
      if (this.state.consecutiveSuccesses >= this.state.totalWaves) {
        for (const [userId] of this.state.playerPositions) {
          const current = this.state.playerScores.get(userId) ?? 0;
          this.state.playerScores.set(userId, current + HT_STREAK_BONUS);
        }
        waveTeamScore += HT_STREAK_BONUS * this.context.players.size;
      }
    } else {
      // Partial/failure scoring
      this.state.consecutiveSuccesses = 0;

      // Players in correct position get individual points
      for (const pr of correctPlayers) {
        const current = this.state.playerScores.get(pr.userId) ?? 0;
        this.state.playerScores.set(
          pr.userId,
          current + HT_CORRECT_POSITION_POINTS,
        );
        waveTeamScore += HT_CORRECT_POSITION_POINTS;
      }

      // Partial points proportional to holes filled
      if (filledCount > 0) {
        const partialPoints = Math.round(
          HT_PARTIAL_POINTS * (filledCount / totalHoles),
        );
        for (const [userId] of this.state.playerPositions) {
          const current = this.state.playerScores.get(userId) ?? 0;
          this.state.playerScores.set(userId, current + partialPoints);
        }
        waveTeamScore += partialPoints * this.context.players.size;
      }

      // Hit penalty
      for (const pr of hitPlayers) {
        const current = this.state.playerScores.get(pr.userId) ?? 0;
        this.state.playerScores.set(pr.userId, current + HT_HIT_PENALTY);
      }
    }

    // Track per-player stats for awards
    for (const pr of impact.playerResults) {
      if (pr.status === 'IN_HOLE') {
        const count =
          this.state.correctPositionCounts.get(pr.userId) ?? 0;
        this.state.correctPositionCounts.set(pr.userId, count + 1);
      }
      if (pr.status === 'HIT_BY_WALL') {
        const count = this.state.wallHitCounts.get(pr.userId) ?? 0;
        this.state.wallHitCounts.set(pr.userId, count + 1);
      }
      if (pr.status === 'IN_DEAD_ZONE') {
        const count =
          this.state.deadZoneHideCounts.get(pr.userId) ?? 0;
        this.state.deadZoneHideCounts.set(pr.userId, count + 1);
      }
      // Track time remaining for speed award
      if (pr.status === 'IN_HOLE' || pr.status === 'IN_DEAD_ZONE') {
        const accum = this.state.timeRemainingAccum.get(pr.userId) ?? [];
        accum.push(timeRemaining);
        this.state.timeRemainingAccum.set(pr.userId, accum);
      }
    }

    // Build wave result
    const waveResult: WaveResult = {
      waveNumber: this.state.currentWave,
      success: impact.success,
      filledHoles: filledCount,
      totalHoles,
      playersInCorrectPosition: correctPlayers.map((p) => p.userId),
      playersHitByWall: hitPlayers.map((p) => p.userId),
      teamScore: waveTeamScore,
    };
    this.state.waveResults.push(waveResult);

    this.setPhase('WAVE_RESULTS');

    this.logAction('wave_result', {
      wave: this.state.currentWave,
      passed: impact.success,
      teamScore: waveTeamScore,
      streak: this.state.consecutiveSuccesses,
    });

    this.context.broadcastAction({
      type: 'HT_WAVE_RESULTS',
      payload: {
        waveNumber: this.state.currentWave,
        success: impact.success,
        filledHoles: filledCount,
        totalHoles,
        correctPlayers: correctPlayers.map((p) => p.userId),
        hitPlayers: hitPlayers.map((p) => p.userId),
        teamScore: waveTeamScore,
      },
    });

    this.setTimeout(() => {
      this.startNextWave();
    }, HT_WAVE_RESULTS_SECONDS * 1000);
  }

  // ─── Game End ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;

    this.setPhase('GAME_OVER');
    const results = this.computeResults();

    const perfectWaves = this.state.waveResults.filter(
      (w) => w.success,
    ).length;

    this.logAction('game_end', {
      wavesCompleted: this.state.currentWave - 1,
      totalWaves: this.state.totalWaves,
      finalScore: Array.from(this.state.playerScores.values()).reduce(
        (a, b) => a + b,
        0,
      ),
      perfectWaves,
      longestStreak: this.state.consecutiveSuccesses,
    });

    const finalRankings: HTFinalRanking[] = results.rankings.map(
      (r) => ({
        userId: r.userId,
        userName: r.userName,
        totalScore: r.score,
        correctPositions:
          this.state.correctPositionCounts.get(r.userId) ?? 0,
        timesHitByWall:
          this.state.wallHitCounts.get(r.userId) ?? 0,
        rank: r.rank,
      }),
    );

    this.context.broadcastAction({
      type: 'HT_GAME_OVER',
      payload: {
        finalRankings,
        wavesCompleted: this.state.currentWave - 1,
        perfectWaves,
      },
    });

    logger.info({
      event: 'human_tetris_end',
      roomId: this.context.lobbyId,
      duration: Date.now() - this.startedAt,
      perfectWaves,
    });

    this.context.onComplete(results);
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning) return;

    switch (action) {
      case 'HT_MOVE':
        this.handleMove(userId, data);
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

  private handleMove(userId: string, data: unknown): void {
    if (this.state.phase !== 'POSITIONING') return;

    const parsed = HTMoveSchema.safeParse(data);
    if (!parsed.success) return;

    // Rate limit: max HT_MOVE_RATE_LIMIT moves per second
    const now = Date.now();
    const timestamps = this.state.lastMoveTimestamps.get(userId) ?? [];
    const recent = timestamps.filter((t) => now - t < 1000);
    if (recent.length >= HT_MOVE_RATE_LIMIT) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HT_MOVE_REJECTED',
        payload: { reason: 'RATE_LIMITED' },
      });
      return;
    }
    recent.push(now);
    this.state.lastMoveTimestamps.set(userId, recent);

    // Compute new position
    const currentPos = this.state.playerPositions.get(userId);
    if (!currentPos) return;

    const newPos: GridPosition = { ...currentPos };
    switch (parsed.data.direction) {
      case 'up':
        newPos.row -= 1;
        break;
      case 'down':
        newPos.row += 1;
        break;
      case 'left':
        newPos.col -= 1;
        break;
      case 'right':
        newPos.col += 1;
        break;
    }

    // Validate bounds
    if (
      newPos.col < 0 ||
      newPos.col >= HT_GRID_COLS ||
      newPos.row < 0 ||
      newPos.row >= HT_GRID_ROWS
    ) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HT_MOVE_REJECTED',
        payload: { reason: 'OUT_OF_BOUNDS' },
      });
      return;
    }

    // Check collision (dead zones allow multiple occupants)
    const newKey = `${newPos.col},${newPos.row}`;
    const isDeadZone = this.state.currentWall?.deadZones.some(
      (d) => `${d.col},${d.row}` === newKey,
    );

    if (!isDeadZone) {
      // Check if cell is occupied by another player
      for (const [otherId, otherPos] of this.state.playerPositions) {
        if (
          otherId !== userId &&
          otherPos.col === newPos.col &&
          otherPos.row === newPos.row
        ) {
          this.context.sendToPlayer(userId, 'rmhbox:game:action', {
            type: 'HT_MOVE_REJECTED',
            payload: { reason: 'CELL_OCCUPIED' },
          });
          return;
        }
      }
    }

    // Update position
    this.state.playerPositions.set(userId, newPos);

    this.context.broadcastAction({
      type: 'HT_PLAYER_MOVED',
      payload: {
        userId,
        userName: this.getPlayerName(userId),
        col: newPos.col,
        row: newPos.row,
      },
    });
  }

  // ─── State Views ─────────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const wall = this.state.currentWall;
    const wallView = wall ? this.buildWallView(wall) : null;
    const timeRemaining = Math.max(
      0,
      Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000),
    );

    const playerPositions = Array.from(
      this.state.playerPositions.entries(),
    ).map(([id, pos]) => ({
      userId: id,
      userName: this.getPlayerName(id),
      col: pos.col,
      row: pos.row,
      isMe: id === userId,
    }));

    const scores = Array.from(this.state.playerScores.entries()).map(
      ([id, score]) => ({
        userId: id,
        userName: this.getPlayerName(id),
        totalScore: score,
      }),
    );

    // Compute filled/unfilled holes
    const holeSet = new Set(
      wall?.holes.map((h) => `${h.col},${h.row}`) ?? [],
    );
    const occupiedHoles = new Set<string>();
    for (const [, pos] of this.state.playerPositions) {
      const key = `${pos.col},${pos.row}`;
      if (holeSet.has(key)) occupiedHoles.add(key);
    }

    const filledHoles = wall?.holes.filter((h) =>
      occupiedHoles.has(`${h.col},${h.row}`),
    ) ?? [];
    const unfilledHoles = wall?.holes.filter(
      (h) => !occupiedHoles.has(`${h.col},${h.row}`),
    ) ?? [];

    return {
      waveNumber: this.state.currentWave,
      totalWaves: this.state.totalWaves,
      phase: this.state.phase,
      gridCols: this.state.gridCols,
      gridRows: this.state.gridRows,
      wall: wallView,
      deadZones: wall?.deadZones ?? [],
      requiredPlayers: wall?.requiredPlayers ?? 0,
      timeRemaining,
      playerPositions,
      filledHoles,
      unfilledHoles,
      scores,
      consecutiveSuccesses: this.state.consecutiveSuccesses,
    };
  }

  getStateForSpectator(): unknown {
    // Cooperative game — spectators see the same as players
    return this.getStateForPlayer('__spectator__');
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
      deltas: { tetris: p.score },
    }));

    // Compute awards
    const awards: Award[] = [];

    // Perfect Team — all waves successful
    const allSuccess = this.state.waveResults.every((w) => w.success);
    if (allSuccess && this.state.waveResults.length > 0) {
      awards.push({
        userId: playerIds[0],
        title: 'Perfect Team',
        description: `All ${this.state.totalWaves} waves successful`,
        icon: 'trophy',
      });
    }

    // Dead Zone Expert — most dead zone hides
    let maxDZ = 0;
    let dzId = '';
    for (const [id, count] of this.state.deadZoneHideCounts) {
      if (count > maxDZ) {
        maxDZ = count;
        dzId = id;
      }
    }
    if (dzId && maxDZ > 0) {
      awards.push({
        userId: dzId,
        title: 'Dead Zone Expert',
        description: 'Successfully hid in dead zones the most times',
        icon: 'ghost',
      });
    }

    // Shape Filler — most correct positions
    let maxCorrect = 0;
    let fillerId = '';
    for (const [id, count] of this.state.correctPositionCounts) {
      if (count > maxCorrect) {
        maxCorrect = count;
        fillerId = id;
      }
    }
    if (fillerId && maxCorrect > 0) {
      awards.push({
        userId: fillerId,
        title: 'Shape Filler',
        description: 'Was in a hole cell correctly the most times',
        icon: 'puzzle',
      });
    }

    // Wall Magnet — most hits
    let maxHits = 0;
    let magnetId = '';
    for (const [id, count] of this.state.wallHitCounts) {
      if (count > maxHits) {
        maxHits = count;
        magnetId = id;
      }
    }
    if (magnetId && maxHits > 0) {
      awards.push({
        userId: magnetId,
        title: 'Wall Magnet',
        description: 'Got hit by the wall the most times',
        icon: 'zap',
      });
    }

    // Speed Mover — most time remaining (averaged)
    let bestAvgTime = 0;
    let speedId = '';
    for (const [id, times] of this.state.timeRemainingAccum) {
      if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        if (avg > bestAvgTime) {
          bestAvgTime = avg;
          speedId = id;
        }
      }
    }
    if (speedId && bestAvgTime > 0) {
      awards.push({
        userId: speedId,
        title: 'Speed Mover',
        description: 'Reached correct position with the most time remaining',
        icon: 'rabbit',
      });
    }

    return {
      rankings,
      awards,
      gameSpecificData: {
        totalWaves: this.state.totalWaves,
        waveResults: this.state.waveResults,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  // ─── Game Log ────────────────────────────────────────────────

  private buildGameLog(): Record<string, unknown> {
    return {
      minigameId: 'human-tetris',
      version: 1,
      players: Array.from(this.context.players.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
      })),
      initialState: {
        playerCount: this.context.players.size,
        arenaSize: { width: HT_GRID_COLS, height: HT_GRID_ROWS },
        totalWaves: this.state.totalWaves,
      },
      actions: this.state.actionLog,
      gameSettings: { ...this.context.gameSettings },
    };
  }

  // ─── Disconnect / Reconnect ──────────────────────────────────

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'player_disconnect',
      roomId: this.context.lobbyId,
      userId,
      game: 'human-tetris',
    });

    // Avatar stays frozen at last position
    // Force-end if below minimum players
    const connectedCount = Array.from(this.context.players.values()).filter(
      (p) => p.isConnected,
    ).length;
    if (connectedCount < 4) {
      logger.warn({
        event: 'force_end_insufficient_players',
        roomId: this.context.lobbyId,
        connectedCount,
      });
      this.forceEnd('insufficient_players');
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

  private setPhase(phase: HTPhase): void {
    this.state.phase = phase;
    this.state.phaseStartedAt = Date.now();
    const durations: Partial<Record<HTPhase, number>> = {
      WALL_PREVIEW: this.getSetting('wallPreviewDuration', HT_WALL_PREVIEW_SECONDS) * 1000,
      POSITIONING: this.getSetting('startingPositionTime', this.getPositioningDuration()) * 1000,
      WALL_IMPACT: HT_WALL_IMPACT_SECONDS * 1000,
      WAVE_RESULTS: HT_WAVE_RESULTS_SECONDS * 1000,
    };
    this.state.phaseEndsAt = Date.now() + (durations[phase] ?? 0);

    logger.debug({
      event: 'phase_change',
      roomId: this.context.lobbyId,
      phase,
      game: 'human-tetris',
    });
  }

  private getPositioningDuration(): number {
    const wave = this.state.currentWave;
    if (wave <= 3) return HT_EASY_POSITION_SECONDS;
    if (wave <= 6) return HT_MEDIUM_POSITION_SECONDS;
    return HT_HARD_POSITION_SECONDS;
  }

  private buildWallView(wall: WallShape): WallShapeView {
    const holeSet = new Set(wall.holes.map((h) => `${h.col},${h.row}`));
    const wallCells: GridPosition[] = [];

    for (let col = 0; col < HT_GRID_COLS; col++) {
      for (let row = 0; row < HT_GRID_ROWS; row++) {
        if (!holeSet.has(`${col},${row}`)) {
          wallCells.push({ col, row });
        }
      }
    }

    return { holes: [...wall.holes], wallCells };
  }

  private getPlayerName(userId: string): string {
    return this.context.players.get(userId)?.userName ?? 'Unknown';
  }

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: this.state.actionLog.length + 1,
      type,
      timestamp: Date.now(),
      payload,
    });
  }
}
