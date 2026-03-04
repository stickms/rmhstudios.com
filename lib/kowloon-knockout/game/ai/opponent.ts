// ============================================================
// AI Opponent Logic — Class-specific fighting styles
// ============================================================

import { Fighter, FighterClass, PunchType, RING_LEFT, RING_RIGHT } from '../fighters/types';

interface AIState {
    actionCooldown: number;
    currentAction: 'idle' | 'approach' | 'attack' | 'retreat' | 'block';
    actionTimer: number;
    difficulty: number; // 0-1, affects reaction time and aggression
    nextPunch: PunchType | null;
    comboIndex: number;
    patternCooldown: number;
    fighterClass: FighterClass;
    // Ghost Monkey mode tracking
    ghostMonkeyAggressive?: boolean;
    ghostMonkeyModeTimer?: number;
}

// Dragon Fist subclass combos
const STONE_TIGER_COMBOS: PunchType[][] = [
    ['hook', 'hook', 'uppercut'],  // IRON CLAW
    ['cross', 'hook'],
    ['hook', 'uppercut'],
    ['cross', 'hook', 'uppercut'],
];

const RED_PHOENIX_COMBOS: PunchType[][] = [
    ['jab', 'cross', 'cross', 'uppercut'],  // PHOENIX STRIKE
    ['jab', 'cross'],
    ['jab', 'jab', 'cross'],
    ['cross', 'uppercut'],
];

const JADE_DRAGON_COMBOS: PunchType[][] = [
    ['cross', 'jab', 'hook', 'uppercut'],  // DRAGON RISING
    ['jab', 'cross', 'hook'],
    ['jab', 'cross'],
    ['cross', 'hook'],
    ['jab', 'jab', 'uppercut'],
];

const SILVER_VIPER_COMBOS: PunchType[][] = [
    ['jab', 'jab', 'cross', 'hook'],
    ['jab', 'cross'],
    ['jab', 'jab', 'cross'],
    ['cross', 'hook'],
];

const NIGHT_CRANE_COMBOS: PunchType[][] = [
    ['cross', 'cross', 'uppercut'],
    ['jab', 'cross'],
    ['cross', 'hook'],
    ['jab', 'cross', 'hook'],
];

const GHOST_MONKEY_COMBOS: PunchType[][] = [
    ['hook', 'jab', 'uppercut'],
    ['jab', 'cross', 'hook'],
    ['cross', 'uppercut'],
    ['jab', 'jab', 'cross'],
    ['hook', 'cross'],
];

const BLACK_TORTOISE_COMBOS: PunchType[][] = [
    ['jab', 'cross', 'hook', 'hook'],
    ['jab', 'cross'],
    ['jab', 'jab', 'cross'],
    ['cross', 'hook'],
];

const IRON_BULL_COMBOS: PunchType[][] = [
    ['hook', 'uppercut', 'uppercut'],
    ['cross', 'hook'],
    ['hook', 'uppercut'],
    ['cross', 'hook', 'uppercut'],
];

const SMOKE_LEOPARD_COMBOS: PunchType[][] = [
    ['jab', 'jab', 'jab', 'cross'],
    ['jab', 'cross'],
    ['jab', 'jab', 'cross'],
    ['jab', 'cross', 'hook'],
];

function getCombos(fighterClass: FighterClass): PunchType[][] {
    switch (fighterClass) {
        case 'stone_tiger': return STONE_TIGER_COMBOS;
        case 'red_phoenix': return RED_PHOENIX_COMBOS;
        case 'jade_dragon': return JADE_DRAGON_COMBOS;
        case 'silver_viper': return SILVER_VIPER_COMBOS;
        case 'night_crane': return NIGHT_CRANE_COMBOS;
        case 'ghost_monkey': return GHOST_MONKEY_COMBOS;
        case 'black_tortoise': return BLACK_TORTOISE_COMBOS;
        case 'iron_bull': return IRON_BULL_COMBOS;
        case 'smoke_leopard': return SMOKE_LEOPARD_COMBOS;
    }
}

export function createAIState(difficulty: number = 0.5, fighterClass: FighterClass = 'stone_tiger'): AIState {
    return {
        actionCooldown: 0,
        currentAction: 'approach',
        actionTimer: 0,
        difficulty: Math.max(0, Math.min(1, difficulty)),
        nextPunch: null,
        comboIndex: -1,
        patternCooldown: 0,
        fighterClass,
    };
}

/**
 * Update AI decision-making. Returns desired movement and punch action.
 */
export function updateAI(
    ai: AIState,
    opponent: Fighter,
    player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    if (opponent.state === 'knockedOut' || opponent.state === 'stunned') {
        return { moveDir: 0, punch: null, block: false };
    }

    switch (ai.fighterClass) {
        case 'stone_tiger': return updateStoneTigerAI(ai, opponent, player);
        case 'red_phoenix': return updateRedPhoenixAI(ai, opponent, player);
        case 'jade_dragon': return updateJadeDragonAI(ai, opponent, player);
        case 'silver_viper': return updateSilverViperAI(ai, opponent, player);
        case 'night_crane': return updateNightCraneAI(ai, opponent, player);
        case 'ghost_monkey': return updateGhostMonkeyAI(ai, opponent, player);
        case 'black_tortoise': return updateBlackTortoiseAI(ai, opponent, player);
        case 'iron_bull': return updateIronBullAI(ai, opponent, player);
        case 'smoke_leopard': return updateSmokeLeopardAI(ai, opponent, player);
    }
}

// ============================================================
// STONE TIGER — Patient tank, walks forward, blocks often, heavy punches
// ============================================================
function updateStoneTigerAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('stone_tiger');

    // Stone Tiger blocks frequently — 40% when player attacks nearby
    if (isPlayerPunching && isInRange && Math.random() < 0.4) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    // Always press forward slowly
    if (!isInRange) {
        moveDir = player.x > opponent.x ? 1 : -1;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                if (Math.random() < 0.7) {
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = combos[comboIdx].length;
                } else {
                    ai.nextPunch = pickStoneTigerPunch(distance);
                    ai.comboIndex = -1;
                }
            } else {
                ai.currentAction = 'approach';
            }
            ai.actionTimer = 0;
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = combos[comboIdx].length;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 6; // Slow between punches
                        } else {
                            if (Math.random() < 0.4) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = combos[comboIdx].length;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickStoneTigerPunch(distance);
                            }
                            ai.actionCooldown = 6;
                        }
                    } else {
                        ai.nextPunch = pickStoneTigerPunch(distance);
                        ai.actionCooldown = 6;
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.6 ? 'hook' : 'uppercut';
                ai.actionCooldown = 5;
            }

            if (ai.actionTimer > 40) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            // Stone Tiger never retreats — always presses forward
            ai.currentAction = 'approach';
            ai.actionTimer = 0;
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 8 || !isPlayerPunching) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                ai.actionCooldown = 3;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickStoneTigerPunch(distance: number): PunchType {
    if (distance < 32) {
        const roll = Math.random();
        if (roll < 0.25) return 'hook';
        if (roll < 0.45) return 'uppercut';
        if (roll < 0.75) return 'cross';
        return 'jab';
    } else {
        const roll = Math.random();
        if (roll < 0.30) return 'jab';
        if (roll < 0.60) return 'cross';
        if (roll < 0.85) return 'hook';
        return 'uppercut';
    }
}

// ============================================================
// RED PHOENIX — Aggressive hit-and-run, never blocks, all-in offense
// ============================================================
function updateRedPhoenixAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    const block = false; // Red Phoenix never blocks

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('red_phoenix');

    // Instead of blocking, Phoenix retreats from punches
    if (isPlayerPunching && isInRange && Math.random() < 0.5) {
        ai.currentAction = 'retreat';
        ai.actionTimer = 0;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 2) {
                if (isPlayerHit && distance < 65) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = combos[comboIdx].length;
                } else if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                punch = 'jab';
                ai.actionCooldown = 3;
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 15) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickRedPhoenixPunch(distance);
                ai.comboIndex = -1;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 3; // Fast combos
                        } else {
                            // After combo, retreat
                            ai.nextPunch = null;
                            ai.comboIndex = -1;
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 2;
                        }
                    } else {
                        if (Math.random() < 0.5) {
                            ai.nextPunch = pickRedPhoenixPunch(distance);
                            ai.actionCooldown = 3;
                        } else {
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 2;
                        }
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.4 ? 'uppercut' : 'cross';
                ai.actionCooldown = 2;
            }

            if (ai.actionTimer > 20) {
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickRedPhoenixPunch(distance);
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 6) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            // Phoenix doesn't block, immediately counters
            ai.currentAction = 'attack';
            ai.nextPunch = pickRedPhoenixPunch(distance);
            ai.actionTimer = 0;
            ai.actionCooldown = 1;
            break;
    }

    return { moveDir, punch, block };
}

function pickRedPhoenixPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.3) return 'cross';
        if (roll < 0.5) return 'uppercut';
        if (roll < 0.8) return 'jab';
        return 'hook';
    } else {
        if (roll < 0.5) return 'jab';
        if (roll < 0.8) return 'cross';
        return 'jab';
    }
}

// ============================================================
// JADE DRAGON — Adaptive, balanced, uses all tools
// ============================================================
function updateJadeDragonAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('jade_dragon');

    // Moderate blocking — 25%
    if (isPlayerPunching && isInRange && Math.random() < 0.25) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (isPlayerHit && distance < 55) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = combos[comboIdx].length;
                } else if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.65) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                    } else {
                        ai.nextPunch = pickJadeDragonPunch(distance);
                        ai.comboIndex = -1;
                    }
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.12) {
                punch = Math.random() < 0.6 ? 'jab' : 'cross';
                ai.actionCooldown = 5;
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 20) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickJadeDragonPunch(distance);
                ai.comboIndex = -1;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 4;
                        } else {
                            // Mix of continuing and retreating
                            if (Math.random() < 0.4) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = combos[comboIdx].length;
                                ai.actionCooldown = 4;
                            } else if (Math.random() < 0.5) {
                                ai.currentAction = 'retreat';
                                ai.actionTimer = 0;
                                ai.actionCooldown = 3;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickJadeDragonPunch(distance);
                                ai.actionCooldown = 4;
                            }
                        }
                    } else {
                        ai.nextPunch = pickJadeDragonPunch(distance);
                        ai.actionCooldown = 4;
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickJadeDragonPunch(distance);
                ai.actionCooldown = 3;
            }

            if (ai.actionTimer > 30) {
                ai.currentAction = Math.random() < 0.5 ? 'approach' : 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 8) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 5 || !isPlayerPunching) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                ai.actionCooldown = 2;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickJadeDragonPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.25) return 'jab';
        if (roll < 0.5) return 'cross';
        if (roll < 0.75) return 'hook';
        return 'uppercut';
    } else {
        if (roll < 0.4) return 'jab';
        if (roll < 0.7) return 'cross';
        return 'hook';
    }
}

// ============================================================
// SILVER VIPER — Speed/Evasion, low aggression, retreats after quick strikes
// ============================================================
function updateSilverViperAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('silver_viper');
    let hitsLanded = 0;

    // Silver Viper has low block rate (15%) — prefers retreat over blocking
    if (isPlayerPunching && isInRange && Math.random() < 0.15) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    } else if (isPlayerPunching && isInRange && Math.random() < 0.4) {
        // Prefers retreat over blocking
        ai.currentAction = 'retreat';
        ai.actionTimer = 0;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (distance > 55) {
                    ai.currentAction = 'approach';
                } else if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.7) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = 12;
                    } else {
                        ai.nextPunch = pickSilverViperPunch(distance);
                        ai.comboIndex = -1;
                    }
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            if (distance > 55) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.1) {
                punch = 'jab';
                ai.actionCooldown = 3 + Math.floor(Math.random() * 3); // 3-5 frames
            }

            if (distance < 48 && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 12;
                ai.actionTimer = 0;
                hitsLanded = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;
                    hitsLanded++;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 3 + Math.floor(Math.random() * 3); // 3-5 frames
                        } else {
                            // After combo, retreat (Silver Viper retreats after 2-3 punches)
                            ai.nextPunch = null;
                            ai.comboIndex = -1;
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 3;
                        }
                    } else {
                        // Retreat after landing 2+ hits
                        if (hitsLanded >= 2 || Math.random() < 0.5) {
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 3;
                        } else {
                            ai.nextPunch = pickSilverViperPunch(distance);
                            ai.actionCooldown = 3 + Math.floor(Math.random() * 3);
                        }
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickSilverViperPunch(distance);
                ai.actionCooldown = 3;
            }

            if (ai.actionTimer > 25) {
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = 'approach';
                ai.nextPunch = pickSilverViperPunch(distance);
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 10) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 4 || !isPlayerPunching) {
                // After blocking, retreat rather than counter
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
                ai.actionCooldown = 2;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickSilverViperPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.50) return 'jab';
        if (roll < 0.80) return 'cross';
        if (roll < 0.95) return 'hook';
        return 'uppercut';
    } else {
        if (roll < 0.55) return 'jab';
        if (roll < 0.85) return 'cross';
        if (roll < 0.95) return 'hook';
        return 'uppercut';
    }
}

// ============================================================
// NIGHT CRANE — Counter-Puncher, very patient, highest block rate
// ============================================================
function updateNightCraneAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('night_crane');

    // Night Crane has highest block rate — 55%
    if (isPlayerPunching && isInRange && Math.random() < 0.55) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 5) {
                if (distance > 50) {
                    ai.currentAction = 'approach';
                } else if (isPlayerPunching || isPlayerHit) {
                    // Counter-puncher: attack when opponent is punching or hit
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.7) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = 15;
                    } else {
                        ai.nextPunch = pickNightCranePunch(distance);
                        ai.comboIndex = -1;
                    }
                } else if (isInRange) {
                    // In range but opponent idle — block and wait
                    ai.currentAction = 'block';
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            if (distance > 50) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            // Counter-puncher: if opponent starts punching while approaching, counter
            if (isPlayerPunching && isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 15;
                ai.actionTimer = 0;
                break;
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                break;
            }

            // Very patient — rarely initiates
            if (isInRange && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickNightCranePunch(distance);
                ai.comboIndex = -1;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 6 + Math.floor(Math.random() * 5); // 6-10 frames
                        } else {
                            // After combo, go back to waiting (block)
                            ai.comboIndex = -1;
                            ai.nextPunch = null;
                            ai.currentAction = 'block';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 6;
                        }
                    } else {
                        // Single punch, then return to blocking/waiting
                        ai.currentAction = 'block';
                        ai.actionTimer = 0;
                        ai.actionCooldown = 6 + Math.floor(Math.random() * 5);
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            // Counter-attack when player is punching or hit
            if ((isPlayerPunching || isPlayerHit) && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickNightCranePunch(distance);
                ai.actionCooldown = 6 + Math.floor(Math.random() * 5);
            }

            if (ai.actionTimer > 30) {
                ai.currentAction = 'block';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            // Night Crane never retreats — stands ground and blocks
            ai.currentAction = 'block';
            ai.actionTimer = 0;
            break;

        case 'block':
            block = true;
            // Counter-attack after blocking a punch
            if (!isPlayerPunching && ai.actionTimer > 3) {
                if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = 15;
                    ai.actionTimer = 0;
                    ai.actionCooldown = 6;
                } else {
                    ai.currentAction = 'idle';
                    ai.actionTimer = 0;
                }
            }
            if (ai.actionTimer > 12) {
                ai.currentAction = 'idle';
                ai.actionTimer = 0;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickNightCranePunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.40) return 'cross';
        if (roll < 0.65) return 'uppercut';
        if (roll < 0.85) return 'hook';
        return 'jab';
    } else {
        if (roll < 0.40) return 'cross';
        if (roll < 0.75) return 'jab';
        if (roll < 0.90) return 'hook';
        return 'uppercut';
    }
}

// ============================================================
// GHOST MONKEY — Wild Card, randomly switches between aggressive and passive
// ============================================================
function updateGhostMonkeyAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    // Initialize Ghost Monkey mode tracking
    if (ai.ghostMonkeyModeTimer === undefined) {
        ai.ghostMonkeyModeTimer = 0;
        ai.ghostMonkeyAggressive = Math.random() < 0.5;
    }
    ai.ghostMonkeyModeTimer!++;

    // Every ~90 frames (60-120), randomly switch between aggressive and passive
    if (ai.ghostMonkeyModeTimer! >= 60 + Math.floor(Math.random() * 61)) {
        ai.ghostMonkeyAggressive = Math.random() < 0.5;
        ai.ghostMonkeyModeTimer = 0;
    }

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('ghost_monkey');
    const isAggressive = ai.ghostMonkeyAggressive!;

    // 20% block rate
    if (isPlayerPunching && isInRange && Math.random() < 0.20) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 2) {
                if (isAggressive) {
                    ai.currentAction = 'approach';
                } else {
                    // Passive mode — sometimes retreat randomly
                    if (Math.random() < 0.4) {
                        ai.currentAction = 'retreat';
                    } else if (isInRange && ai.actionCooldown <= 0) {
                        ai.currentAction = 'attack';
                        ai.nextPunch = pickGhostMonkeyPunch();
                        ai.comboIndex = -1;
                    } else {
                        ai.currentAction = 'block';
                    }
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            // Random poke while approaching
            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.12) {
                punch = pickGhostMonkeyPunch();
                ai.actionCooldown = 2 + Math.floor(Math.random() * 7); // 2-8 frames
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                if (Math.random() < 0.7) {
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = 8 + Math.floor(Math.random() * 13); // 8-20 frames
                } else {
                    ai.nextPunch = pickGhostMonkeyPunch();
                    ai.comboIndex = -1;
                }
                ai.actionTimer = 0;
            }

            // In passive mode, might randomly retreat
            if (!isAggressive && Math.random() < 0.05) {
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 2 + Math.floor(Math.random() * 7); // 2-8 frames
                        } else {
                            // After combo, randomly decide next action
                            if (Math.random() < 0.3) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = 8 + Math.floor(Math.random() * 13);
                            } else if (Math.random() < 0.5) {
                                ai.currentAction = 'retreat';
                                ai.actionTimer = 0;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickGhostMonkeyPunch();
                            }
                            ai.actionCooldown = 2 + Math.floor(Math.random() * 7);
                        }
                    } else {
                        if (Math.random() < 0.5) {
                            ai.nextPunch = pickGhostMonkeyPunch();
                            ai.actionCooldown = 2 + Math.floor(Math.random() * 7);
                        } else {
                            ai.currentAction = Math.random() < 0.5 ? 'retreat' : 'approach';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 2 + Math.floor(Math.random() * 7);
                        }
                    }
                } else if (!isInRange) {
                    ai.currentAction = isAggressive ? 'approach' : 'retreat';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickGhostMonkeyPunch();
                ai.actionCooldown = 2 + Math.floor(Math.random() * 4);
            }

            if (ai.actionTimer > 25) {
                ai.currentAction = Math.random() < 0.5 ? 'approach' : 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = isAggressive ? 'attack' : 'block';
                ai.nextPunch = pickGhostMonkeyPunch();
                ai.actionTimer = 0;
            }
            // Random duration retreat
            if (ai.actionTimer > 5 + Math.floor(Math.random() * 8)) {
                ai.currentAction = isAggressive ? 'approach' : 'idle';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 5 || !isPlayerPunching) {
                if (isAggressive) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                } else {
                    ai.currentAction = Math.random() < 0.5 ? 'retreat' : 'idle';
                }
                ai.actionTimer = 0;
                ai.actionCooldown = 2 + Math.floor(Math.random() * 4);
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickGhostMonkeyPunch(): PunchType {
    // Completely random — equal distribution
    const roll = Math.random();
    if (roll < 0.25) return 'jab';
    if (roll < 0.50) return 'cross';
    if (roll < 0.75) return 'hook';
    return 'uppercut';
}

// ============================================================
// BLACK TORTOISE — Stamina/Attrition, never retreats, steady pressure
// ============================================================
function updateBlackTortoiseAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('black_tortoise');

    // Black Tortoise blocks frequently when attacked — 45%
    if (isPlayerPunching && isInRange && Math.random() < 0.45) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    // Always press forward — never retreats
    if (!isInRange) {
        moveDir = player.x > opponent.x ? 1 : -1;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.7) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = 10;
                    } else {
                        ai.nextPunch = pickBlackTortoisePunch(distance);
                        ai.comboIndex = -1;
                    }
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (distance < 55 && distance > 38 && ai.actionCooldown <= 0 && Math.random() < 0.12) {
                punch = 'jab';
                ai.actionCooldown = 4 + Math.floor(Math.random() * 4); // 4-7 frames
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 10;
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 25) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickBlackTortoisePunch(distance);
                ai.comboIndex = -1;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 4 + Math.floor(Math.random() * 4); // 4-7 frames
                        } else {
                            // Steady pressure — keep attacking or start new combo
                            if (Math.random() < 0.5) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = 10;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickBlackTortoisePunch(distance);
                            }
                            ai.actionCooldown = 4 + Math.floor(Math.random() * 4);
                        }
                    } else {
                        ai.nextPunch = pickBlackTortoisePunch(distance);
                        ai.actionCooldown = 4 + Math.floor(Math.random() * 4);
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerPunching && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                // Trades hits rather than retreating
                punch = pickBlackTortoisePunch(distance);
                ai.actionCooldown = 4;
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.5 ? 'hook' : 'cross';
                ai.actionCooldown = 4;
            }

            if (ai.actionTimer > 35) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            // Black Tortoise NEVER retreats — always presses forward
            ai.currentAction = 'approach';
            ai.actionTimer = 0;
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 6 || !isPlayerPunching) {
                // Resumes pressure immediately after blocking
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 10;
                ai.actionTimer = 0;
                ai.actionCooldown = 2;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickBlackTortoisePunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.35) return 'jab';
        if (roll < 0.65) return 'cross';
        if (roll < 0.90) return 'hook';
        return 'uppercut';
    } else {
        if (roll < 0.40) return 'jab';
        if (roll < 0.75) return 'cross';
        if (roll < 0.95) return 'hook';
        return 'uppercut';
    }
}

// ============================================================
// IRON BULL — Close-Range Grappler, high aggression, heavy punches
// ============================================================
function updateIronBullAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const isVeryClose = distance < 30;
    const combos = getCombos('iron_bull');

    // Low block rate — 25%, prefers trading hits
    if (isPlayerPunching && isInRange && Math.random() < 0.25) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    // Always press forward — marches straight at opponent
    if (!isInRange) {
        moveDir = player.x > opponent.x ? 1 : -1;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 2) {
                if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.75) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = 12;
                    } else {
                        ai.nextPunch = pickIronBullPunch(distance);
                        ai.comboIndex = -1;
                    }
                } else {
                    ai.currentAction = 'approach';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                punch = Math.random() < 0.5 ? 'cross' : 'hook';
                ai.actionCooldown = 5 + Math.floor(Math.random() * 4); // 5-8 frames
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 12;
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 20) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickIronBullPunch(distance);
                ai.comboIndex = -1;
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    // When very close, heavily favor hooks and uppercuts
                    if (isVeryClose && ai.comboIndex < 0) {
                        punch = Math.random() < 0.5 ? 'hook' : 'uppercut';
                    } else {
                        punch = ai.nextPunch;
                    }

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 5 + Math.floor(Math.random() * 4); // 5-8 frames
                        } else {
                            // Keep pressing — start new combo or throw singles
                            if (Math.random() < 0.5) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = 12;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickIronBullPunch(distance);
                            }
                            ai.actionCooldown = 5 + Math.floor(Math.random() * 4);
                        }
                    } else {
                        ai.nextPunch = pickIronBullPunch(distance);
                        ai.actionCooldown = 5 + Math.floor(Math.random() * 4);
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            // Trades hits rather than retreating
            if (isPlayerPunching && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = isVeryClose ? (Math.random() < 0.6 ? 'hook' : 'uppercut') : pickIronBullPunch(distance);
                ai.actionCooldown = 5;
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.5 ? 'uppercut' : 'hook';
                ai.actionCooldown = 5;
            }

            if (ai.actionTimer > 35) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            // Iron Bull NEVER retreats — always presses forward
            ai.currentAction = 'approach';
            ai.actionTimer = 0;
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 4 || !isPlayerPunching) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                ai.actionCooldown = 2;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickIronBullPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.35) return 'hook';
        if (roll < 0.65) return 'uppercut';
        if (roll < 0.90) return 'cross';
        return 'jab';
    } else {
        if (roll < 0.35) return 'cross';
        if (roll < 0.65) return 'hook';
        if (roll < 0.90) return 'jab';
        return 'uppercut';
    }
}

// ============================================================
// SMOKE LEOPARD — Ranged Poker, keeps distance, pokes with jabs
// ============================================================
function updateSmokeLeopardAI(
    ai: AIState, opponent: Fighter, player: Fighter,
): { moveDir: number; punch: PunchType | null; block: boolean } {
    let moveDir = 0;
    let punch: PunchType | null = null;
    let block = false;

    if (ai.actionCooldown > 0) ai.actionCooldown--;
    if (ai.patternCooldown > 0) ai.patternCooldown--;
    ai.actionTimer++;

    const distance = Math.abs(opponent.x - player.x);
    const isPlayerPunching = player.state === 'punching';
    const isPlayerHit = player.state === 'hit' || player.state === 'stunned';
    const isInRange = distance < 42;
    const combos = getCombos('smoke_leopard');

    // 30% block rate
    if (isPlayerPunching && isInRange && Math.random() < 0.30) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    // Retreat if opponent closes to < 40
    if (distance < 40 && ai.currentAction !== 'block' && ai.currentAction !== 'attack') {
        ai.currentAction = 'retreat';
        ai.actionTimer = 0;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (distance > 65) {
                    ai.currentAction = 'approach';
                } else if (distance < 40) {
                    ai.currentAction = 'retreat';
                } else if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.65) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = 10;
                    } else {
                        ai.nextPunch = pickSmokeLeopardPunch(distance);
                        ai.comboIndex = -1;
                    }
                } else {
                    // Stay at range and poke
                    if (distance < 55 && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                        punch = 'jab';
                        ai.actionCooldown = 3 + Math.floor(Math.random() * 4); // 3-6 frames
                    }
                    ai.currentAction = distance > 50 ? 'idle' : 'retreat';
                }
                ai.actionTimer = 0;
            }
            break;

        case 'approach':
            // Only approach if opponent is far away (> 65)
            if (distance > 65) {
                moveDir = player.x > opponent.x ? 1 : -1;
            } else if (distance < 40) {
                // Too close — retreat
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
                break;
            }

            // Poke with jabs at medium range
            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                punch = 'jab';
                ai.actionCooldown = 3 + Math.floor(Math.random() * 4);
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = 10;
                ai.actionTimer = 0;
            }

            // If distance is comfortable (50-65), just idle and poke
            if (distance > 50 && distance <= 65) {
                ai.currentAction = 'idle';
                ai.actionTimer = 0;
            }
            break;

        case 'attack':
            if (!isInRange) {
                moveDir = player.x > opponent.x ? 1 : -1;
            }

            if (ai.actionCooldown <= 0 && opponent.state === 'idle') {
                if (ai.nextPunch && isInRange) {
                    punch = ai.nextPunch;

                    if (ai.comboIndex >= 0) {
                        const currentCombo = combos.find(cb => cb[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 3 + Math.floor(Math.random() * 4); // 3-6 frames
                        } else {
                            // After combo, retreat to maintain distance
                            ai.nextPunch = null;
                            ai.comboIndex = -1;
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 3;
                        }
                    } else {
                        // Single punch then retreat
                        ai.currentAction = 'retreat';
                        ai.actionTimer = 0;
                        ai.actionCooldown = 3 + Math.floor(Math.random() * 4);
                    }
                } else if (!isInRange) {
                    ai.currentAction = distance > 65 ? 'approach' : 'idle';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickSmokeLeopardPunch(distance);
                ai.actionCooldown = 3;
            }

            if (ai.actionTimer > 20) {
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            // Poke while retreating
            if (isInRange && ai.actionCooldown <= 0 && Math.random() < 0.2) {
                punch = 'jab';
                ai.actionCooldown = 3 + Math.floor(Math.random() * 4);
            }

            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickSmokeLeopardPunch(distance);
                ai.actionTimer = 0;
            }
            // Retreat until distance > 50 (preferred range)
            if (distance > 50) {
                ai.currentAction = 'idle';
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 12) {
                ai.currentAction = 'idle';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 4 || !isPlayerPunching) {
                // After blocking, retreat to regain distance
                ai.currentAction = 'retreat';
                ai.actionTimer = 0;
                ai.actionCooldown = 2;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickSmokeLeopardPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.40) return 'jab';
        if (roll < 0.70) return 'cross';
        if (roll < 0.90) return 'hook';
        return 'uppercut';
    } else {
        if (roll < 0.55) return 'jab';
        if (roll < 0.90) return 'cross';
        if (roll < 0.98) return 'hook';
        return 'uppercut';
    }
}
