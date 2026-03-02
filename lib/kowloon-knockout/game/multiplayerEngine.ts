// ============================================================
// Multiplayer Game Engine — Host-authoritative online play
// ============================================================

import {
    GameState, InputState, FighterClass, PunchType,
    CANVAS_WIDTH, CANVAS_HEIGHT, RING_LEFT, RING_RIGHT, GROUND_Y,
} from './fighters/types';
import {
    createFighter, startPunch, applyHit, updateFighter,
    moveFighter, setBlocking, checkHit, resetFighter,
} from './fighters/fighter';
import { HEAVY_PUNCH_BONUS } from './combat/punches';
import { detectCombo } from './combat/combos';
import { getCounterStrikeMultiplier, COUNTER_STRIKE_DISPLAY } from './combat/counterstrike';
import { createInputState, attachInputListeners, clearPressedFlags } from './input';
import { drawFighter, drawHitParticles } from './sprites';
import { drawBackground, drawAtmosphere } from './background';
import { networkClient } from '@/lib/kowloon-knockout/network/client';
import type { RemoteInputState, ServerMessage } from '@/lib/kowloon-knockout/network/types';

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
    const barWidth = 130;
    const barHeight = 8;
    const barY = 8;
    const staminaBarHeight = 4;

    const playerX = 20;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(playerX, barY, barWidth, barHeight);
    const playerHpPct = state.player.health / state.player.stats.maxHealth;
    const playerHpColor = playerHpPct > 0.5 ? '#33ff99' : playerHpPct > 0.25 ? '#ffcc00' : '#ff3366';
    ctx.fillStyle = playerHpColor;
    ctx.fillRect(playerX + 1, barY + 1, (barWidth - 2) * playerHpPct, barHeight - 2);
    ctx.save();
    ctx.shadowColor = playerHpColor;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = playerHpColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(playerX, barY, barWidth, barHeight);
    ctx.restore();
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(playerX, barY + barHeight + 2, barWidth, staminaBarHeight);
    const playerStPct = state.player.stamina / state.player.stats.stamina;
    ctx.fillStyle = '#33ccff';
    ctx.fillRect(playerX + 1, barY + barHeight + 3, (barWidth - 2) * playerStPct, staminaBarHeight - 2);
    ctx.fillStyle = state.player.spriteColor;
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = state.player.spriteColor;
    ctx.shadowBlur = 3;
    ctx.fillText(state.player.displayName, playerX, barY + barHeight + staminaBarHeight + 10);
    ctx.shadowBlur = 0;

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
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(oppX, barY + barHeight + 2, barWidth, staminaBarHeight);
    const oppStPct = state.opponent.stamina / state.opponent.stats.stamina;
    ctx.fillStyle = '#33ccff';
    const oppStFillWidth = (barWidth - 2) * oppStPct;
    ctx.fillRect(oppX + barWidth - 1 - oppStFillWidth, barY + barHeight + 3, oppStFillWidth, staminaBarHeight - 2);
    ctx.fillStyle = state.opponent.spriteColor;
    ctx.textAlign = 'right';
    ctx.shadowColor = state.opponent.spriteColor;
    ctx.shadowBlur = 3;
    ctx.fillText(state.opponent.displayName, oppX + barWidth, barY + barHeight + staminaBarHeight + 10);
    ctx.shadowBlur = 0;

    const centerX = CANVAS_WIDTH / 2;
    ctx.fillStyle = '#ffcc00';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 4;
    ctx.fillText(`ROUND ${state.round}`, centerX, barY + 7);
    const timeSeconds = Math.max(0, Math.ceil(state.roundTime / 60));
    ctx.fillStyle = timeSeconds <= 10 ? '#ff3366' : '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(String(timeSeconds), centerX, barY + 20);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffcc00';
    ctx.font = '6px monospace';
    ctx.fillText(`${state.playerScore} - ${state.opponentScore}`, centerX, barY + 28);

    if (state.comboText && state.comboTextTimer > 0) {
        const comboAlpha = Math.min(1, state.comboTextTimer / 30);
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

function drawCountdown(ctx: CanvasRenderingContext2D, state: GameState): void {
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2 - 20;
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

function drawRoundEnd(ctx: CanvasRenderingContext2D, state: GameState): void {
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2 - 10;
    const totalDuration = 180;
    const elapsed = totalDuration - state.roundEndTimer;
    const progress = elapsed / totalDuration;
    const bgAlpha = Math.min(0.6, progress * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const lineProgress = Math.min(1, progress * 3);
    const lineWidth = CANVAS_WIDTH * lineProgress;
    const lineColor = state.roundEndText === 'K.O.' ? '#ff3366' : '#ffcc00';
    ctx.save();
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = Math.min(1, progress * 4);
    ctx.beginPath();
    ctx.moveTo(centerX - lineWidth / 2, centerY - 22);
    ctx.lineTo(centerX + lineWidth / 2, centerY - 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - lineWidth / 2, centerY + 18);
    ctx.lineTo(centerX + lineWidth / 2, centerY + 18);
    ctx.stroke();
    ctx.restore();
    if (progress > 0.15) {
        const textProgress = Math.min(1, (progress - 0.15) * 2.5);
        const scale = 1 + (1 - textProgress) * 0.8;
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

export function initMultiplayerGame(
    canvas: HTMLCanvasElement,
    localClass: FighterClass,
    remoteClass: FighterClass,
    isHost: boolean,
    onStateChange?: (state: GameState) => void,
): () => void {
    if (isHost) {
        return initHostGame(canvas, localClass, remoteClass, onStateChange);
    } else {
        return initGuestGame(canvas, localClass, remoteClass, onStateChange);
    }
}

function initHostGame(
    canvas: HTMLCanvasElement,
    localClass: FighterClass,
    remoteClass: FighterClass,
    onStateChange?: (state: GameState) => void,
): () => void {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const inputState = createInputState();
    const cleanupInput = attachInputListeners(inputState);

    let remoteInput: RemoteInputState = {
        left: false, right: false, block: false,
        jabPressed: false, crossPressed: false, hookPressed: false, uppercutPressed: false,
    };

    const handleRemoteInput = (msg: ServerMessage) => {
        if (msg.type === 'input') {
            remoteInput = msg.data;
        }
    };
    networkClient.on('input', handleRemoteInput);

    const gameState: GameState = {
        player: createFighter(localClass, RING_LEFT + 80, true, 'P1'),
        opponent: createFighter(remoteClass, RING_RIGHT - 80, false, 'P2'),
        round: 1,
        maxRounds: 3,
        roundTime: 60 * 60,
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

    let gameFrame = 0;
    let countdownFrames = 0;
    let rafId: number | null = null;
    let hitParticles: { x: number; y: number; frame: number; color: string }[] = [];
    let alive = true;

    function update(state: GameState): void {
        const { player, opponent } = state;

        state.roundTime--;
        if (state.roundTime <= 0) {
            endRound(state);
            return;
        }

        if (state.comboTextTimer > 0) {
            state.comboTextTimer--;
            if (state.comboTextTimer <= 0) state.comboText = '';
        }

        if (state.screenShake > 0) state.screenShake *= 0.85;
        if (state.screenShake < 0.5) state.screenShake = 0;

        let playerMoveDir = 0;
        if (inputState.left) playerMoveDir -= 1;
        if (inputState.right) playerMoveDir += 1;

        player.facingRight = player.x < opponent.x;
        opponent.facingRight = opponent.x < player.x;

        moveFighter(player, playerMoveDir);
        setBlocking(player, inputState.block);

        const punchInputs: [boolean, PunchType][] = [
            [inputState.jabPressed, 'jab'],
            [inputState.crossPressed, 'cross'],
            [inputState.hookPressed, 'hook'],
            [inputState.uppercutPressed, 'uppercut'],
        ];
        for (const [pressed, type] of punchInputs) {
            if (pressed) { startPunch(player, type); break; }
        }

        let opponentMoveDir = 0;
        if (remoteInput.left) opponentMoveDir -= 1;
        if (remoteInput.right) opponentMoveDir += 1;

        moveFighter(opponent, opponentMoveDir);
        setBlocking(opponent, remoteInput.block);

        const remotePunches: [boolean, PunchType][] = [
            [remoteInput.jabPressed, 'jab'],
            [remoteInput.crossPressed, 'cross'],
            [remoteInput.hookPressed, 'hook'],
            [remoteInput.uppercutPressed, 'uppercut'],
        ];
        for (const [pressed, type] of remotePunches) {
            if (pressed && opponent.state !== 'punching') {
                startPunch(opponent, type);
                break;
            }
        }

        remoteInput.jabPressed = false;
        remoteInput.crossPressed = false;
        remoteInput.hookPressed = false;
        remoteInput.uppercutPressed = false;

        if (checkHit(player, opponent)) {
            const combo = detectCombo(player.comboHistory, Date.now(), player.className);
            const comboMult = combo ? combo.bonusDamageMultiplier : 1.0;
            const punchType = player.currentPunch?.type;
            const heavyBonus = punchType ? HEAVY_PUNCH_BONUS[punchType] : undefined;
            const heavyMult = heavyBonus ? heavyBonus.multiplier : 1.0;
            const counterStrike = getCounterStrikeMultiplier(opponent);
            const finalMult = Math.min(2.5, comboMult * heavyMult * counterStrike.multiplier);
            const result = applyHit(opponent, player, finalMult);
            if (result.damage > 0 && !result.blocked) {
                hitParticles.push({ x: opponent.x, y: opponent.y - 40, frame: 0, color: player.spriteAccentColor });
                state.screenShake = Math.min(12, result.damage * 0.5);
                if (combo) {
                    state.comboText = combo.displayName;
                    state.comboTextTimer = 90;
                    if (opponent.state === 'hit') { opponent.state = 'stunned'; opponent.stateFrame = 0; }
                } else if (heavyBonus) {
                    state.comboText = heavyBonus.displayName;
                    state.comboTextTimer = 60;
                } else if (counterStrike.isCounterStrike) {
                    state.comboText = COUNTER_STRIKE_DISPLAY;
                    state.comboTextTimer = 60;
                }
            }
        }

        if (checkHit(opponent, player)) {
            const combo = detectCombo(opponent.comboHistory, Date.now(), opponent.className);
            const comboMult = combo ? combo.bonusDamageMultiplier : 1.0;
            const oppPunchType = opponent.currentPunch?.type;
            const oppHeavyBonus = oppPunchType ? HEAVY_PUNCH_BONUS[oppPunchType] : undefined;
            const oppHeavyMult = oppHeavyBonus ? oppHeavyBonus.multiplier : 1.0;
            const oppCounterStrike = getCounterStrikeMultiplier(player);
            const oppFinalMult = Math.min(2.5, comboMult * oppHeavyMult * oppCounterStrike.multiplier);
            const result = applyHit(player, opponent, oppFinalMult);
            if (result.damage > 0 && !result.blocked) {
                hitParticles.push({ x: player.x, y: player.y - 40, frame: 0, color: opponent.spriteAccentColor });
                state.screenShake = Math.min(8, result.damage * 0.3);
                if (oppCounterStrike.isCounterStrike) {
                    state.comboText = COUNTER_STRIKE_DISPLAY;
                    state.comboTextTimer = 60;
                }
            }
        }

        updateFighter(player);
        updateFighter(opponent);

        if (player.state === 'knockedOut' || opponent.state === 'knockedOut') {
            if (player.state === 'knockedOut') {
                state.opponentScore++;
            } else {
                state.playerScore++;
            }
            state.roundEndText = 'K.O.';
            state.result = 'ko';
            state.phase = 'roundEnd';
            state.roundEndTimer = 180;
        }

        hitParticles = hitParticles.filter(p => { p.frame++; return p.frame < 15; });

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

    function endRound(state: GameState): void {
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
        state.roundEndTimer = 180;
    }

    function finishRoundEnd(state: GameState): void {
        if (state.result === 'ko') {
            state.phase = 'result';
            return;
        }
        if (state.round >= state.maxRounds || state.playerScore >= 2 || state.opponentScore >= 2) {
            state.result = 'decision';
            state.phase = 'result';
        } else {
            state.round++;
            state.roundTime = state.maxRoundTime;
            resetFighter(state.player, RING_LEFT + 80);
            resetFighter(state.opponent, RING_RIGHT - 80);
            state.phase = 'countdown';
            state.countdownValue = 3;
            countdownFrames = 0;
        }
    }

    function render(ctx: CanvasRenderingContext2D, state: GameState): void {
        ctx.save();
        if (state.screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * state.screenShake, (Math.random() - 0.5) * state.screenShake);
        }
        drawBackground(ctx, gameFrame);
        drawFighter(ctx, state.player, gameFrame);
        drawFighter(ctx, state.opponent, gameFrame);
        for (const particle of hitParticles) {
            drawHitParticles(ctx, particle.x, particle.y, particle.frame, particle.color);
        }
        drawHUD(ctx, state);
        drawAtmosphere(ctx, gameFrame);
        if (state.phase === 'countdown') drawCountdown(ctx, state);
        if (state.phase === 'roundEnd') drawRoundEnd(ctx, state);
        ctx.restore();
    }

    function gameLoop(): void {
        if (!alive) return;
        gameFrame++;

        if (gameState.phase === 'countdown') {
            countdownFrames++;
            gameState.countdownValue = Math.max(0, 3 - Math.floor(countdownFrames / 60));
            if (countdownFrames >= 240) gameState.phase = 'fight';
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

        networkClient.sendGameState({ ...gameState });

        if (onStateChange) {
            onStateChange({ ...gameState });
        }

        clearPressedFlags(inputState);
        rafId = requestAnimationFrame(gameLoop);
    }

    rafId = requestAnimationFrame(gameLoop);

    return () => {
        alive = false;
        if (rafId) cancelAnimationFrame(rafId);
        cleanupInput();
        networkClient.off('input', handleRemoteInput);
    };
}

function initGuestGame(
    canvas: HTMLCanvasElement,
    localClass: FighterClass,
    remoteClass: FighterClass,
    onStateChange?: (state: GameState) => void,
): () => void {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const inputState = createInputState();
    const cleanupInput = attachInputListeners(inputState);

    let latestState: GameState | null = null;
    let gameFrame = 0;
    let rafId: number | null = null;
    let alive = true;

    const handleGameState = (msg: ServerMessage) => {
        if (msg.type === 'game_state') {
            const received = msg.data;
            latestState = {
                ...received,
                player: received.opponent,
                opponent: received.player,
                playerScore: received.opponentScore,
                opponentScore: received.playerScore,
            };
        }
    };
    networkClient.on('game_state', handleGameState);

    function guestLoop(): void {
        if (!alive) return;
        gameFrame++;

        networkClient.sendInput({
            left: inputState.left,
            right: inputState.right,
            block: inputState.block,
            jabPressed: inputState.jabPressed,
            crossPressed: inputState.crossPressed,
            hookPressed: inputState.hookPressed,
            uppercutPressed: inputState.uppercutPressed,
        });
        clearPressedFlags(inputState);

        if (latestState) {
            ctx.save();
            if (latestState.screenShake > 0) {
                ctx.translate(
                    (Math.random() - 0.5) * latestState.screenShake,
                    (Math.random() - 0.5) * latestState.screenShake,
                );
            }
            drawBackground(ctx, gameFrame);
            drawFighter(ctx, latestState.player, gameFrame);
            drawFighter(ctx, latestState.opponent, gameFrame);
            drawHUD(ctx, latestState);
            drawAtmosphere(ctx, gameFrame);
            if (latestState.phase === 'countdown') drawCountdown(ctx, latestState);
            if (latestState.phase === 'roundEnd') drawRoundEnd(ctx, latestState);
            ctx.restore();

            if (onStateChange) {
                onStateChange({ ...latestState });
            }
        } else {
            drawBackground(ctx, gameFrame);
            drawAtmosphere(ctx, gameFrame);
            ctx.save();
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 8;
            ctx.fillText('WAITING FOR HOST...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
            ctx.restore();
        }

        rafId = requestAnimationFrame(guestLoop);
    }

    rafId = requestAnimationFrame(guestLoop);

    return () => {
        alive = false;
        if (rafId) cancelAnimationFrame(rafId);
        cleanupInput();
        networkClient.off('game_state', handleGameState);
    };
}
