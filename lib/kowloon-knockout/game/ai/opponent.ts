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
}

// Class-specific combos
const POWER_COMBOS: PunchType[][] = [
    ['cross', 'hook'],
    ['jab', 'cross', 'hook'],
    ['hook', 'uppercut'],
    ['cross', 'hook', 'uppercut'],
    ['jab', 'uppercut'],
];

const SPEED_COMBOS: PunchType[][] = [
    ['jab', 'jab', 'cross'],
    ['jab', 'cross', 'jab'],
    ['jab', 'jab', 'jab', 'cross'],
    ['jab', 'cross', 'hook'],
    ['cross', 'jab', 'cross'],
];

const RESISTANCE_COMBOS: PunchType[][] = [
    ['jab', 'cross'],
    ['cross', 'hook'],
    ['jab', 'jab', 'cross'],
    ['jab', 'cross', 'hook'],
    ['hook', 'cross'],
];

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

function getCombos(fighterClass: FighterClass): PunchType[][] {
    switch (fighterClass) {
        case 'power': return POWER_COMBOS;
        case 'speed': return SPEED_COMBOS;
        case 'resistance': return RESISTANCE_COMBOS;
        case 'power_stone_tiger': return STONE_TIGER_COMBOS;
        case 'power_red_phoenix': return RED_PHOENIX_COMBOS;
        case 'power_jade_dragon': return JADE_DRAGON_COMBOS;
    }
}

export function createAIState(difficulty: number = 0.5, fighterClass: FighterClass = 'power'): AIState {
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
        case 'power': return updatePowerAI(ai, opponent, player);
        case 'speed': return updateSpeedAI(ai, opponent, player);
        case 'resistance': return updateResistanceAI(ai, opponent, player);
        case 'power_stone_tiger': return updateStoneTigerAI(ai, opponent, player);
        case 'power_red_phoenix': return updateRedPhoenixAI(ai, opponent, player);
        case 'power_jade_dragon': return updateJadeDragonAI(ai, opponent, player);
    }
}

// ============================================================
// POWER — Relentless brawler, charges in and unloads
// ============================================================
function updatePowerAI(
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
    const combos = getCombos('power');

    // Power rarely blocks — only when very low health
    const lowHealth = opponent.health / opponent.stats.maxHealth < 0.2;
    if (isPlayerPunching && isInRange && lowHealth && Math.random() < 0.2) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    // Always press forward — power never stops advancing
    if (!isInRange) {
        moveDir = player.x > opponent.x ? 1 : -1;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                if (Math.random() < 0.8) {
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = combos[comboIdx].length;
                } else {
                    ai.nextPunch = pickPowerPunch(distance);
                    ai.comboIndex = -1;
                }
            } else {
                ai.currentAction = 'approach';
            }
            ai.actionTimer = 0;
            break;

        case 'approach':
            moveDir = player.x > opponent.x ? 1 : -1;

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.12) {
                punch = Math.random() < 0.6 ? 'jab' : 'cross';
                ai.actionCooldown = 6;
            }

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
                        const currentCombo = combos.find(c => c[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 4;
                        } else {
                            if (Math.random() < 0.45) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = combos[comboIdx].length;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickPowerPunch(distance);
                            }
                            ai.actionCooldown = 4;
                        }
                    } else {
                        ai.nextPunch = pickPowerPunch(distance);
                        ai.actionCooldown = 4;
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.5 ? 'uppercut' : 'hook';
                ai.actionCooldown = 3;
            }

            if (ai.actionTimer > 35) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
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

function pickPowerPunch(distance: number): PunchType {
    if (distance < 32) {
        const roll = Math.random();
        if (roll < 0.20) return 'uppercut';
        if (roll < 0.40) return 'hook';
        if (roll < 0.70) return 'cross';
        return 'jab';
    } else {
        const roll = Math.random();
        if (roll < 0.35) return 'jab';
        if (roll < 0.65) return 'cross';
        if (roll < 0.85) return 'hook';
        return 'uppercut';
    }
}

// ============================================================
// SPEED — Hit-and-run striker, darts in with rapid combos
// ============================================================
function updateSpeedAI(
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
    const combos = getCombos('speed');

    if (isPlayerPunching && isInRange && Math.random() < 0.5) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (isPlayerHit && distance < 65) {
                    ai.currentAction = 'attack';
                    const comboIdx = Math.floor(Math.random() * combos.length);
                    ai.comboIndex = 0;
                    ai.nextPunch = combos[comboIdx][0];
                    ai.patternCooldown = combos[comboIdx].length;
                } else if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.75) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                    } else {
                        ai.nextPunch = pickSpeedPunch(distance);
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

            if (distance < 55 && distance > 36 && ai.actionCooldown <= 0 && Math.random() < 0.1) {
                punch = 'jab';
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
                ai.nextPunch = pickSpeedPunch(distance);
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
                        const currentCombo = combos.find(c => c[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 3;
                        } else {
                            if (Math.random() < 0.45) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = combos[comboIdx].length;
                                ai.actionCooldown = 3;
                            } else {
                                ai.nextPunch = null;
                                ai.comboIndex = -1;
                                ai.currentAction = 'retreat';
                                ai.actionTimer = 0;
                                ai.actionCooldown = 3;
                            }
                        }
                    } else {
                        if (Math.random() < 0.6) {
                            ai.nextPunch = pickSpeedPunch(distance);
                            ai.actionCooldown = 4;
                        } else {
                            ai.currentAction = 'retreat';
                            ai.actionTimer = 0;
                            ai.actionCooldown = 3;
                        }
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickSpeedPunch(distance);
                ai.actionCooldown = 2;
            }

            if (ai.actionTimer > 30) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            moveDir = player.x > opponent.x ? -1 : 1;

            if (isPlayerPunching && isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                break;
            }
            if (opponent.x < RING_LEFT + 15 || opponent.x > RING_RIGHT - 15) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickSpeedPunch(distance);
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 8) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 6 || !isPlayerPunching) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.actionTimer = 0;
                ai.actionCooldown = 1;
            }
            break;
    }

    return { moveDir, punch, block };
}

function pickSpeedPunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.4) return 'jab';
        if (roll < 0.7) return 'cross';
        return 'hook';
    } else {
        if (roll < 0.6) return 'jab';
        return 'cross';
    }
}

// ============================================================
// RESISTANCE — Forward-pressing tank, walks you down and trades
// ============================================================
function updateResistanceAI(
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
    const combos = getCombos('resistance');

    if (isPlayerPunching && isInRange && Math.random() < 0.2) {
        ai.currentAction = 'block';
        ai.actionTimer = 0;
        ai.actionCooldown = 2;
    }

    if (!isInRange) {
        moveDir = player.x > opponent.x ? 1 : -1;
    }

    switch (ai.currentAction) {
        case 'idle':
            if (ai.actionTimer > 3) {
                if (isInRange && ai.actionCooldown <= 0) {
                    ai.currentAction = 'attack';
                    if (Math.random() < 0.75) {
                        const comboIdx = Math.floor(Math.random() * combos.length);
                        ai.comboIndex = 0;
                        ai.nextPunch = combos[comboIdx][0];
                        ai.patternCooldown = combos[comboIdx].length;
                    } else {
                        ai.nextPunch = pickResistancePunch(distance);
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

            if (distance < 55 && distance > 38 && ai.actionCooldown <= 0 && Math.random() < 0.15) {
                punch = 'jab';
                ai.actionCooldown = 8;
            }

            if (isInRange && ai.actionCooldown <= 0) {
                ai.currentAction = 'attack';
                const comboIdx = Math.floor(Math.random() * combos.length);
                ai.comboIndex = 0;
                ai.nextPunch = combos[comboIdx][0];
                ai.patternCooldown = combos[comboIdx].length;
                ai.actionTimer = 0;
            }
            if (ai.actionTimer > 25) {
                ai.currentAction = 'attack';
                ai.nextPunch = pickResistancePunch(distance);
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
                        const currentCombo = combos.find(c => c[ai.comboIndex] === ai.nextPunch);
                        if (currentCombo && ai.comboIndex + 1 < currentCombo.length) {
                            ai.comboIndex++;
                            ai.nextPunch = currentCombo[ai.comboIndex];
                            ai.actionCooldown = 4;
                        } else {
                            if (Math.random() < 0.5) {
                                const comboIdx = Math.floor(Math.random() * combos.length);
                                ai.comboIndex = 0;
                                ai.nextPunch = combos[comboIdx][0];
                                ai.patternCooldown = combos[comboIdx].length;
                            } else {
                                ai.comboIndex = -1;
                                ai.nextPunch = pickResistancePunch(distance);
                            }
                            ai.actionCooldown = 5;
                        }
                    } else {
                        ai.nextPunch = pickResistancePunch(distance);
                        ai.actionCooldown = 5;
                    }
                } else if (!isInRange) {
                    ai.currentAction = 'approach';
                    ai.actionTimer = 0;
                }
            }

            if (isPlayerPunching && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = pickResistancePunch(distance);
                ai.actionCooldown = 3;
            }

            if (isPlayerHit && isInRange && ai.actionCooldown <= 0 && opponent.state === 'idle') {
                punch = Math.random() < 0.4 ? 'hook' : 'cross';
                ai.actionCooldown = 3;
            }

            if (ai.actionTimer > 35) {
                ai.currentAction = 'approach';
                ai.actionTimer = 0;
            }
            break;

        case 'retreat':
            ai.currentAction = 'approach';
            ai.actionTimer = 0;
            break;

        case 'block':
            block = true;
            if (ai.actionTimer > 6 || !isPlayerPunching) {
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

function pickResistancePunch(distance: number): PunchType {
    const roll = Math.random();
    if (distance < 32) {
        if (roll < 0.3) return 'hook';
        if (roll < 0.6) return 'cross';
        if (roll < 0.8) return 'jab';
        return 'uppercut';
    } else {
        if (roll < 0.5) return 'jab';
        if (roll < 0.8) return 'cross';
        return 'hook';
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
    const combos = getCombos('power_stone_tiger');

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
    const combos = getCombos('power_red_phoenix');

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
    const combos = getCombos('power_jade_dragon');

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
