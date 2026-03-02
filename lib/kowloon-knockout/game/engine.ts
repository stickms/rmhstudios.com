// ============================================================
// Main Game Engine — Core update/render loop
// ============================================================

import {
    GameState, InputState, FighterClass,
    CANVAS_WIDTH, CANVAS_HEIGHT, RING_LEFT, RING_RIGHT, GROUND_Y,
} from './fighters/types';
import {
    createFighter, startPunch, applyHit, updateFighter,
    moveFighter, setBlocking, checkHit, resetFighter,
} from './fighters/fighter';
import { PUNCH_DEFS, HEAVY_PUNCH_BONUS } from './combat/punches';
import { detectCombo } from './combat/combos';
import { getCounterStrikeMultiplier, COUNTER_STRIKE_DISPLAY } from './combat/counterstrike';
import { createInputState, attachInputListeners, clearPressedFlags } from './input';
import { drawFighter, drawHitParticles } from './sprites';
import { drawBackground, drawAtmosphere } from './background';
import { createAIState, updateAI } from './ai/opponent';
import type { PunchType } from './fighters/types';

let gameState: GameState | null = null;
let inputState: InputState;
let cleanupInput: (() => void) | null = null;
let animFrame: number = 0;
let gameFrame: number = 0;
let rafId: number | null = null;
let aiState = createAIState(0.5);

// Hit particles tracking
let hitParticles: { x: number; y: number; frame: number; color: string }[] = [];

/**
 * Initialize the game engine with a canvas context
 */
export function initGame(
    canvas: HTMLCanvasElement,
    playerClass: FighterClass,
    opponentClass: FighterClass,
    onStateChange?: (state: GameState) => void,
): () => void {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // Pixel-perfect rendering

    inputState = createInputState();
    cleanupInput = attachInputListeners(inputState);
    aiState = createAIState(0.55, opponentClass);

    // Create game state
    gameState = {
        player: createFighter(playerClass, RING_LEFT + 80, true, 'PLAYER'),
        opponent: createFighter(opponentClass, RING_RIGHT - 80, false, 'CPU'),
        round: 1,
        maxRounds: 3,
        roundTime: 60 * 60, // 60 seconds at 60fps
        maxRoundTime: 60 * 60,
        playerScore: 0,
        opponentScore: 0,
        phase: 'countdown',
        result: null,
        comboText: '',
        comboTextTimer: 0,
        screenShake: 0,
        isPaused: false,
        countdownValue: 3,
        roundEndTimer: 0,
        roundEndText: '',
    };

    gameFrame = 0;
    hitParticles = [];

    // Start countdown
    let countdownFrames = 0;

    // Main game loop
    function gameLoop(): void {
        if (!gameState) return;

        gameFrame++;

        if (gameState.phase === 'countdown') {
            countdownFrames++;
            gameState.countdownValue = Math.max(0, 3 - Math.floor(countdownFrames / 60));
            if (countdownFrames >= 240) { // 4 seconds (3, 2, 1, FIGHT!)
                gameState.phase = 'fight';
            }
        }

        if (gameState.phase === 'roundEnd') {
            gameState.roundEndTimer--;
            if (gameState.roundEndTimer <= 0) {
                finishRoundEnd(gameState);
                countdownFrames = 0;
            }
        }

        if (gameState.phase === 'fight' && !gameState.isPaused) {
            update(gameState);
        }

        render(ctx, gameState);

        if (onStateChange) {
            onStateChange({ ...gameState });
        }

        clearPressedFlags(inputState);
        rafId = requestAnimationFrame(gameLoop);
    }

    rafId = requestAnimationFrame(gameLoop);

    // Return cleanup function
    return () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (cleanupInput) cleanupInput();
        gameState = null;
    };
}

/**
 * Update game logic
 */
function update(state: GameState): void {
    const { player, opponent } = state;

    // Decrease round timer
    state.roundTime--;
    if (state.roundTime <= 0) {
        endRound(state);
        return;
    }

    // Decrease combo text timer
    if (state.comboTextTimer > 0) {
        state.comboTextTimer--;
        if (state.comboTextTimer <= 0) {
            state.comboText = '';
        }
    }

    // Decrease screen shake
    if (state.screenShake > 0) state.screenShake *= 0.85;
    if (state.screenShake < 0.5) state.screenShake = 0;

    // === Player Input ===
    let playerMoveDir = 0;
    if (inputState.left) playerMoveDir -= 1;
    if (inputState.right) playerMoveDir += 1;

    // Face opponent
    player.facingRight = player.x < opponent.x;
    opponent.facingRight = opponent.x < player.x;

    // Movement
    moveFighter(player, playerMoveDir);

    // Blocking
    setBlocking(player, inputState.block);

    // Punches (only process on "just pressed")
    const punchInputs: [boolean, PunchType][] = [
        [inputState.jabPressed, 'jab'],
        [inputState.crossPressed, 'cross'],
        [inputState.hookPressed, 'hook'],
        [inputState.uppercutPressed, 'uppercut'],
    ];

    for (const [pressed, type] of punchInputs) {
        if (pressed) {
            startPunch(player, type);
            break; // Only one punch per frame
        }
    }

    // === AI Opponent ===
    const aiAction = updateAI(aiState, opponent, player);

    if (aiAction.moveDir !== 0) {
        moveFighter(opponent, aiAction.moveDir);
    }

    setBlocking(opponent, aiAction.block);

    if (aiAction.punch && opponent.state !== 'punching') {
        startPunch(opponent, aiAction.punch);
    }

    // === Hit Detection ===
    // Player hitting opponent
    if (checkHit(player, opponent)) {
        // Check for combo
        const combo = detectCombo(player.comboHistory, Date.now(), player.className);
        const comboMult = combo ? combo.bonusDamageMultiplier : 1.0;

        // Heavy punch bonus (hook/uppercut)
        const punchType = player.currentPunch?.type;
        const heavyBonus = punchType ? HEAVY_PUNCH_BONUS[punchType] : undefined;
        const heavyMult = heavyBonus ? heavyBonus.multiplier : 1.0;

        // Counter-strike bonus (punishes opponent spam)
        const counterStrike = getCounterStrikeMultiplier(opponent);

        const finalMult = Math.min(2.5, comboMult * heavyMult * counterStrike.multiplier);
        const result = applyHit(opponent, player, finalMult);

        if (result.damage > 0) {
            if (!result.blocked) {
                hitParticles.push({
                    x: opponent.x,
                    y: opponent.y - 40,
                    frame: 0,
                    color: player.spriteAccentColor,
                });
                state.screenShake = Math.min(12, result.damage * 0.5);

                // Text priority: combo > heavy punch > counter-strike
                if (combo) {
                    state.comboText = combo.displayName;
                    state.comboTextTimer = 90;
                    if (opponent.state === 'hit') {
                        opponent.state = 'stunned';
                        opponent.stateFrame = 0;
                    }
                } else if (heavyBonus) {
                    state.comboText = heavyBonus.displayName;
                    state.comboTextTimer = 60;
                } else if (counterStrike.isCounterStrike) {
                    state.comboText = COUNTER_STRIKE_DISPLAY;
                    state.comboTextTimer = 60;
                }
            }
        }
    }

    // Opponent hitting player
    if (checkHit(opponent, player)) {
        const combo = detectCombo(opponent.comboHistory, Date.now(), opponent.className);
        const comboMult = combo ? combo.bonusDamageMultiplier : 1.0;

        // Heavy punch bonus
        const oppPunchType = opponent.currentPunch?.type;
        const oppHeavyBonus = oppPunchType ? HEAVY_PUNCH_BONUS[oppPunchType] : undefined;
        const oppHeavyMult = oppHeavyBonus ? oppHeavyBonus.multiplier : 1.0;

        // Counter-strike bonus (punishes player spam)
        const oppCounterStrike = getCounterStrikeMultiplier(player);

        const oppFinalMult = Math.min(2.5, comboMult * oppHeavyMult * oppCounterStrike.multiplier);
        const result = applyHit(player, opponent, oppFinalMult);

        if (result.damage > 0 && !result.blocked) {
            hitParticles.push({
                x: player.x,
                y: player.y - 40,
                frame: 0,
                color: opponent.spriteAccentColor,
            });
            state.screenShake = Math.min(8, result.damage * 0.3);

            if (oppCounterStrike.isCounterStrike) {
                state.comboText = COUNTER_STRIKE_DISPLAY;
                state.comboTextTimer = 60;
            }
        }
    }

    // === Update fighters ===
    updateFighter(player);
    updateFighter(opponent);

    // === Check for KO ===
    if (player.state === 'knockedOut' || opponent.state === 'knockedOut') {
        if (player.state === 'knockedOut') {
            state.opponentScore++;
            state.roundEndText = 'K.O.';
        } else {
            state.playerScore++;
            state.roundEndText = 'K.O.';
        }
        state.result = 'ko';
        state.phase = 'roundEnd';
        state.roundEndTimer = 180; // 3 seconds
    }

    // === Update particles ===
    hitParticles = hitParticles.filter(p => {
        p.frame++;
        return p.frame < 15;
    });

    // Prevent fighters from overlapping (fighters are 40px wide, so 40px = touching)
    const minDist = 38;
    const dist = Math.abs(player.x - opponent.x);
    if (dist < minDist) {
        const overlap = minDist - dist;
        const pushDir = player.x < opponent.x ? -1 : 1;
        player.x += pushDir * (overlap / 2);
        opponent.x -= pushDir * (overlap / 2);
        player.x = Math.max(RING_LEFT + 5, Math.min(RING_RIGHT - 5, player.x));
        opponent.x = Math.max(RING_LEFT + 5, Math.min(RING_RIGHT - 5, opponent.x));
    }
}

/**
 * End the current round
 */
function endRound(state: GameState): void {
    // Decision based on remaining health percentage
    const playerHpPct = state.player.health / state.player.stats.maxHealth;
    const opponentHpPct = state.opponent.health / state.opponent.stats.maxHealth;

    if (playerHpPct > opponentHpPct) {
        state.playerScore++;
        state.roundEndText = `${state.player.displayName} WINS`;
    } else if (opponentHpPct > playerHpPct) {
        state.opponentScore++;
        state.roundEndText = `${state.opponent.displayName} WINS`;
    } else {
        state.roundEndText = 'DRAW';
    }

    state.phase = 'roundEnd';
    state.roundEndTimer = 180; // 3 seconds at 60fps
}

function finishRoundEnd(state: GameState): void {
    if (state.result === 'ko') {
        // KO already scored — go straight to result
        state.phase = 'result';
        return;
    }

    if (state.round >= state.maxRounds || state.playerScore >= 2 || state.opponentScore >= 2) {
        state.result = 'decision';
        state.phase = 'result';
    } else {
        // Next round
        state.round++;
        state.roundTime = state.maxRoundTime;
        resetFighter(state.player, RING_LEFT + 80);
        resetFighter(state.opponent, RING_RIGHT - 80);
        state.phase = 'countdown';
        state.countdownValue = 3;
    }
}

/**
 * Render full frame
 */
function render(ctx: CanvasRenderingContext2D, state: GameState): void {
    ctx.save();

    // Screen shake
    if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShake;
        const shakeY = (Math.random() - 0.5) * state.screenShake;
        ctx.translate(shakeX, shakeY);
    }

    // Background
    drawBackground(ctx, gameFrame);

    // Fighters
    drawFighter(ctx, state.player, gameFrame);
    drawFighter(ctx, state.opponent, gameFrame);

    // Hit particles
    for (const particle of hitParticles) {
        drawHitParticles(ctx, particle.x, particle.y, particle.frame, particle.color);
    }

    // HUD overlay
    drawHUD(ctx, state);

    // Atmospheric effects (scanlines, vignette)
    drawAtmosphere(ctx, gameFrame);

    // Countdown overlay
    if (state.phase === 'countdown') {
        drawCountdown(ctx, state);
    }

    // Round end overlay
    if (state.phase === 'roundEnd') {
        drawRoundEnd(ctx, state);
    }

    ctx.restore();
}

/**
 * Draw in-game HUD (health bars, stamina, round, timer, combo text)
 */
function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
    const barWidth = 130;
    const barHeight = 8;
    const barY = 8;
    const staminaBarHeight = 4;

    // === Player health bar (left side) ===
    const playerX = 20;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(playerX, barY, barWidth, barHeight);

    // Health fill
    const playerHpPct = state.player.health / state.player.stats.maxHealth;
    const playerHpColor = playerHpPct > 0.5 ? '#33ff99' : playerHpPct > 0.25 ? '#ffcc00' : '#ff3366';
    ctx.fillStyle = playerHpColor;
    ctx.fillRect(playerX + 1, barY + 1, (barWidth - 2) * playerHpPct, barHeight - 2);

    // Neon glow
    ctx.save();
    ctx.shadowColor = playerHpColor;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = playerHpColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(playerX, barY, barWidth, barHeight);
    ctx.restore();

    // Stamina bar
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(playerX, barY + barHeight + 2, barWidth, staminaBarHeight);
    const playerStPct = state.player.stamina / state.player.stats.stamina;
    ctx.fillStyle = '#33ccff';
    ctx.fillRect(playerX + 1, barY + barHeight + 3, (barWidth - 2) * playerStPct, staminaBarHeight - 2);

    // Player name
    ctx.fillStyle = state.player.spriteColor;
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = state.player.spriteColor;
    ctx.shadowBlur = 3;
    ctx.fillText(state.player.displayName, playerX, barY + barHeight + staminaBarHeight + 10);
    ctx.shadowBlur = 0;

    // === Opponent health bar (right side, fills right to left) ===
    const oppX = CANVAS_WIDTH - barWidth - 20;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(oppX, barY, barWidth, barHeight);

    const oppHpPct = state.opponent.health / state.opponent.stats.maxHealth;
    const oppHpColor = oppHpPct > 0.5 ? '#33ff99' : oppHpPct > 0.25 ? '#ffcc00' : '#ff3366';
    ctx.fillStyle = oppHpColor;
    const oppFillWidth = (barWidth - 2) * oppHpPct;
    ctx.fillRect(oppX + barWidth - 1 - oppFillWidth, barY + 1, oppFillWidth, barHeight - 2);

    ctx.save();
    ctx.shadowColor = oppHpColor;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = oppHpColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(oppX, barY, barWidth, barHeight);
    ctx.restore();

    // Opponent stamina
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(oppX, barY + barHeight + 2, barWidth, staminaBarHeight);
    const oppStPct = state.opponent.stamina / state.opponent.stats.stamina;
    ctx.fillStyle = '#33ccff';
    const oppStFillWidth = (barWidth - 2) * oppStPct;
    ctx.fillRect(oppX + barWidth - 1 - oppStFillWidth, barY + barHeight + 3, oppStFillWidth, staminaBarHeight - 2);

    // Opponent name
    ctx.fillStyle = state.opponent.spriteColor;
    ctx.textAlign = 'right';
    ctx.shadowColor = state.opponent.spriteColor;
    ctx.shadowBlur = 3;
    ctx.fillText(state.opponent.displayName, oppX + barWidth, barY + barHeight + staminaBarHeight + 10);
    ctx.shadowBlur = 0;

    // === Center info: Round & Timer ===
    const centerX = CANVAS_WIDTH / 2;

    // Round
    ctx.fillStyle = '#ffcc00';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 4;
    ctx.fillText(`ROUND ${state.round}`, centerX, barY + 7);

    // Timer
    const timeSeconds = Math.max(0, Math.ceil(state.roundTime / 60));
    ctx.fillStyle = timeSeconds <= 10 ? '#ff3366' : '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(String(timeSeconds), centerX, barY + 20);
    ctx.shadowBlur = 0;

    // Score
    ctx.fillStyle = '#ffcc00';
    ctx.font = '6px monospace';
    ctx.fillText(`${state.playerScore} - ${state.opponentScore}`, centerX, barY + 28);

    // === Combo text ===
    if (state.comboText && state.comboTextTimer > 0) {
        const comboAlpha = Math.min(1, state.comboTextTimer / 30);
        const comboScale = 1 + (90 - state.comboTextTimer) * 0.005;

        ctx.save();
        ctx.globalAlpha = comboAlpha;
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 8;

        const comboY = CANVAS_HEIGHT / 2 - 20 - (90 - state.comboTextTimer) * 0.3;
        ctx.fillText(state.comboText, centerX, comboY);
        ctx.restore();
    }
}

/**
 * Draw countdown overlay (3, 2, 1, FIGHT!)
 */
function drawCountdown(ctx: CanvasRenderingContext2D, state: GameState): void {
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2 - 20;

    // Darken background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const text = state.countdownValue > 0 ? String(state.countdownValue) : 'FIGHT!';
    const color = state.countdownValue > 0 ? '#ffcc00' : '#ff3366';

    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${state.countdownValue > 0 ? 28 : 20}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillText(text, centerX, centerY);
    ctx.restore();
}

/**
 * Draw round-end animation overlay
 */
function drawRoundEnd(ctx: CanvasRenderingContext2D, state: GameState): void {
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2 - 10;
    const totalDuration = 180;
    const elapsed = totalDuration - state.roundEndTimer;
    const progress = elapsed / totalDuration; // 0 → 1

    // Darken background — fades in
    const bgAlpha = Math.min(0.6, progress * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Horizontal neon lines sweep in from edges
    const lineProgress = Math.min(1, progress * 3);
    const lineWidth = CANVAS_WIDTH * lineProgress;
    const lineColor = state.roundEndText === 'K.O.' ? '#ff3366' : '#ffcc00';

    ctx.save();
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = Math.min(1, progress * 4);

    // Top line
    ctx.beginPath();
    ctx.moveTo(centerX - lineWidth / 2, centerY - 22);
    ctx.lineTo(centerX + lineWidth / 2, centerY - 22);
    ctx.stroke();

    // Bottom line
    ctx.beginPath();
    ctx.moveTo(centerX - lineWidth / 2, centerY + 18);
    ctx.lineTo(centerX + lineWidth / 2, centerY + 18);
    ctx.stroke();
    ctx.restore();

    // Main text — scales in then settles
    if (progress > 0.15) {
        const textProgress = Math.min(1, (progress - 0.15) * 2.5);
        const scale = 1 + (1 - textProgress) * 0.8; // starts big, settles to 1x
        const textAlpha = Math.min(1, textProgress * 3);

        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);

        ctx.fillStyle = lineColor;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 12;
        ctx.fillText(state.roundEndText, 0, 0);
        ctx.restore();
    }

    // Score display — fades in later
    if (progress > 0.5) {
        const scoreAlpha = Math.min(1, (progress - 0.5) * 3);
        ctx.save();
        ctx.globalAlpha = scoreAlpha;
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${state.playerScore} - ${state.opponentScore}`, centerX, centerY + 30);
        ctx.restore();
    }
}

// Export for external control
export function getGameState(): GameState | null {
    return gameState;
}

export function pauseGame(): void {
    if (gameState) gameState.isPaused = true;
}

export function resumeGame(): void {
    if (gameState) gameState.isPaused = false;
}
