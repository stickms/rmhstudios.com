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
        case 'stone_tiger':
            return getStoneTigerIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'red_phoenix':
            return getRedPhoenixIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'jade_dragon':
            return getJadeDragonIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'silver_viper':
            return getSilverViperIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'night_crane':
            return getNightCraneIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'ghost_monkey':
            return getGhostMonkeyIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'black_tortoise':
            return getBlackTortoiseIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'iron_bull':
            return getIronBullIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
        case 'smoke_leopard':
            return getSmokeLeopardIdleSprite(skin, hair, shorts, glove, outline, shoe, c, a, _, frame);
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
        case 'stone_tiger':
            return getStoneTigerBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'red_phoenix':
            return getRedPhoenixBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'jade_dragon':
            return getJadeDragonBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'silver_viper':
            return getSilverViperBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'night_crane':
            return getNightCraneBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'ghost_monkey':
            return getGhostMonkeyBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'black_tortoise':
            return getBlackTortoiseBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'iron_bull':
            return getIronBullBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'smoke_leopard':
            return getSmokeLeopardBlockSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
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
        case 'stone_tiger':
            return getStoneTigerHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'red_phoenix':
            return getRedPhoenixHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'jade_dragon':
            return getJadeDragonHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'silver_viper':
            return getSilverViperHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'night_crane':
            return getNightCraneHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'ghost_monkey':
            return getGhostMonkeyHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'black_tortoise':
            return getBlackTortoiseHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'iron_bull':
            return getIronBullHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
        case 'smoke_leopard':
            return getSmokeLeopardHitSprite(skin, hair, shorts, glove, outline, shoe, c, a, _);
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

// ============================================================
// SILVER VIPER — Slim build, hooded cowl, fingerless gloves, low crouch
// ============================================================

function getSilverViperIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const hood = a; // hooded cowl accent
    return [
        // Hooded cowl trailing back
        [_, _, _, _, _, _, _, _, hood, hood, hood, hood, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, hood, hood, hood, hood, hood, hood, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hood, hood, hood, hood, hood, hood, hood, hood, _, _, _, _, _, _],
        // Head under hood
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, outline, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        // Neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _, _],
        // Narrow shoulders
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, outline, _, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        // Slim arms + torso — wrist wraps
        [_, _, _, a, a, skin, c, c, c, c, c, c, c, c, skin, a, a, _, _, _],
        [_, _, _, a, a, skin, c, c, c, c, c, c, c, c, skin, a, a, _, _, _],
        [_, _, _, a, a, _, c, c, c, c, c, c, c, c, _, a, a, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Legs — low crouch, slightly lower
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Sandals (smaller feet)
        [_, _, _, _, _, _, shoe, shoe, shoe, _, _, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, _, _, shoe, shoe, shoe, _, _, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

function getSilverViperBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const hood = a;
    return [
        [_, _, _, _, _, _, _, _, hood, hood, hood, hood, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, hood, hood, hood, hood, hood, hood, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, hood, hood, hood, hood, hood, hood, hood, hood, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, a, a, skin, outline, skin, skin, outline, skin, a, a, _, _, _, _, _],
        [_, _, _, _, _, a, a, skin, skin, skin, skin, skin, skin, a, a, _, _, _, _, _],
        [_, _, _, _, _, a, a, skin, skin, outline, outline, skin, skin, a, a, _, _, _, _, _],
        [_, _, _, _, _, a, a, skin, skin, skin, skin, skin, skin, a, a, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, outline, _, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, _, skin, c, c, c, c, c, c, c, c, skin, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, shoe, shoe, shoe, _, _, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, _, _, shoe, shoe, shoe, _, _, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

function getSilverViperHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const hood = a;
    return [
        [_, _, _, _, _, _, _, _, _, hood, hood, hood, hood, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, hood, hood, hood, hood, hood, hood, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, hood, hood, hood, hood, hood, hood, hood, hood, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, c, c, c, c, c, c, c, outline, _, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, a, a, skin, c, c, c, c, c, c, c, skin, a, a, _, _, _],
        [_, _, _, _, a, a, _, c, c, c, c, c, c, c, _, a, a, _, _, _],
        [_, _, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, _, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, _, _, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, shoe, shoe, shoe, _, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, shoe, shoe, shoe, _, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

// ============================================================
// NIGHT CRANE — Tall upright, kung fu cap, changshan top, horse stance
// ============================================================

function getNightCraneIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const cap = a; // kung fu cap color
    return [
        // Round flat kung fu cap
        [_, _, _, _, _, _, _, _, cap, cap, cap, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, cap, cap, cap, cap, cap, _, _, _, _, _, _, _, _],
        // Hair under cap
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        // Face
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, outline, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        // Neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Changshan collar — accent trim at neck
        [_, _, _, _, _, outline, a, c, c, c, c, c, c, a, outline, _, _, _, _, _],
        [_, _, _, _, outline, a, c, c, c, c, c, c, c, c, a, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        // Open-hand guard — arms slightly forward
        [_, _, _, skin, skin, skin, c, c, c, c, c, c, c, c, skin, skin, skin, _, _, _],
        [_, _, _, skin, skin, skin, c, c, c, c, c, c, c, c, skin, skin, skin, _, _, _],
        [_, _, _, skin, skin, _, c, c, c, c, c, c, c, c, _, skin, skin, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Wide horse stance — legs wider apart
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, _, _, _, _, _, _, shorts, shorts, shorts, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Shoes
        [_, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _],
    ];
}

function getNightCraneBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const cap = a;
    return [
        [_, _, _, _, _, _, _, _, cap, cap, cap, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, cap, cap, cap, cap, cap, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, outline, skin, skin, outline, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, a, c, c, c, c, c, c, a, outline, _, _, _, _, _],
        [_, _, _, _, outline, a, c, c, c, c, c, c, c, c, a, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, _, skin, c, c, c, c, c, c, c, c, skin, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, _, _, _, _, _, _, shorts, shorts, shorts, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, _, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _, shoe, shoe, shoe, shoe, _, _, _, _],
    ];
}

function getNightCraneHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const cap = a;
    return [
        [_, _, _, _, _, _, _, _, _, cap, cap, cap, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, cap, cap, cap, cap, cap, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _],
        [_, _, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, a, c, c, c, c, c, a, outline, _, _, _, _, _],
        [_, _, _, _, _, outline, a, c, c, c, c, c, c, c, a, outline, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, skin, skin, skin, c, c, c, c, c, c, c, skin, skin, skin, _, _, _],
        [_, _, _, _, skin, skin, _, c, c, c, c, c, c, c, _, skin, skin, _, _, _],
        [_, _, _, _, _, _, _, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, _, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
        [_, _, _, _, _, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, _, _, _, _, _],
    ];
}

// ============================================================
// GHOST MONKEY — Compact hunched, wild spiky hair, chest wraps, bare feet
// ============================================================

function getGhostMonkeyIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const spikeA = c;  // main color spikes
    const spikeB = a;  // accent color spikes
    const torsoSkin = '#e8b878'; // lighter tint for bare torso
    const bigGlove = a; // oversized gloves
    return [
        // Wild spiky hair — 3 rows, wider than head, jagged
        [_, _, _, _, _, spikeA, _, spikeB, _, spikeA, _, spikeB, _, spikeA, _, _, _, _, _, _],
        [_, _, _, _, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, _, _, _, _, _],
        [_, _, _, _, _, spikeA, spikeA, spikeB, spikeA, spikeA, spikeA, spikeB, spikeA, spikeA, _, _, _, _, _, _],
        // Face (compact)
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Short neck (hunched)
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Bare torso with chest wraps
        [_, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, outline, torsoSkin, a, a, a, a, a, a, a, a, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        // Oversized gloves + bare torso
        [_, bigGlove, bigGlove, bigGlove, skin, skin, torsoSkin, a, a, a, a, a, a, torsoSkin, skin, skin, bigGlove, bigGlove, bigGlove, _],
        [_, bigGlove, bigGlove, bigGlove, skin, skin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, skin, skin, bigGlove, bigGlove, bigGlove, _],
        [_, bigGlove, bigGlove, bigGlove, _, _, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, _, _, bigGlove, bigGlove, bigGlove, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Short legs (compact)
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Bare feet (skin-colored, no shoes)
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
    ];
}

function getGhostMonkeyBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const spikeA = c;
    const spikeB = a;
    const torsoSkin = '#e8b878';
    const bigGlove = a;
    return [
        [_, _, _, _, _, spikeA, _, spikeB, _, spikeA, _, spikeB, _, spikeA, _, _, _, _, _, _],
        [_, _, _, _, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, _, _, _, _, _],
        [_, _, _, _, _, spikeA, spikeA, spikeB, spikeA, spikeA, spikeA, spikeB, spikeA, spikeA, _, _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, bigGlove, bigGlove, bigGlove, skin, outline, skin, skin, skin, skin, outline, skin, bigGlove, bigGlove, bigGlove, _, _, _],
        [_, _, _, bigGlove, bigGlove, bigGlove, skin, skin, skin, skin, skin, skin, skin, skin, bigGlove, bigGlove, bigGlove, _, _, _],
        [_, _, _, bigGlove, bigGlove, bigGlove, skin, skin, skin, outline, outline, skin, skin, skin, bigGlove, bigGlove, bigGlove, _, _, _],
        [_, _, _, bigGlove, bigGlove, bigGlove, skin, skin, skin, skin, skin, skin, skin, skin, bigGlove, bigGlove, bigGlove, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, outline, torsoSkin, a, a, a, a, a, a, a, a, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, _, skin, torsoSkin, a, a, a, a, a, a, torsoSkin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
    ];
}

function getGhostMonkeyHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const spikeA = c;
    const spikeB = a;
    const torsoSkin = '#e8b878';
    const bigGlove = a;
    return [
        [_, _, _, _, _, _, spikeA, _, spikeB, _, spikeA, _, spikeB, _, spikeA, _, _, _, _, _],
        [_, _, _, _, _, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, spikeA, spikeB, _, _, _, _],
        [_, _, _, _, _, _, spikeA, spikeA, spikeB, spikeA, spikeA, spikeA, spikeB, spikeA, spikeA, _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, _, outline, torsoSkin, a, a, a, a, a, a, a, torsoSkin, outline, _, _, _, _],
        [_, _, _, _, _, outline, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, outline, _, _, _, _],
        [_, _, bigGlove, bigGlove, bigGlove, skin, torsoSkin, a, a, a, a, a, a, torsoSkin, skin, bigGlove, bigGlove, bigGlove, _, _],
        [_, _, bigGlove, bigGlove, bigGlove, _, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, torsoSkin, _, bigGlove, bigGlove, bigGlove, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, skin, skin, skin, _, _, _, _, _, _],
    ];
}

// ============================================================
// BLACK TORTOISE — Stocky, hunched, shoulder armor, neck guard, heavy boots
// ============================================================

function getBlackTortoiseIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const armor = a; // shoulder armor / accent
    return [
        // Hair/head (wider, shorter)
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        // Face (wider)
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        // Neck guard — accent between head and body
        [_, _, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _, _],
        // Rounded shoulder armor + wide torso
        [_, _, _, armor, armor, c, c, c, c, c, c, c, c, c, c, c, armor, armor, _, _, _],
        [_, _, _, outline, armor, c, c, c, c, c, c, c, c, c, c, c, armor, outline, _, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        // Heavy forearm guards + torso
        [_, armor, armor, armor, skin, c, c, c, c, c, c, c, c, c, c, skin, armor, armor, armor, _, _],
        [_, armor, armor, armor, skin, c, c, c, c, c, c, c, c, c, c, skin, armor, armor, armor, _, _],
        [_, armor, armor, armor, _, c, c, c, c, c, c, c, c, c, c, _, armor, armor, armor, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _, _],
        // Shorts (wider)
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        // Thick legs
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Heavy boots (accent color, bigger)
        [_, _, _, _, armor, armor, armor, armor, armor, _, _, armor, armor, armor, armor, armor, _, _, _, _, _],
        [_, _, _, _, armor, armor, armor, armor, armor, _, _, armor, armor, armor, armor, armor, _, _, _, _, _],
    ];
}

function getBlackTortoiseBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const armor = a;
    return [
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, armor, armor, armor, skin, outline, skin, skin, skin, skin, skin, outline, skin, armor, armor, armor, _, _, _],
        [_, _, _, armor, armor, armor, skin, skin, skin, skin, skin, skin, skin, skin, skin, armor, armor, armor, _, _, _],
        [_, _, _, armor, armor, armor, skin, skin, skin, outline, outline, skin, skin, skin, skin, armor, armor, armor, _, _, _],
        [_, _, _, armor, armor, armor, skin, skin, skin, skin, skin, skin, skin, skin, skin, armor, armor, armor, _, _, _],
        [_, _, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _, _],
        [_, _, _, armor, armor, c, c, c, c, c, c, c, c, c, c, c, armor, armor, _, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, _, _, skin, c, c, c, c, c, c, c, c, c, c, c, skin, _, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, c, c, c, c, c, c, c, c, c, c, c, _, _, _, _, _],
        [_, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, armor, armor, armor, armor, armor, _, _, armor, armor, armor, armor, armor, _, _, _, _, _],
        [_, _, _, _, armor, armor, armor, armor, armor, _, _, armor, armor, armor, armor, armor, _, _, _, _, _],
    ];
}

function getBlackTortoiseHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const armor = a;
    return [
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _],
        [_, _, _, _, armor, armor, c, c, c, c, c, c, c, c, c, c, c, armor, armor, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, armor, armor, armor, skin, c, c, c, c, c, c, c, c, c, skin, armor, armor, armor, _, _],
        [_, _, armor, armor, armor, _, c, c, c, c, c, c, c, c, c, _, armor, armor, armor, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, armor, armor, armor, armor, armor, armor, armor, armor, armor, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, shorts, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, _, _, _, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, armor, armor, armor, armor, armor, _, armor, armor, armor, armor, armor, _, _, _, _, _],
        [_, _, _, _, _, armor, armor, armor, armor, armor, _, armor, armor, armor, armor, armor, _, _, _, _, _],
    ];
}

// ============================================================
// IRON BULL — Widest sprite, bald, nose ring, leather vest, massive forearms
// ============================================================

function getIronBullIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const vest = a; // leather vest trim
    return [
        // Bald head — no hair, just skin
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        // Face with nose ring
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, outline, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, vest, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Thick neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _],
        // Extra-wide shoulders — leather vest with trim
        [_, _, outline, vest, c, c, c, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, outline, vest, c, c, c, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        // Massive forearms + vest torso
        [glove, glove, skin, skin, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, skin, skin, glove, glove, _, _],
        [glove, glove, skin, skin, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, skin, skin, glove, glove, _, _],
        [glove, glove, skin, skin, _, _, c, c, c, c, c, c, c, c, _, _, skin, skin, glove, glove, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _, _, _],
        // Shorts (wider)
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        // Thick legs
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Heavy combat boots
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

function getIronBullBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const vest = a;
    return [
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, outline, skin, skin, skin, outline, skin, skin, glove, glove, _, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, skin, skin, vest, skin, skin, skin, skin, glove, glove, _, _, _, _, _],
        [_, _, _, _, glove, glove, skin, skin, skin, skin, outline, outline, skin, skin, skin, glove, glove, _, _, _, _, _],
        [_, _, _, _, glove, glove, _, skin, skin, skin, skin, skin, skin, skin, _, glove, glove, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _, _],
        [_, _, outline, vest, c, c, c, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, _, _, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

function getIronBullHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const vest = a;
    return [
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, outline, skin, skin, skin, outline, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, '#ff4444', vest, '#ff4444', skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, skin, skin, skin, skin, outline, outline, skin, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, outline, vest, c, c, c, c, c, c, c, c, c, c, c, c, vest, outline, _, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _],
        [_, glove, glove, skin, skin, skin, vest, c, c, c, c, c, c, vest, skin, skin, skin, glove, glove, _, _, _],
        [_, glove, glove, skin, skin, _, c, c, c, c, c, c, c, c, _, skin, skin, glove, glove, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, vest, vest, vest, vest, vest, vest, vest, vest, _, _, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        [_, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, _, _, _, _, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
        [_, _, _, _, shoe, shoe, shoe, shoe, shoe, _, _, shoe, shoe, shoe, shoe, shoe, _, _, _, _, _, _],
    ];
}

// ============================================================
// SMOKE LEOPARD — Lean athletic, face mask, sleeveless, small gloves
// ============================================================

function getSmokeLeopardIdleSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null, frame: number
): SpriteFrame {
    const bob = Math.floor(frame / 15) % 2 === 0;
    const mask = a; // face mask color
    const armSkin = '#e8c898'; // lighter tone for sleeveless arms
    const smallGlove = a;
    return [
        // Hair
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _],
        // Face with mask over lower face
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, skin, skin, skin, skin, skin, skin, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, skin, skin, mask, mask, mask, mask, mask, mask, skin, skin, _, _, _, _, _],
        [_, _, _, _, _, _, skin, mask, mask, mask, mask, mask, mask, skin, _, _, _, _, _, _],
        // Neck
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        // Shoulders — sleeveless
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        // Sleeveless arms (lighter skin tone) + small gloves
        [_, _, smallGlove, smallGlove, armSkin, armSkin, c, c, c, c, c, c, c, c, armSkin, armSkin, smallGlove, smallGlove, _, _],
        [_, _, smallGlove, smallGlove, armSkin, armSkin, c, c, c, c, c, c, c, c, armSkin, armSkin, smallGlove, smallGlove, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        // Belt
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        // Shorts
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        // Legs (slightly longer / athletic)
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        ...(bob ? [
            [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _] as (string | null)[],
        ] : []),
        // Athletic shoes (small, accent color)
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
    ];
}

function getSmokeLeopardBlockSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const mask = a;
    const armSkin = '#e8c898';
    const smallGlove = a;
    return [
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _],
        [_, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _, _],
        [_, _, _, _, smallGlove, smallGlove, skin, outline, skin, skin, skin, skin, outline, skin, smallGlove, smallGlove, _, _, _, _],
        [_, _, _, _, smallGlove, smallGlove, skin, skin, skin, skin, skin, skin, skin, skin, smallGlove, smallGlove, _, _, _, _],
        [_, _, _, _, smallGlove, smallGlove, skin, mask, mask, mask, mask, mask, mask, skin, smallGlove, smallGlove, _, _, _, _],
        [_, _, _, _, smallGlove, smallGlove, skin, mask, mask, mask, mask, mask, mask, skin, smallGlove, smallGlove, _, _, _, _],
        [_, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, armSkin, armSkin, c, c, c, c, c, c, c, c, armSkin, armSkin, _, _, _, _],
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
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
    ];
}

function getSmokeLeopardHitSprite(
    skin: string, _hair: string, shorts: string, glove: string,
    outline: string, shoe: string, c: string, a: string, _: null
): SpriteFrame {
    const mask = a;
    const armSkin = '#e8c898';
    const smallGlove = a;
    return [
        [_, _, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _, _],
        [_, _, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _, _],
        [_, _, _, _, _, _, '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', '#1a1a2e', _, _, _, _],
        [_, _, _, _, _, _, outline, skin, skin, skin, skin, skin, skin, skin, skin, outline, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, outline, skin, skin, skin, skin, outline, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, skin, '#ff4444', skin, skin, '#ff4444', skin, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, mask, mask, mask, mask, mask, mask, skin, skin, _, _, _, _],
        [_, _, _, _, _, _, _, skin, mask, mask, mask, mask, mask, mask, skin, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, skin, skin, skin, skin, _, _, _, _, _, _, _],
        [_, _, _, _, _, outline, c, c, c, c, c, c, c, c, c, outline, _, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, _, outline, c, c, c, c, c, c, c, c, c, c, c, outline, _, _, _],
        [_, _, _, smallGlove, smallGlove, armSkin, c, c, c, c, c, c, c, c, armSkin, smallGlove, smallGlove, _, _, _],
        [_, _, _, smallGlove, smallGlove, _, c, c, c, c, c, c, c, c, _, smallGlove, smallGlove, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, c, c, c, c, c, c, c, c, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, a, a, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, shorts, _, _, shorts, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, shorts, shorts, shorts, _, _, _, _, shorts, shorts, shorts, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, skin, skin, _, _, _, _, skin, skin, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
        [_, _, _, _, _, _, a, a, a, _, _, a, a, a, _, _, _, _, _, _],
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
