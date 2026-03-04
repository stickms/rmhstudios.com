// ============================================================
// Pixel Art Sprite System — Draws fighters programmatically
// ============================================================

import { CANVAS_HEIGHT, CANVAS_WIDTH, Fighter, FighterState, GROUND_Y } from './fighters/types';

// Each sprite is a grid of pixel colors. null = transparent.
type SpriteFrame = (string | null)[][];

/**
 * Draw a fighter sprite onto the canvas context.
 */
export function drawFighter(
    ctx: CanvasRenderingContext2D,
    fighter: Fighter,
    frame: number,
): void {
    const sprite = getFighterSprite(fighter, frame);
    const pixelSize = 2;
    const spriteWidth = sprite[0].length * pixelSize;
    const spriteHeight = sprite.length * pixelSize;

    ctx.save();

    // Flip horizontally if facing left (mirror around fighter center)
    if (!fighter.facingRight) {
        ctx.translate(fighter.x, 0);
        ctx.scale(-1, 1);
        ctx.translate(-fighter.x, 0);
    }

    // Hit recoil wobble — shake the sprite when hit or stunned
    const isHit = fighter.state === 'hit' || fighter.state === 'stunned';
    let offsetX = 0;
    let offsetY = 0;
    if (isHit && fighter.stateFrame < 8) {
        const intensity = 1 - fighter.stateFrame / 8;
        offsetX = Math.sin(fighter.stateFrame * 2.5) * 3 * intensity;
        offsetY = Math.abs(Math.cos(fighter.stateFrame * 3)) * 2 * intensity;
    }

    const drawX = fighter.x - spriteWidth / 2 + offsetX;
    const drawY = fighter.y - spriteHeight + offsetY;

    // White flash overlay on first few frames of being hit
    const flashWhite = isHit && fighter.stateFrame < 3;

    for (let row = 0; row < sprite.length; row++) {
        for (let col = 0; col < sprite[row].length; col++) {
            const color = sprite[row][col];
            if (color) {
                ctx.fillStyle = flashWhite ? '#ffffff' : color;
                ctx.fillRect(
                    drawX + col * pixelSize,
                    drawY + row * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }
        }
    }

    // Neon hit glow around fighter when freshly hit
    if (isHit && fighter.stateFrame < 6) {
        const glowAlpha = 0.6 * (1 - fighter.stateFrame / 6);
        ctx.globalAlpha = glowAlpha;
        ctx.shadowColor = '#ff3366';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX - 2, drawY - 2, spriteWidth + 4, spriteHeight + 4);
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

/**
 * Get the appropriate sprite for the fighter's current state
 */
function getFighterSprite(fighter: Fighter, frame: number): SpriteFrame {
    const c = fighter.spriteColor;
    const a = fighter.spriteAccentColor;
    const skin = '#ffd5a0';
    const hair = '#1a1a2e';
    const shorts = fighter.spriteColor;
    const glove = fighter.spriteAccentColor;
    const outline = '#0a0a0f';
    const shoe = '#2a2a3e';
    const _ = null; // transparent

    switch (fighter.state) {
        case 'punching':
            return getPunchingSprite(fighter, skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'blocking':
            return getBlockingSprite(fighter, skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'hit':
        case 'stunned':
            return getHitSprite(fighter, skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'knockedOut':
            return getKnockoutSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        default:
            return getIdleSprite(fighter, skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
    }
}

function getIdleSprite(
    fighter: Fighter,
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    // Subclass-specific idle sprites
    switch (fighter.className) {
        case 'power_stone_tiger':
            return getStoneTigerIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'power_red_phoenix':
            return getRedPhoenixIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'power_jade_dragon':
            return getJadeDragonIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
    }
    // Breathing animation — slight bob on even frames
    const bob = Math.floor(frame / 15) % 2 === 0;

    // 20x32 pixel fighter in idle stance
    return [
        // Hair/head top
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        // Face
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Shoulders + body top
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        // Arms + torso
        [_, _, glove, glove, skin, skin, c, c, c, c, c, c, c, c, skin, skin, glove, glove, _, _],
        [_, _, glove, glove, skin, skin, c, c, c, c, c, c, c, c, skin, skin, glove, glove, _, _],
        [_, _, glove, glove, _, _, c, c, c, c, c, c, c, c, _, _, glove, glove, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Legs
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Shoes
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getPunchingSprite(
    fighter: Fighter,
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const punchType = fighter.currentPunch?.type || 'jab';

    // Head rows — shared base, uppercut modifies to show fist going up
    const headRows: SpriteFrame = [
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ];

    // Shoulder rows — shared base, uppercut modifies to show arm going up
    const shoulderRows: SpriteFrame = [
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _, _, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _, _, _, _, _],
    ];

    if (punchType === 'uppercut') {
        // Glove above head, arm travels upward on the right side
        headRows[0] = [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, glove, glove, _, _, _, _, _, _, _, _];
        headRows[1] = [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, glove, glove, _, _, _, _, _, _, _, _];
        headRows[2] = [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, skin, _, _, _, _, _, _, _, _, _];
        headRows[3] = [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, skin, _, _, _, _, _, _, _, _, _];
        shoulderRows[0] = [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, skin, _, _, _, _, _, _, _, _, _];
        shoulderRows[1] = [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, skin, _, _, _, _, _, _, _, _, _];
    }

    // Arm rows differ by punch type
    let armRows: SpriteFrame;

    switch (punchType) {
        case 'jab':
            armRows = [
                [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, skin, skin, skin, _, _, _, _, _, _],
                [_, _, glove, glove, skin, skin, c, c, c, c, c, c, c, c, _, _, skin, skin, glove, glove, _, _, _, _, _],
                [_, _, glove, glove, _, _, c, c, c, c, c, c, c, c, _, _, _, _, glove, glove, _, _, _, _, _],
            ];
            break;
        case 'cross':
            armRows = [
                [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, skin, skin, skin, skin, _, _, _, _, _],
                [_, _, _, _, _, _, c, c, c, c, c, c, c, c, glove, glove, skin, skin, skin, skin, skin, skin, glove, glove, glove],
                [_, _, _, _, _, _, c, c, c, c, c, c, c, c, glove, glove, _, _, _, _, _, _, glove, glove, glove],
            ];
            break;
        case 'hook':
            armRows = [
                [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, skin, _, _, _, _, _, _, _, _],
                [_, _, glove, glove, skin, skin, c, c, c, c, c, c, c, c, _, _, skin, _, _, _, _, _, _, _, _],
                [_, _, glove, glove, _, _, c, c, c, c, c, c, c, c, _, _, skin, glove, glove, glove, _, _, _, _, _],
            ];
            break;
        case 'uppercut':
        default:
            armRows = [
                [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, skin, _, _, _, _, _, _, _, _],
                [_, _, glove, glove, skin, skin, c, c, c, c, c, c, c, c, _, _, skin, _, _, _, _, _, _, _, _],
                [_, _, glove, glove, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _, _, _, _],
            ];
            break;
    }

    // Lower body — same for all punches
    const lowerBody: SpriteFrame = [
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _, _, _, _, _, _],
    ];

    return [...headRows, ...shoulderRows, ...armRows, ...lowerBody];
}

function getBlockingSprite(
    fighter: Fighter,
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    // Subclass-specific blocking sprites
    switch (fighter.className) {
        case 'power_stone_tiger':
            return getStoneTigerBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'power_red_phoenix':
            return getRedPhoenixBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'power_jade_dragon':
            return getJadeDragonBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
    }
    // Gloves up, guard position
    return [
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, glove, glove, skin, outline, skin, skin, skin, skin, outline, skin, glove, glove, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, skin, skin, skin, skin, skin, skin, glove, glove, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, skin, outline, outline, skin, skin, skin, glove, glove, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, skin, skin, skin, skin, skin, skin, glove, glove, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, skin, skin, c, c, c, c, c, c, c, c, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getHitSprite(
    fighter: Fighter,
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    // Subclass-specific hit sprites
    switch (fighter.className) {
        case 'power_stone_tiger':
            return getStoneTigerHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'power_red_phoenix':
            return getRedPhoenixHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'power_jade_dragon':
            return getJadeDragonHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
    }
    // Recoiling — leaning back
    return [
        [_, _, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, glove, glove, skin, c, c, c, c, c, c, c, c, skin, glove, glove, _, _, _],
        [_, _, _, glove, glove, _, c, c, c, c, c, c, c, c, _, glove, glove, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getKnockoutSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    // Lying on the ground — horizontal sprite
    return [
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [glove, glove, hair, hair, hair, outline, skin, skin, c, c, c, c, c, a, shorts, shorts, skin, skin, shoe, shoe],
        [glove, glove, skin, skin, skin, outline, skin, skin, c, c, c, c, c, a, shorts, shorts, skin, skin, shoe, shoe],
        [_, _, skin, skin, skin, skin, skin, skin, c, c, c, c, c, a, shorts, skin, skin, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ];
}

// ============================================================
// STONE TIGER — Stocky wide build, headband, wrapped fists
// ============================================================

function getStoneTigerIdleSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const band = a; // headband color
    const wrap = '#ddccaa'; // hand wraps instead of gloves
    return [
        // Headband + head (wider)
        [_, _, _, _, _, _, band, band, band, band, band, band, band, band, _, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, skin, skin, outline, skin, skin, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Short thick neck
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        // Wide shoulders + massive torso
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        // Thick arms + torso
        [_, wrap, wrap, skin, skin, c, c, c, c, c, c, c, c, c, c, skin, skin, wrap, wrap, _, _],
        [_, wrap, wrap, skin, skin, c, c, c, c, c, c, c, c, c, c, skin, skin, wrap, wrap, _, _],
        [_, wrap, wrap, _, _, c, c, c, c, c, c, c, c, c, c, _, _, wrap, wrap, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, a, a, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts (wider)
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        // Thick legs
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Shoes
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getStoneTigerBlockSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const band = a;
    const wrap = '#ddccaa';
    return [
        [_, _, _, _, _, _, band, band, band, band, band, band, band, band, _, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, wrap, wrap, skin, outline, skin, skin, skin, skin, skin, skin, outline, skin, wrap, wrap, _, _, _, _],
        [_, _, _, wrap, wrap, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, wrap, wrap, skin, skin, skin, outline, outline, skin, skin, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, wrap, wrap, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, _, _, skin, skin, c, c, c, c, c, c, c, c, c, c, skin, skin, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, a, a, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getStoneTigerHitSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const band = a;
    const wrap = '#ddccaa';
    return [
        [_, _, _, _, _, _, _, band, band, band, band, band, band, band, band, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, wrap, wrap, skin, skin, c, c, c, c, c, c, c, c, c, c, skin, wrap, wrap, _, _],
        [_, _, wrap, wrap, _, _, c, c, c, c, c, c, c, c, c, c, _, wrap, wrap, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, a, a, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

// ============================================================
// RED PHOENIX — Lean tall build, spiked hair, fingerless gloves
// ============================================================

function getRedPhoenixIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const spikeHair = '#331100'; // dark auburn
    const fglove = a; // fingerless glove color (bright yellow-orange)
    return [
        // Spiked hair — taller, pointed
        [_, _, _, _, _, _, _, _, spikeHair, _, _, spikeHair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _, _, _],
        [_, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _, _],
        // Face (narrower)
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Neck (longer/thinner)
        [_, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Narrow shoulders
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        // Long thin arms + narrow torso
        [_, _, _, fglove, fglove, skin, c, c, c, c, c, c, c, skin, fglove, fglove, _, _, _],
        [_, _, _, fglove, fglove, skin, c, c, c, c, c, c, c, skin, fglove, fglove, _, _, _],
        [_, _, _, fglove, fglove, _, c, c, c, c, c, c, c, _, fglove, fglove, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Long legs
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Shoes
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getRedPhoenixBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const spikeHair = '#331100';
    const fglove = a;
    return [
        [_, _, _, _, _, _, _, _, spikeHair, _, _, spikeHair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _, _, _],
        [_, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, fglove, fglove, skin, outline, skin, skin, outline, skin, skin, fglove, fglove, _, _, _, _],
        [_, _, _, _, fglove, fglove, skin, skin, skin, skin, skin, skin, skin, fglove, fglove, _, _, _, _],
        [_, _, _, _, fglove, fglove, skin, skin, outline, outline, skin, skin, skin, fglove, fglove, _, _, _, _],
        [_, _, _, _, fglove, fglove, _, skin, skin, skin, skin, skin, _, fglove, fglove, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, _, skin, c, c, c, c, c, c, c, skin, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getRedPhoenixHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const spikeHair = '#331100';
    const fglove = a;
    return [
        [_, _, _, _, _, _, _, _, _, spikeHair, _, _, spikeHair, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _, _],
        [_, _, _, _, _, _, _, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, spikeHair, _, _, _, _],
        [_, _, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, outline, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, fglove, fglove, skin, c, c, c, c, c, c, skin, fglove, fglove, _, _, _],
        [_, _, _, _, fglove, fglove, _, c, c, c, c, c, c, _, fglove, fglove, _, _, _],
        [_, _, _, _, _, _, _, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, _, shorts, shorts, shorts, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, shorts, shorts, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, _, shoe, shoe, shoe, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

// ============================================================
// JADE DRAGON — Athletic build, vest/gi, forearm wraps
// ============================================================

function getJadeDragonIdleSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const vest = a; // gold vest trim
    const wrap = '#ccbb88'; // forearm wraps
    return [
        // Tied-back hair
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        // Face
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Shoulders with vest/gi overlay
        [_, _, _, _, outline, vest, c, c, c, c, c, c, c, c, vest, outline, _, _, _, _],
        [_, _, _, outline, vest, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, _, outline, vest, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        // Arms with forearm wraps + gi torso
        [_, _, wrap, wrap, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, wrap, wrap, _, _],
        [_, _, wrap, wrap, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, wrap, wrap, _, _],
        [_, _, wrap, wrap, _, _, c, c, c, c, c, c, c, c, _, _, wrap, wrap, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt (gold sash)
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Legs
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Shoes
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getJadeDragonBlockSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const vest = a;
    const wrap = '#ccbb88';
    return [
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, wrap, wrap, skin, outline, skin, skin, skin, skin, outline, skin, wrap, wrap, _, _, _, _],
        [_, _, _, _, wrap, wrap, skin, skin, skin, skin, skin, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, _, wrap, wrap, skin, skin, skin, outline, outline, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, _, wrap, wrap, skin, skin, skin, skin, skin, skin, skin, skin, wrap, wrap, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, outline, vest, c, c, c, c, c, c, c, c, vest, outline, _, _, _, _],
        [_, _, _, outline, vest, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, _, outline, vest, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, _, _, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

function getJadeDragonHitSprite(
    skin: string, hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const vest = a;
    const wrap = '#ccbb88';
    return [
        [_, _, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _, _],
        [_, _, _, _, _, _, hair, hair, hair, hair, hair, hair, hair, hair, hair, hair, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, vest, c, c, c, c, c, c, c, vest, outline, _, _, _, _],
        [_, _, _, _, outline, vest, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, _, _, outline, vest, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, _, wrap, wrap, skin, vest, c, c, c, c, c, c, vest, skin, wrap, wrap, _, _, _],
        [_, _, _, wrap, wrap, _, c, c, c, c, c, c, c, c, _, wrap, wrap, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

/**
 * Draw a simple neon glow effect around a color
 */
export function drawNeonGlow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    width: number, height: number,
    color: string, intensity: number = 0.5
): void {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * intensity;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3 * intensity;
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
    ctx.restore();
}

/**
 * Draw hit impact particles — big sparks, impact lines, and flash
 */
export function drawHitParticles(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    frame: number, color: string
): void {
    const maxLife = 15;
    const life = frame % maxLife;

    if (life >= maxLife) return;

    ctx.save();

    // Impact flash — bright circle on first few frames
    if (life < 4) {
        const flashAlpha = 0.9 * (1 - life / 4);
        const flashRadius = 8 + life * 4;
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, flashRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = flashAlpha * 0.6;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, flashRadius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Impact lines — radial slashes
    ctx.globalAlpha = Math.max(0, 1 - life / maxLife);
    const lineCount = 6;
    for (let i = 0; i < lineCount; i++) {
        const angle = (Math.PI * 2 / lineCount) * i + 0.3;
        const innerDist = 4 + life * 2;
        const outerDist = 10 + life * 3.5;

        ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : color;
        ctx.lineWidth = Math.max(0.5, 2 - life * 0.15);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * innerDist, y + Math.sin(angle) * innerDist);
        ctx.lineTo(x + Math.cos(angle) * outerDist, y + Math.sin(angle) * outerDist);
        ctx.stroke();
    }

    // Sparks — scattered pixel particles
    const sparkCount = 8;
    ctx.globalAlpha = Math.max(0, 0.9 - life / maxLife);
    for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 / sparkCount) * i + life * 0.15;
        const dist = life * 4 + i * 1.5;
        const px = x + Math.cos(angle) * dist;
        const py = y + Math.sin(angle) * dist - life * 0.8; // drift upward
        const size = Math.max(1, 3 - life * 0.2);

        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? color : '#ffcc00';
        ctx.fillRect(px, py, size, size);
    }

    ctx.restore();
}
