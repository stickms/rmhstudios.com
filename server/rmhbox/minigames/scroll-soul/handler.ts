/**
 * RMHbox — Scroll Soul Minigame Server Handler
 *
 * Vertical scrolling survival game where players must stay on
 * procedurally generated platforms as the viewport auto-scrolls
 * upward. Features fake ad popups that apply disruptive effects
 * when players click the wrong close button.
 *
 * Phases: COUNTDOWN → ACTIVE → GAME_OVER
 *
 * Join-in-progress policy: spectate_only — elimination-based game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §4
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { SCInputSchema, SCCloseAdSchema } from '@/lib/rmhbox/scroll-soul/schemas';
import {
  SC_CANVAS_WIDTH, SC_CANVAS_HEIGHT, SC_PLAYER_WIDTH, SC_PLAYER_HEIGHT,
  SC_GRAVITY, SC_JUMP_VELOCITY, SC_MOVE_SPEED, SC_MAX_FALL_SPEED,
  SC_SCROLL_SPEED_INITIAL, SC_SCROLL_SPEED_INCREMENT, SC_SCROLL_SPEED_MAX,
  SC_LAVA_HEIGHT,
  SC_SAFE_ZONE_MIN_WIDTH, SC_SAFE_ZONE_MAX_WIDTH, SC_SAFE_ZONE_HEIGHT,
  SC_SAFE_ZONE_VERTICAL_GAP_MIN, SC_SAFE_ZONE_VERTICAL_GAP_MAX,
  SC_SAFE_ZONE_HORIZONTAL_PADDING,
  SC_MOVING_PLATFORM_SPEED, SC_SHRINKING_PLATFORM_RATE,
  SC_AD_SPAWN_INTERVAL_MIN, SC_AD_SPAWN_INTERVAL_MAX,
  SC_AD_DURATION_SECONDS, SC_AD_EFFECT_DURATION_SECONDS,
  SC_AD_PUSH_FORCE, SC_AD_SLOW_MULTIPLIER, SC_AD_INVERT_MULTIPLIER,
  SC_SIMULATION_TICK_MS, SC_STATE_BROADCAST_RATE,
  SC_ELIMINATION_POINTS_BASE, SC_SURVIVAL_BONUS_PER_SECOND,
  SC_AD_DISMISS_BONUS, SC_LAST_SURVIVOR_BONUS,
  SC_GENERATION_LOOKAHEAD, SC_GENERATION_CULL_BEHIND,
  SC_PLAYER_COLORS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  FAKE_AD_TEMPLATES,
  type SCPhase, type AdEffect, type SCPlayerState, type FakeAd,
  type Platform, type SCFinalRanking, type ScrollSoulState,
} from './types';

// ─── Rate Limiter ────────────────────────────────────────────────

class InputRateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  allow(userId: string, maxPerSecond: number): boolean {
    const now = Date.now();
    let times = this.timestamps.get(userId);
    if (!times) {
      times = [];
      this.timestamps.set(userId, times);
    }
    while (times.length > 0 && times[0] < now - 1000) {
      times.shift();
    }
    if (times.length >= maxPerSecond) return false;
    times.push(now);
    return true;
  }
}

// ─── Scroll Soul Minigame ────────────────────────────────────────

export class ScrollSoulMinigame extends BaseMinigame {
  private state!: ScrollSoulState;
  private rateLimiter = new InputRateLimiter();
  private startedAt = 0;

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    logger.info({
      event: 'scroll_soul:start',
      lobbyId: this.context.lobbyId,
      playerCount: this.context.players.size,
    });

    this.state = {
      phase: 'COUNTDOWN',
      players: new Map(),
      platforms: [],
      activeAds: new Map(),
      viewportY: 0,
      scrollSpeed: this.getSetting('baseScrollSpeed', SC_SCROLL_SPEED_INITIAL),
      gameStartedAt: 0,
      elapsedMs: 0,
      generationY: 0,
      platformIdCounter: 0,
      adIdCounter: 0,
      nextAdSpawnAt: 0,
      alivePlayers: this.context.players.size,
      eliminationOrder: [],
      simulationInterval: null,
      broadcastInterval: null,
      scrollSpeedInterval: null,
      actionLog: [],
      actionSeq: 0,
      lastSpeedMilestone: 0,
      adPushDirections: new Map(),
    };

    // Generate starting ground platform
    this.state.platforms.push({
      id: `plat_${this.state.platformIdCounter++}`,
      x: 0,
      y: -SC_SAFE_ZONE_HEIGHT, // Just below y=0
      width: SC_CANVAS_WIDTH,
      height: SC_SAFE_ZONE_HEIGHT,
      type: 'static',
    });

    // Generate initial platforms above
    this.state.generationY = -SC_SAFE_ZONE_HEIGHT - SC_SAFE_ZONE_VERTICAL_GAP_MIN;
    this.generatePlatforms();

    // Initialize players at ground level
    let i = 0;
    const spacing = SC_CANVAS_WIDTH / (this.context.players.size + 1);
    for (const [userId] of this.context.players) {
      this.state.players.set(userId, {
        userId,
        position: { x: spacing * (i + 1) - SC_PLAYER_WIDTH / 2, y: -SC_PLAYER_HEIGHT - SC_SAFE_ZONE_HEIGHT },
        velocity: { vx: 0, vy: 0 },
        color: SC_PLAYER_COLORS[i % SC_PLAYER_COLORS.length],
        isGrounded: true,
        isAlive: true,
        eliminatedAt: null,
        survivalTimeMs: 0,
        moveInput: null,
        activeEffect: null,
        effectExpiresAt: null,
        adsCorrectlyDismissed: 0,
        adsFailed: 0,
        score: 0,
        eliminationRank: null,
        minLavaDistance: Infinity,
        highestY: 0,
      });
      i++;
    }

    // Start countdown
    this.startPhaseTimer(3);
    this.setTimeout(() => this.startActive(), 3000);
  }

  // ─── Procedural Generation ───────────────────────────────────

  private generatePlatforms(): void {
    const targetY = this.state.viewportY - SC_CANVAS_HEIGHT - SC_GENERATION_LOOKAHEAD;

    while (this.state.generationY > targetY) {
      const tierY = this.state.generationY;
      const elapsedSec = this.state.elapsedMs / 1000;

      // Platform count per tier: 1-3
      const platCount = 1 + Math.floor(Math.random() * 3);

      // Platform type distribution based on elapsed time
      const getType = (): 'static' | 'moving' | 'shrinking' => {
        const roll = Math.random();
        if (elapsedSec < 30) {
          if (roll < 0.80) return 'static';
          if (roll < 0.95) return 'moving';
          return 'shrinking';
        } else if (elapsedSec < 60) {
          if (roll < 0.50) return 'static';
          if (roll < 0.80) return 'moving';
          return 'shrinking';
        } else {
          if (roll < 0.30) return 'static';
          if (roll < 0.65) return 'moving';
          return 'shrinking';
        }
      };

      const tierPlatforms: Platform[] = [];

      for (let p = 0; p < platCount; p++) {
        const width = SC_SAFE_ZONE_MIN_WIDTH + Math.random() * (SC_SAFE_ZONE_MAX_WIDTH - SC_SAFE_ZONE_MIN_WIDTH);
        const maxX = SC_CANVAS_WIDTH - width - SC_SAFE_ZONE_HORIZONTAL_PADDING;
        let x = SC_SAFE_ZONE_HORIZONTAL_PADDING + Math.random() * Math.max(0, maxX - SC_SAFE_ZONE_HORIZONTAL_PADDING);

        // Avoid overlap with other platforms in this tier
        let attempts = 0;
        while (attempts < 5) {
          const overlapping = tierPlatforms.some(
            (tp) => x < tp.x + tp.width + 5 && x + width > tp.x - 5,
          );
          if (!overlapping) break;
          x = SC_SAFE_ZONE_HORIZONTAL_PADDING + Math.random() * Math.max(0, maxX - SC_SAFE_ZONE_HORIZONTAL_PADDING);
          attempts++;
        }

        const type = getType();
        const plat: Platform = {
          id: `plat_${this.state.platformIdCounter++}`,
          x,
          y: tierY,
          width,
          height: SC_SAFE_ZONE_HEIGHT,
          type,
        };

        if (type === 'moving') {
          plat.moveRangeMin = SC_SAFE_ZONE_HORIZONTAL_PADDING;
          plat.moveRangeMax = SC_CANVAS_WIDTH - SC_SAFE_ZONE_HORIZONTAL_PADDING;
          plat.moveDirection = Math.random() < 0.5 ? 1 : -1;
        }

        if (type === 'shrinking') {
          plat.originalWidth = width;
          plat.shrinkStartedAt = null as unknown as number; // Set when entering viewport
        }

        tierPlatforms.push(plat);
      }

      this.state.platforms.push(...tierPlatforms);

      // Advance to next tier
      const gap = SC_SAFE_ZONE_VERTICAL_GAP_MIN +
        Math.random() * (SC_SAFE_ZONE_VERTICAL_GAP_MAX - SC_SAFE_ZONE_VERTICAL_GAP_MIN);
      this.state.generationY -= gap;
    }

    // Cull old platforms
    this.state.platforms = this.state.platforms.filter(
      (p) => p.y < this.state.viewportY + SC_GENERATION_CULL_BEHIND,
    );
  }

  // ─── Active Phase ────────────────────────────────────────────

  private startActive(): void {
    if (!this.isRunning) return;

    this.state.phase = 'ACTIVE';
    this.state.gameStartedAt = Date.now();

    // Set ad spawn timer
    this.state.nextAdSpawnAt = Date.now() +
      (SC_AD_SPAWN_INTERVAL_MIN + Math.random() * (SC_AD_SPAWN_INTERVAL_MAX - SC_AD_SPAWN_INTERVAL_MIN)) * 1000;

    // Start simulation loop
    this.state.simulationInterval = this.setInterval(() => this.simulationTick(), SC_SIMULATION_TICK_MS);

    // Start broadcast loop
    this.state.broadcastInterval = this.setInterval(
      () => this.broadcastState(),
      Math.round(1000 / SC_STATE_BROADCAST_RATE),
    );

    // Start scroll speed incrementer
    this.state.scrollSpeedInterval = this.setInterval(() => {
      const maxSpeed = this.getSetting('maxScrollSpeed', SC_SCROLL_SPEED_MAX);
      this.state.scrollSpeed = Math.min(
        this.state.scrollSpeed + SC_SCROLL_SPEED_INCREMENT,
        maxSpeed,
      );

      // Speed milestones (every 0.5 speed units)
      const milestone = Math.floor(this.state.scrollSpeed * 2) / 2;
      if (milestone > this.state.lastSpeedMilestone) {
        this.state.lastSpeedMilestone = milestone;
        this.logAction('speed_milestone', {
          newSpeed: this.state.scrollSpeed,
          elapsed: this.state.elapsedMs,
          playersRemaining: this.state.alivePlayers,
        });
      }
    }, 1000);

    logger.info({
      event: 'scroll_soul:active',
      lobbyId: this.context.lobbyId,
    });
  }

  // ─── Physics Simulation ──────────────────────────────────────

  private simulationTick(): void {
    if (this.state.phase !== 'ACTIVE') return;

    const now = Date.now();
    this.state.elapsedMs = now - this.state.gameStartedAt;

    // Step 1: Update viewport (scroll upward = viewport Y decreases)
    this.state.viewportY -= this.state.scrollSpeed;

    // Step 2: Generate platforms if needed
    this.generatePlatforms();

    // Step 3: Update moving platforms
    for (const plat of this.state.platforms) {
      if (plat.type === 'moving' && plat.moveRangeMin !== undefined && plat.moveRangeMax !== undefined) {
        plat.x += SC_MOVING_PLATFORM_SPEED * (plat.moveDirection ?? 1);
        if (plat.x <= plat.moveRangeMin || plat.x + plat.width >= plat.moveRangeMax) {
          plat.moveDirection = ((plat.moveDirection ?? 1) * -1) as 1 | -1;
        }
      }
    }

    // Step 4: Update shrinking platforms
    for (let i = this.state.platforms.length - 1; i >= 0; i--) {
      const plat = this.state.platforms[i];
      if (plat.type !== 'shrinking') continue;

      // Set shrink start when platform enters viewport
      if (!plat.shrinkStartedAt && plat.y > this.state.viewportY - SC_CANVAS_HEIGHT) {
        plat.shrinkStartedAt = now;
      }

      if (plat.shrinkStartedAt && plat.originalWidth) {
        const timeShrinking = (now - plat.shrinkStartedAt) / 1000;
        const shrunkAmount = timeShrinking * SC_SHRINKING_PLATFORM_RATE;
        const newWidth = plat.originalWidth - shrunkAmount * 2;

        if (newWidth <= 0) {
          this.state.platforms.splice(i, 1);
          continue;
        }

        const centerX = plat.x + plat.width / 2;
        plat.width = newWidth;
        plat.x = centerX - newWidth / 2;
      }
    }

    // Step 5 & 6: Player physics and platform collisions
    for (const [, player] of this.state.players) {
      if (!player.isAlive) continue;

      // Apply input
      if (player.moveInput) {
        let effectiveSpeed = SC_MOVE_SPEED;
        if (player.activeEffect === 'slow') effectiveSpeed *= SC_AD_SLOW_MULTIPLIER;
        if (player.activeEffect === 'invert') effectiveSpeed *= SC_AD_INVERT_MULTIPLIER;

        player.velocity.vx = player.moveInput.dx * effectiveSpeed;

        if (player.moveInput.jump && player.isGrounded) {
          player.velocity.vy = SC_JUMP_VELOCITY;
          player.isGrounded = false;
          player.moveInput.jump = false; // Consume jump
        }
      }

      // Apply push effect
      if (player.activeEffect === 'push') {
        const pushDir = this.state.adPushDirections.get(player.userId) ?? 1;
        player.velocity.vx += SC_AD_PUSH_FORCE * pushDir;
      }

      // Apply gravity
      player.velocity.vy += SC_GRAVITY;
      player.velocity.vy = Math.min(player.velocity.vy, SC_MAX_FALL_SPEED);

      // Previous position for one-way platform detection
      const prevY = player.position.y;

      // Update position
      player.position.x += player.velocity.vx;
      player.position.y += player.velocity.vy;

      // Horizontal wrapping
      if (player.position.x + SC_PLAYER_WIDTH < 0) {
        player.position.x = SC_CANVAS_WIDTH;
      } else if (player.position.x > SC_CANVAS_WIDTH) {
        player.position.x = -SC_PLAYER_WIDTH;
      }

      // Platform collision resolution (one-way from above)
      player.isGrounded = false;
      for (const plat of this.state.platforms) {
        // Player bottom edge
        const playerBottom = player.position.y + SC_PLAYER_HEIGHT;
        const playerRight = player.position.x + SC_PLAYER_WIDTH;
        const prevBottom = prevY + SC_PLAYER_HEIGHT;

        // Check: was above platform, now overlapping (falling from above)
        if (
          prevBottom <= plat.y &&
          playerBottom >= plat.y &&
          playerRight > plat.x &&
          player.position.x < plat.x + plat.width
        ) {
          player.position.y = plat.y - SC_PLAYER_HEIGHT;
          player.velocity.vy = 0;
          player.isGrounded = true;

          // Ride moving platform
          if (plat.type === 'moving') {
            player.position.x += SC_MOVING_PLATFORM_SPEED * (plat.moveDirection ?? 1);
          }
          break;
        }
      }

      // Track highest Y (most negative = highest)
      if (player.position.y < player.highestY) {
        player.highestY = player.position.y;
      }

      // Step 7: Lava/elimination check
      const lavaY = this.state.viewportY; // Bottom of viewport (world Y increases downward)
      const distToLava = lavaY - (player.position.y + SC_PLAYER_HEIGHT);

      // Track min lava distance for award
      if (distToLava < player.minLavaDistance && distToLava > 0) {
        player.minLavaDistance = distToLava;
      }

      // Check if player is below viewport (in lava)
      if (player.position.y + SC_PLAYER_HEIGHT > this.state.viewportY) {
        this.eliminatePlayer(player);
      }

      // Also check if player is above viewport top (too high)
      if (player.position.y < this.state.viewportY - SC_CANVAS_HEIGHT - SC_LAVA_HEIGHT) {
        // Player is way above — not eliminated, will fall back
      }
    }

    // Step 8: Ad effect expiration
    for (const [, player] of this.state.players) {
      if (player.activeEffect && player.effectExpiresAt && now > player.effectExpiresAt) {
        player.activeEffect = null;
        player.effectExpiresAt = null;
      }
    }

    // Step 9: Ad spawning
    const enableAds = this.getSetting('enableAds', true);
    if (enableAds && now >= this.state.nextAdSpawnAt && this.state.alivePlayers > 0) {
      this.spawnAd();
    }

    // Auto-dismiss expired ads
    for (const [adId, ad] of this.state.activeAds) {
      if (now > ad.expiresAt && !ad.dismissed) {
        ad.dismissed = true;
        this.state.activeAds.delete(adId);
        this.context.sendToPlayer(ad.targetUserId, 'rmhbox:game:action', {
          type: 'SC_AD_DISMISSED',
          payload: { adId, reason: 'expired' },
        });
      }
    }
  }

  private eliminatePlayer(player: SCPlayerState): void {
    if (!player.isAlive) return;

    player.isAlive = false;
    player.eliminatedAt = Date.now();
    player.survivalTimeMs = player.eliminatedAt - this.state.gameStartedAt;
    player.eliminationRank = this.state.alivePlayers; // Higher rank = eliminated later = better
    this.state.eliminationOrder.push(player.userId);
    this.state.alivePlayers--;

    // Score
    player.score = SC_ELIMINATION_POINTS_BASE +
      Math.floor((player.survivalTimeMs / 1000) * SC_SURVIVAL_BONUS_PER_SECOND) +
      player.adsCorrectlyDismissed * SC_AD_DISMISS_BONUS;

    const playerObj = this.context.players.get(player.userId);

    this.logAction('player_eliminated', {
      userId: player.userId,
      survivalTime: player.survivalTimeMs,
      cause: 'lava',
      scrollSpeedAtDeath: this.state.scrollSpeed,
      placement: player.eliminationRank,
    });

    this.context.broadcastAction({
      type: 'SC_PLAYER_ELIMINATED',
      payload: {
        userId: player.userId,
        userName: playerObj?.userName ?? 'Unknown',
        survivalTimeMs: player.survivalTimeMs,
        remainingPlayers: this.state.alivePlayers,
      },
    });

    logger.info({
      event: 'scroll_soul:player_eliminated',
      lobbyId: this.context.lobbyId,
      userId: player.userId,
      survivalTimeMs: player.survivalTimeMs,
      remainingPlayers: this.state.alivePlayers,
    });

    // Cancel any active ads for this player
    for (const [adId, ad] of this.state.activeAds) {
      if (ad.targetUserId === player.userId) {
        ad.dismissed = true;
        this.state.activeAds.delete(adId);
      }
    }

    // Check game over
    if (this.state.alivePlayers <= 1) {
      // Award last survivor bonus
      if (this.state.alivePlayers === 1) {
        for (const [, p] of this.state.players) {
          if (p.isAlive) {
            p.survivalTimeMs = Date.now() - this.state.gameStartedAt;
            p.score = SC_ELIMINATION_POINTS_BASE +
              Math.floor((p.survivalTimeMs / 1000) * SC_SURVIVAL_BONUS_PER_SECOND) +
              p.adsCorrectlyDismissed * SC_AD_DISMISS_BONUS +
              SC_LAST_SURVIVOR_BONUS;
            p.eliminationRank = this.context.players.size; // Best rank
            p.isAlive = false;
            p.eliminatedAt = Date.now();
          }
        }
      }
      this.endGame();
    }
  }

  // ─── Ad Spawning ─────────────────────────────────────────────

  private spawnAd(): void {
    const alivePlayers = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    if (alivePlayers.length === 0) return;

    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    const template = FAKE_AD_TEMPLATES[Math.floor(Math.random() * FAKE_AD_TEMPLATES.length)];
    const effects: AdEffect[] = ['obscure', 'push', 'slow', 'invert'];
    const effect = effects[Math.floor(Math.random() * effects.length)];

    // Real close button: small, random corner
    const corners = [
      { x: 5, y: 5 }, { x: 280, y: 5 }, { x: 5, y: 180 }, { x: 280, y: 180 },
    ];
    const realCorner = corners[Math.floor(Math.random() * corners.length)];
    const realCloseButton = { x: realCorner.x, y: realCorner.y, width: 12, height: 12 };

    // Fake close button: larger, centered-top (where users expect it)
    const fakeCloseButton = { x: 270, y: 8, width: 24, height: 24 };

    const adId = `ad_${this.state.adIdCounter++}`;
    const ad: FakeAd = {
      id: adId,
      template,
      targetUserId: target.userId,
      realCloseButton,
      fakeCloseButton,
      effect,
      spawnedAt: Date.now(),
      expiresAt: Date.now() + SC_AD_DURATION_SECONDS * 1000,
      dismissed: false,
    };

    this.state.activeAds.set(adId, ad);

    // Store push direction for this player if effect is 'push'
    if (effect === 'push') {
      this.state.adPushDirections.set(target.userId, Math.random() < 0.5 ? -1 : 1);
    }

    this.logAction('ad_spawned', {
      targetUserId: target.userId,
      adType: template.style,
      elapsed: this.state.elapsedMs,
    });

    // Send ad ONLY to targeted player
    this.context.sendToPlayer(target.userId, 'rmhbox:game:action', {
      type: 'SC_AD_SPAWN',
      payload: {
        adId,
        template: { headline: template.headline, body: template.body, style: template.style },
        realCloseButton,
        fakeCloseButton,
      },
    });

    // Schedule next ad
    this.state.nextAdSpawnAt = Date.now() +
      (SC_AD_SPAWN_INTERVAL_MIN + Math.random() * (SC_AD_SPAWN_INTERVAL_MAX - SC_AD_SPAWN_INTERVAL_MIN)) * 1000;
  }

  // ─── State Broadcasting ──────────────────────────────────────

  private broadcastState(): void {
    if (this.state.phase !== 'ACTIVE') return;

    // Only send platforms in viewport + buffer
    const viewBottom = this.state.viewportY;
    const viewTop = this.state.viewportY - SC_CANVAS_HEIGHT;
    const buffer = SC_GENERATION_LOOKAHEAD;

    const visiblePlatforms = this.state.platforms.filter(
      (p) => p.y > viewTop - buffer && p.y < viewBottom + buffer,
    );

    this.context.broadcastAction({
      type: 'SC_STATE_UPDATE',
      payload: {
        viewportY: this.state.viewportY,
        scrollSpeed: this.state.scrollSpeed,
        platforms: visiblePlatforms.map((p) => ({
          id: p.id, x: p.x, y: p.y, width: p.width, height: p.height, type: p.type,
        })),
        players: Array.from(this.state.players.values()).map((p) => ({
          userId: p.userId,
          x: p.position.x,
          y: p.position.y,
          isAlive: p.isAlive,
          isGrounded: p.isGrounded,
          activeEffect: p.activeEffect,
        })),
        lavaY: this.state.viewportY,
        elapsedMs: this.state.elapsedMs,
        alivePlayers: this.state.alivePlayers,
      },
    });
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (this.state.phase !== 'ACTIVE') return;

    const player = this.state.players.get(userId);
    if (!player || !player.isAlive) return;

    if (action === 'SC_MOVE') {
      if (!this.rateLimiter.allow(userId, 15)) return;

      const result = SCInputSchema.safeParse(data);
      if (!result.success) return;

      player.moveInput = { dx: result.data.dx, jump: result.data.jump };
    } else if (action === 'SC_CLOSE_AD') {
      const result = SCCloseAdSchema.safeParse(data);
      if (!result.success) return;

      const { adId, clickPosition } = result.data;
      const ad = this.state.activeAds.get(adId);
      if (!ad || ad.dismissed || ad.targetUserId !== userId) return;

      // Check if click is on real close button
      const isReal = (
        clickPosition.x >= ad.realCloseButton.x &&
        clickPosition.x <= ad.realCloseButton.x + ad.realCloseButton.width &&
        clickPosition.y >= ad.realCloseButton.y &&
        clickPosition.y <= ad.realCloseButton.y + ad.realCloseButton.height
      );

      ad.dismissed = true;
      this.state.activeAds.delete(adId);

      if (isReal) {
        player.adsCorrectlyDismissed++;
        player.score += SC_AD_DISMISS_BONUS;

        this.logAction('ad_dismissed', {
          userId, elapsed: this.state.elapsedMs,
          dismissTime: Date.now() - ad.spawnedAt, usedFakeX: false,
        });

        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
          type: 'SC_AD_DISMISSED',
          payload: { adId, reason: 'correct' },
        });
      } else {
        // Clicked fake X or wrong position — apply effect
        player.activeEffect = ad.effect;
        player.effectExpiresAt = Date.now() + SC_AD_EFFECT_DURATION_SECONDS * 1000;
        player.adsFailed++;

        this.logAction('ad_dismissed', {
          userId, elapsed: this.state.elapsedMs,
          dismissTime: Date.now() - ad.spawnedAt, usedFakeX: true,
        });

        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
          type: 'SC_AD_EFFECT_APPLIED',
          payload: { adId, effect: ad.effect, durationSeconds: SC_AD_EFFECT_DURATION_SECONDS },
        });

        const playerObj = this.context.players.get(userId);
        this.context.broadcastAction({
          type: 'SC_AD_TRICKED',
          payload: {
            userId,
            userName: playerObj?.userName ?? 'Unknown',
            effect: ad.effect,
          },
        });
      }
    }
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    this.state.phase = 'GAME_OVER';
    this.stopSimulation();
    this.clearPhaseTimer();

    // Assign final ranks based on elimination order (last eliminated = rank 1)
    const totalPlayers = this.context.players.size;
    for (const [, player] of this.state.players) {
      if (!player.eliminationRank) {
        player.eliminationRank = totalPlayers;
      }
    }

    // Find winner
    let winner: { userId: string; userName: string } | null = null;
    let lastSurvivor: SCPlayerState | null = null;
    for (const [, player] of this.state.players) {
      if (!lastSurvivor || player.survivalTimeMs > lastSurvivor.survivalTimeMs) {
        lastSurvivor = player;
      }
    }
    if (lastSurvivor) {
      const playerObj = this.context.players.get(lastSurvivor.userId);
      winner = { userId: lastSurvivor.userId, userName: playerObj?.userName ?? 'Unknown' };
    }

    const finalRankings = this.buildFinalRankings();

    this.logAction('game_complete', {
      winnerId: winner?.userId ?? null,
      finalSurvivalTime: lastSurvivor?.survivalTimeMs ?? 0,
      eliminationOrder: this.state.eliminationOrder.map((uid) => {
        const p = this.state.players.get(uid);
        return {
          userId: uid,
          survivalTime: p?.survivalTimeMs ?? 0,
          cause: 'lava',
        };
      }),
      adStats: Array.from(this.state.players.values()).map((p) => ({
        userId: p.userId,
        adsEncountered: p.adsCorrectlyDismissed + p.adsFailed,
        adsDismissed: p.adsCorrectlyDismissed,
      })),
    });

    this.context.broadcastAction({
      type: 'SC_GAME_OVER',
      payload: {
        finalRankings,
        totalSurvivalTimeMs: lastSurvivor?.survivalTimeMs ?? 0,
        winner,
      },
    });

    logger.info({
      event: 'scroll_soul:game_over',
      lobbyId: this.context.lobbyId,
      winner: winner?.userId,
    });

    this.context.onComplete(this.computeResults());
  }

  // ─── State for Player/Spectator ──────────────────────────────

  getStateForPlayer(userId: string): unknown {
    switch (this.state.phase) {
      case 'COUNTDOWN':
        return {
          phase: 'COUNTDOWN',
          players: Array.from(this.state.players.values()).map((p) => {
            const playerObj = this.context.players.get(p.userId);
            return {
              userId: p.userId,
              userName: playerObj?.userName ?? 'Unknown',
              x: p.position.x,
              y: p.position.y,
              color: p.color,
            };
          }),
          canvasWidth: SC_CANVAS_WIDTH,
          canvasHeight: SC_CANVAS_HEIGHT,
        };

      case 'ACTIVE': {
        const viewBottom = this.state.viewportY;
        const viewTop = this.state.viewportY - SC_CANVAS_HEIGHT;
        const buffer = SC_GENERATION_LOOKAHEAD;

        return {
          phase: 'ACTIVE',
          viewportY: this.state.viewportY,
          scrollSpeed: this.state.scrollSpeed,
          platforms: this.state.platforms
            .filter((p) => p.y > viewTop - buffer && p.y < viewBottom + buffer)
            .map((p) => ({
              id: p.id, x: p.x, y: p.y, width: p.width, height: p.height, type: p.type,
            })),
          players: Array.from(this.state.players.values()).map((p) => {
            const playerObj = this.context.players.get(p.userId);
            return {
              userId: p.userId,
              userName: playerObj?.userName ?? 'Unknown',
              x: p.position.x,
              y: p.position.y,
              color: p.color,
              isAlive: p.isAlive,
              isGrounded: p.isGrounded,
              activeEffect: p.activeEffect,
              // Ad stats hidden per spec §4.6
            };
          }),
          lavaY: this.state.viewportY,
          myUserId: userId,
          elapsedMs: this.state.elapsedMs,
          alivePlayers: this.state.alivePlayers,
          scores: Array.from(this.state.players.values()).map((p) => ({
            userId: p.userId,
            score: p.userId === userId ? p.score : 0, // Others' scores hidden
          })),
        };
      }

      case 'GAME_OVER':
        return {
          phase: 'GAME_OVER',
          finalRankings: this.buildFinalRankings(),
          totalSurvivalTimeMs: Math.max(
            ...Array.from(this.state.players.values()).map((p) => p.survivalTimeMs),
          ),
          winner: this.getWinner(),
        };

      default:
        return { phase: this.state.phase };
    }
  }

  getStateForSpectator(): unknown {
    const playerState = this.getStateForPlayer('spectator') as Record<string, unknown>;
    if (this.state.phase === 'ACTIVE') {
      // Spectators see all ad stats and active ads
      return {
        ...playerState,
        players: Array.from(this.state.players.values()).map((p) => {
          const playerObj = this.context.players.get(p.userId);
          return {
            userId: p.userId,
            userName: playerObj?.userName ?? 'Unknown',
            x: p.position.x,
            y: p.position.y,
            color: p.color,
            isAlive: p.isAlive,
            isGrounded: p.isGrounded,
            activeEffect: p.activeEffect,
            adsCorrectlyDismissed: p.adsCorrectlyDismissed,
            adsFailed: p.adsFailed,
            score: p.score,
          };
        }),
        activeAds: Array.from(this.state.activeAds.values()).map((ad) => ({
          adId: ad.id,
          targetUserId: ad.targetUserId,
          effect: ad.effect,
          template: ad.template,
        })),
        scores: Array.from(this.state.players.values()).map((p) => ({
          userId: p.userId,
          score: p.score,
        })),
      };
    }
    return playerState;
  }

  // ─── JIP / Disconnect / Reconnect ────────────────────────────

  handlePlayerJoin(userId: string): void {
    // Spectate only — no joining active game
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
  }

  handlePlayerDisconnect(userId: string): void {
    const player = this.state.players.get(userId);
    if (!player) return;

    player.moveInput = null;

    // Dismiss active ads without penalty
    for (const [adId, ad] of this.state.activeAds) {
      if (ad.targetUserId === userId) {
        ad.dismissed = true;
        this.state.activeAds.delete(adId);
      }
    }

    logger.info({
      event: 'scroll_soul:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
    });
  }

  handlePlayerReconnect(userId: string): void {
    const player = this.state.players.get(userId);
    if (player && player.isAlive) {
      this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));
    } else {
      this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
    }

    logger.info({
      event: 'scroll_soul:player_reconnect',
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
        totalSurvivalTimeMs: Math.max(
          ...Array.from(this.state.players.values()).map((p) => p.survivalTimeMs),
          0,
        ),
        platformsGenerated: this.state.platformIdCounter,
        adsSpawned: this.state.adIdCounter,
        maxScrollSpeed: this.state.scrollSpeed,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private buildPlayerRankings(): PlayerRanking[] {
    const entries = Array.from(this.state.players.values())
      .map((p) => {
        const playerObj = this.context.players.get(p.userId);
        return {
          userId: p.userId,
          userName: playerObj?.userName ?? 'Unknown',
          score: p.score,
          rank: 0,
          deltas: {} as Record<string, number>,
        };
      })
      .sort((a, b) => b.score - a.score);

    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  private buildFinalRankings(): SCFinalRanking[] {
    return Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, i) => {
        const playerObj = this.context.players.get(p.userId);
        return {
          userId: p.userId,
          userName: playerObj?.userName ?? 'Unknown',
          rank: i + 1,
          totalScore: p.score,
          survivalTimeMs: p.survivalTimeMs,
          adsCorrectlyDismissed: p.adsCorrectlyDismissed,
          adsFailed: p.adsFailed,
          eliminationRank: p.eliminationRank ?? 0,
        };
      });
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const players = Array.from(this.state.players.values());

    // Soul Survivor — last standing
    const lastSurvivor = players.reduce((best, p) =>
      p.survivalTimeMs > best.survivalTimeMs ? p : best, players[0]);
    if (lastSurvivor) {
      awards.push({
        userId: lastSurvivor.userId,
        title: 'Soul Survivor',
        description: `Survived ${(lastSurvivor.survivalTimeMs / 1000).toFixed(1)}s`,
        icon: 'shield',
      });
    }

    // Ad Blocker — most ads correctly dismissed
    const adBlocker = players.reduce((best, p) =>
      p.adsCorrectlyDismissed > best.adsCorrectlyDismissed ? p : best, players[0]);
    if (adBlocker && adBlocker.adsCorrectlyDismissed > 0) {
      awards.push({
        userId: adBlocker.userId,
        title: 'Ad Blocker',
        description: `Dismissed ${adBlocker.adsCorrectlyDismissed} ads correctly`,
        icon: 'shield-x',
      });
    }

    // Gullible — most failed ad closes
    const gullible = players.reduce((best, p) =>
      p.adsFailed > best.adsFailed ? p : best, players[0]);
    if (gullible && gullible.adsFailed > 0) {
      awards.push({
        userId: gullible.userId,
        title: 'Gullible',
        description: `Clicked ${gullible.adsFailed} fake close buttons`,
        icon: 'mouse-pointer-click',
      });
    }

    // Terminal Velocity — highest point reached
    const termVel = players.reduce((best, p) =>
      p.highestY < best.highestY ? p : best, players[0]);
    if (termVel) {
      awards.push({
        userId: termVel.userId,
        title: 'Terminal Velocity',
        description: `Reached height ${Math.abs(Math.round(termVel.highestY))}`,
        icon: 'arrow-up',
      });
    }

    // Lava Lover — closest near-miss with lava while surviving longest
    const lavaLover = players
      .filter((p) => p.minLavaDistance < Infinity && p.minLavaDistance > 0)
      .reduce<SCPlayerState | null>((best, p) =>
        !best || p.minLavaDistance < best.minLavaDistance ? p : best, null);
    if (lavaLover) {
      awards.push({
        userId: lavaLover.userId,
        title: 'Lava Lover',
        description: `Closest call: ${Math.round(lavaLover.minLavaDistance)}px from lava`,
        icon: 'flame',
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
    if (this.state.scrollSpeedInterval) {
      clearInterval(this.state.scrollSpeedInterval);
      this.intervals = this.intervals.filter((i) => i !== this.state.scrollSpeedInterval);
      this.state.scrollSpeedInterval = null;
    }
  }

  private getWinner(): { userId: string; userName: string } | null {
    let winner: SCPlayerState | null = null;
    for (const [, p] of this.state.players) {
      if (!winner || p.survivalTimeMs > winner.survivalTimeMs) {
        winner = p;
      }
    }
    if (!winner) return null;
    const playerObj = this.context.players.get(winner.userId);
    return { userId: winner.userId, userName: playerObj?.userName ?? 'Unknown' };
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
      minigameId: 'scroll-soul',
      version: 1,
      players: Array.from(this.context.players.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
      })),
      initialState: {
        playerCount: this.context.players.size,
        initialScrollSpeed: this.getSetting('baseScrollSpeed', SC_SCROLL_SPEED_INITIAL),
        adFrequencyBase: SC_AD_SPAWN_INTERVAL_MIN * 1000,
        obstacleLayoutSeed: 0,
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
