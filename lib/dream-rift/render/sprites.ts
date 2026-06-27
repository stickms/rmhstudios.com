/**
 * Procedural character sprites for Dream Rift.
 *
 * Four playable chibis (so a lobby seats up to four), each with a distinct
 * palette, hairstyle, headpiece and shot colour. Sprites are authored at small
 * native resolution and scaled up with image smoothing disabled so they stay
 * crisp pixel-art in the Touhou tradition.
 *
 * Each character ships animated frame sets:
 *   - idle  : a breathing / hair-sway loop
 *   - left  : banking left  (lean + trailing hair)
 *   - right : banking right
 * plus a larger bust `portrait` for the character-select and dialogue UI.
 *
 * Bosses and fairies are generated the same way with their own theming so the
 * three stages stay visually distinct.
 */

import { createSurface, type Surface } from './surface';

export type PlayerId = 'reika' | 'mira' | 'aoi' | 'nyx';

type HairStyle = 'long' | 'twintail' | 'ponytail' | 'short';
type Headpiece = 'bow' | 'hat' | 'tiara' | 'circlet';

export interface CharConfig {
    id: PlayerId;
    name: string;
    title: string;
    hair: string;
    hairShade: string;
    hairLight: string;
    skin: string;
    skinShade: string;
    eyes: string;
    outfit: string;
    outfitShade: string;
    outfitLight: string;
    trim: string;
    accent: string;
    hairStyle: HairStyle;
    headpiece: Headpiece;
    /** Bullet colour name used for this character's own shots. */
    shotColor: string;
    /** One-line shot-type flavour shown in select. */
    shotType: string;
}

export const CHARACTERS: Record<PlayerId, CharConfig> = {
    reika: {
        id: 'reika',
        name: 'Reika',
        title: 'Shrine Maiden of the Rift',
        hair: '#4a2436',
        hairShade: '#2f1623',
        hairLight: '#6b3450',
        skin: '#ffe0cf',
        skinShade: '#e8b6a0',
        eyes: '#d23a5a',
        outfit: '#d8364f',
        outfitShade: '#a0233b',
        outfitLight: '#ff6f86',
        trim: '#fefefe',
        accent: '#ffd34d',
        hairStyle: 'long',
        headpiece: 'bow',
        shotColor: 'red',
        shotType: 'Homing amulets — forgiving, seeks enemies',
    },
    mira: {
        id: 'mira',
        name: 'Mira',
        title: 'Star-Thief Witch',
        hair: '#ffe27a',
        hairShade: '#cda945',
        hairLight: '#fff0b0',
        skin: '#ffe0cf',
        skinShade: '#e8b6a0',
        eyes: '#7a52e0',
        outfit: '#27203a',
        outfitShade: '#150f24',
        outfitLight: '#4a3d70',
        trim: '#e7e0ff',
        accent: '#9a6bff',
        hairStyle: 'long',
        headpiece: 'hat',
        shotColor: 'yellow',
        shotType: 'Focused star laser — high damage, narrow',
    },
    aoi: {
        id: 'aoi',
        name: 'Aoi',
        title: 'Tideglass Diviner',
        hair: '#7fd6ff',
        hairShade: '#3f9fd0',
        hairLight: '#c7f1ff',
        skin: '#ffe6d6',
        skinShade: '#e6bca6',
        eyes: '#1f9ad0',
        outfit: '#1f8fb8',
        outfitShade: '#13627f',
        outfitLight: '#5fd0ee',
        trim: '#f2fbff',
        accent: '#9ff0ff',
        hairStyle: 'twintail',
        headpiece: 'tiara',
        shotColor: 'cyan',
        shotType: 'Wide tide spread — covers the screen',
    },
    nyx: {
        id: 'nyx',
        name: 'Nyx',
        title: 'Void Between Dreams',
        hair: '#3a2a66',
        hairShade: '#231741',
        hairLight: '#6b54a8',
        skin: '#f0dce6',
        skinShade: '#cfa8bf',
        eyes: '#c77bff',
        outfit: '#5a2e9e',
        outfitShade: '#371a66',
        outfitLight: '#9a64e0',
        trim: '#e7d6ff',
        accent: '#d7a0ff',
        hairStyle: 'ponytail',
        headpiece: 'circlet',
        shotColor: 'purple',
        shotType: 'Piercing void lances — punches through ranks',
    },
};

export const PLAYER_IDS = Object.keys(CHARACTERS) as PlayerId[];

export interface CharacterSprites {
    idle: Surface[];
    left: Surface[];
    right: Surface[];
    portrait: Surface;
    nativeW: number;
    nativeH: number;
}

const NW = 40;
const NH = 46;

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

interface PoseOpts {
    lean: number; // -2..2 horizontal lean
    bob: number; // vertical body bob
    sway: number; // hair sway
    armUp: number; // 0..1 arms raised
}

function drawChibi(ctx: CanvasRenderingContext2D, c: CharConfig, o: PoseOpts): void {
    const cx = NW / 2;
    const lean = o.lean;
    const bodyY = 18 + o.bob;

    // ── focus aura at feet ──
    const ag = ctx.createRadialGradient(cx, NH - 4, 0, cx, NH - 4, 9);
    ag.addColorStop(0, hexA(c.accent, 0.7));
    ag.addColorStop(1, hexA(c.accent, 0));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(cx, NH - 4, 9, 0, Math.PI * 2);
    ctx.fill();

    // ── back hair ──
    drawBackHair(ctx, c, cx, lean, o.sway);

    // ── legs / boots ──
    px(ctx, c.outfitShade, cx - 4 + lean * 0.5, NH - 12, 3, 8);
    px(ctx, c.outfitShade, cx + 1 + lean * 0.5, NH - 12, 3, 8);
    px(ctx, c.trim, cx - 4 + lean * 0.5, NH - 6, 3, 2);
    px(ctx, c.trim, cx + 1 + lean * 0.5, NH - 6, 3, 2);

    // ── skirt with pleats ──
    const sy = bodyY + 9;
    px(ctx, c.outfit, cx - 8 + lean * 0.5, sy, 16, 7);
    px(ctx, c.outfitShade, cx - 8 + lean * 0.5, sy + 6, 16, 2);
    px(ctx, c.outfitLight, cx - 8 + lean * 0.5, sy, 16, 1);
    for (let i = -7; i <= 6; i += 3) px(ctx, c.outfitShade, cx + i + lean * 0.5, sy + 1, 1, 6);
    px(ctx, c.trim, cx - 8 + lean * 0.5, sy + 8, 16, 1);

    // ── torso ──
    px(ctx, c.outfitShade, cx - 5 + lean * 0.6, bodyY, 10, 10);
    px(ctx, c.outfit, cx - 4 + lean * 0.6, bodyY, 8, 10);
    px(ctx, c.outfitLight, cx - 4 + lean * 0.6, bodyY, 8, 1);
    // collar + ribbon
    px(ctx, c.trim, cx - 4 + lean * 0.6, bodyY, 8, 2);
    px(ctx, c.accent, cx - 2 + lean * 0.6, bodyY + 1, 4, 3);
    px(ctx, c.accent, cx - 3 + lean * 0.6, bodyY + 2, 2, 2);
    px(ctx, c.accent, cx + 1 + lean * 0.6, bodyY + 2, 2, 2);

    // ── detached sleeves / arms ──
    const armY = bodyY + 1 - o.armUp * 3;
    px(ctx, c.trim, cx - 8 + lean * 0.6, armY, 3, 8);
    px(ctx, c.outfitLight, cx - 8 + lean * 0.6, armY, 3, 1);
    px(ctx, c.trim, cx + 5 + lean * 0.6, armY, 3, 8);
    px(ctx, c.outfitLight, cx + 5 + lean * 0.6, armY, 3, 1);
    // hands
    px(ctx, c.skin, cx - 8 + lean * 0.6, armY + 8, 3, 2);
    px(ctx, c.skin, cx + 5 + lean * 0.6, armY + 8, 3, 2);

    // ── head ──
    const hx = cx - 5 + lean;
    const hy = bodyY - 10;
    px(ctx, c.skin, hx, hy, 10, 9);
    px(ctx, c.skinShade, hx, hy + 7, 10, 2);
    px(ctx, c.skinShade, hx, hy + 1, 1, 6); // cheek shade
    // blush
    px(ctx, hexA(c.eyes, 0.25), hx + 1, hy + 5, 2, 1);
    px(ctx, hexA(c.eyes, 0.25), hx + 7, hy + 5, 2, 1);
    // eyes (two-tone with highlight)
    px(ctx, '#2a1b2e', hx + 2, hy + 3, 2, 3);
    px(ctx, c.eyes, hx + 2, hy + 4, 2, 2);
    px(ctx, '#ffffff', hx + 2, hy + 3, 1, 1);
    px(ctx, '#2a1b2e', hx + 6, hy + 3, 2, 3);
    px(ctx, c.eyes, hx + 6, hy + 4, 2, 2);
    px(ctx, '#ffffff', hx + 6, hy + 3, 1, 1);
    // mouth
    px(ctx, c.skinShade, hx + 4, hy + 7, 2, 1);

    // ── front hair / bangs ──
    drawFrontHair(ctx, c, cx, lean, hy);

    // ── headpiece ──
    drawHeadpiece(ctx, c, cx, lean, hy, o.sway);
}

function drawBackHair(ctx: CanvasRenderingContext2D, c: CharConfig, cx: number, lean: number, sway: number): void {
    const top = 6;
    switch (c.hairStyle) {
        case 'long':
            px(ctx, c.hairShade, cx - 7 + lean + sway, top + 2, 14, 24);
            px(ctx, c.hair, cx - 7 + lean + sway, top + 2, 14, 4);
            px(ctx, c.hairShade, cx - 7 + lean + sway, top + 24, 5, 6);
            px(ctx, c.hairShade, cx + 2 + lean + sway, top + 24, 5, 6);
            break;
        case 'twintail':
            px(ctx, c.hairShade, cx - 6 + lean, top + 2, 12, 12);
            // tails
            px(ctx, c.hair, cx - 11 + lean - sway, top + 6, 4, 22);
            px(ctx, c.hairShade, cx - 11 + lean - sway, top + 24, 4, 4);
            px(ctx, c.hair, cx + 7 + lean + sway, top + 6, 4, 22);
            px(ctx, c.hairShade, cx + 7 + lean + sway, top + 24, 4, 4);
            break;
        case 'ponytail':
            px(ctx, c.hairShade, cx - 6 + lean, top + 2, 12, 12);
            px(ctx, c.hair, cx + 4 + lean + sway, top + 4, 5, 26);
            px(ctx, c.hairLight, cx + 4 + lean + sway, top + 4, 5, 3);
            px(ctx, c.hairShade, cx + 4 + lean + sway, top + 26, 5, 4);
            break;
        case 'short':
            px(ctx, c.hairShade, cx - 6 + lean, top + 2, 12, 14);
            px(ctx, c.hair, cx - 6 + lean, top + 2, 12, 4);
            break;
    }
}

function drawFrontHair(ctx: CanvasRenderingContext2D, c: CharConfig, cx: number, lean: number, hy: number): void {
    const fx = cx - 6 + lean;
    px(ctx, c.hair, fx, hy - 2, 12, 5); // crown
    px(ctx, c.hairLight, fx, hy - 2, 12, 1);
    // bangs
    px(ctx, c.hair, fx, hy + 2, 2, 4);
    px(ctx, c.hair, cx - 1 + lean, hy + 2, 2, 3);
    px(ctx, c.hair, fx + 10, hy + 2, 2, 4);
    // side locks framing the face
    px(ctx, c.hairShade, fx - 1, hy, 2, 9);
    px(ctx, c.hairShade, fx + 11, hy, 2, 9);
    px(ctx, c.hairLight, fx - 1, hy, 1, 2);
}

function drawHeadpiece(ctx: CanvasRenderingContext2D, c: CharConfig, cx: number, lean: number, hy: number, sway: number): void {
    switch (c.headpiece) {
        case 'bow':
            px(ctx, c.accent, cx - 8 + lean, hy - 3, 3, 4);
            px(ctx, '#fff', cx - 7 + lean, hy - 2, 1, 1);
            px(ctx, c.accent, cx + 5 + lean, hy - 3, 3, 4);
            px(ctx, '#fff', cx + 6 + lean, hy - 2, 1, 1);
            px(ctx, c.accent, cx - 1 + lean, hy - 4, 2, 2);
            break;
        case 'hat': {
            const hxh = cx - 8 + lean + sway * 0.5;
            px(ctx, c.outfitShade, hxh, hy - 1, 16, 2); // brim
            px(ctx, c.outfit, hxh + 3, hy - 6, 10, 5); // cone base
            px(ctx, c.outfitShade, hxh + 5, hy - 9, 6, 4);
            px(ctx, c.accent, hxh, hy - 1, 16, 1);
            px(ctx, c.accent, hxh + 3, hy - 3, 10, 1); // band
            break;
        }
        case 'tiara':
            px(ctx, c.accent, cx - 5 + lean, hy - 2, 10, 1);
            px(ctx, c.accent, cx - 1 + lean, hy - 4, 2, 2);
            px(ctx, '#fff', cx + lean, hy - 3, 1, 1);
            break;
        case 'circlet':
            px(ctx, c.accent, cx - 6 + lean, hy - 1, 12, 1);
            px(ctx, c.accent, cx - 1 + lean, hy - 3, 2, 2);
            px(ctx, c.hairLight, cx - 6 + lean, hy - 1, 2, 1);
            px(ctx, c.hairLight, cx + 4 + lean, hy - 1, 2, 1);
            break;
    }
}

function buildPlayer(id: PlayerId): CharacterSprites {
    const c = CHARACTERS[id];
    const mk = (o: PoseOpts) => {
        const s = createSurface(NW, NH);
        drawChibi(s.ctx, c, o);
        return s;
    };
    const idle = [
        mk({ lean: 0, bob: 0, sway: 0, armUp: 0 }),
        mk({ lean: 0, bob: -1, sway: 1, armUp: 0.3 }),
        mk({ lean: 0, bob: 0, sway: 0, armUp: 0.1 }),
        mk({ lean: 0, bob: -1, sway: -1, armUp: 0.3 }),
    ];
    const left = [mk({ lean: -1, bob: 0, sway: 2, armUp: 0.2 }), mk({ lean: -2, bob: 0, sway: 3, armUp: 0.4 })];
    const right = [mk({ lean: 1, bob: 0, sway: -2, armUp: 0.2 }), mk({ lean: 2, bob: 0, sway: -3, armUp: 0.4 })];
    return { idle, left, right, portrait: buildPortrait(c), nativeW: NW, nativeH: NH };
}

/** Larger bust portrait for character select / dialogue. */
function buildPortrait(c: CharConfig): Surface {
    const W = 96;
    const H = 120;
    const s = createSurface(W, H);
    const ctx = s.ctx;
    const cx = W / 2;
    // soft themed backlight
    const bg = ctx.createRadialGradient(cx, 50, 4, cx, 50, 70);
    bg.addColorStop(0, hexA(c.accent, 0.35));
    bg.addColorStop(1, hexA(c.accent, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // hair back mass
    ctx.fillStyle = c.hairShade;
    ctx.beginPath();
    ctx.ellipse(cx, 58, 38, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.ellipse(cx, 40, 36, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // shoulders / outfit
    ctx.fillStyle = c.outfitShade;
    ctx.beginPath();
    ctx.moveTo(cx - 40, H);
    ctx.lineTo(cx - 26, 84);
    ctx.lineTo(cx + 26, 84);
    ctx.lineTo(cx + 40, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.outfit;
    ctx.fillRect(cx - 18, 84, 36, H - 84);
    ctx.fillStyle = c.trim;
    ctx.fillRect(cx - 18, 84, 36, 4);
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.moveTo(cx, 90);
    ctx.lineTo(cx - 7, 100);
    ctx.lineTo(cx + 7, 100);
    ctx.closePath();
    ctx.fill();

    // face
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.ellipse(cx, 50, 20, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.skinShade;
    ctx.beginPath();
    ctx.ellipse(cx, 58, 20, 14, 0, 0, Math.PI);
    ctx.fill();
    // blush
    ctx.fillStyle = hexA(c.eyes, 0.22);
    ctx.beginPath();
    ctx.ellipse(cx - 11, 55, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 11, 55, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    for (const ex of [cx - 9, cx + 9]) {
        ctx.fillStyle = '#2a1b2e';
        ctx.beginPath();
        ctx.ellipse(ex, 50, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c.eyes;
        ctx.beginPath();
        ctx.ellipse(ex, 51, 3, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - 1, 48, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    // front bangs
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(cx - 22, 36);
    ctx.quadraticCurveTo(cx, 18, cx + 22, 36);
    ctx.quadraticCurveTo(cx + 14, 30, cx + 6, 40);
    ctx.quadraticCurveTo(cx, 26, cx - 6, 40);
    ctx.quadraticCurveTo(cx - 14, 30, cx - 22, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.hairLight;
    ctx.fillRect(cx - 20, 22, 40, 3);
    // side locks
    ctx.fillStyle = c.hairShade;
    ctx.fillRect(cx - 24, 38, 5, 40);
    ctx.fillRect(cx + 19, 38, 5, 40);

    // headpiece accent
    ctx.fillStyle = c.accent;
    if (c.headpiece === 'hat') {
        ctx.beginPath();
        ctx.moveTo(cx - 30, 24);
        ctx.lineTo(cx + 30, 24);
        ctx.lineTo(cx + 14, 22);
        ctx.lineTo(cx, -2);
        ctx.lineTo(cx - 14, 22);
        ctx.closePath();
        ctx.fillStyle = c.outfit;
        ctx.fill();
        ctx.fillStyle = c.accent;
        ctx.fillRect(cx - 30, 22, 60, 4);
    } else {
        ctx.fillRect(cx - 16, 18, 32, 3);
        ctx.beginPath();
        ctx.arc(cx, 16, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    return s;
}

const playerCache = new Map<PlayerId, CharacterSprites>();
export function playerSprites(id: PlayerId): CharacterSprites {
    let s = playerCache.get(id);
    if (!s) {
        s = buildPlayer(id);
        playerCache.set(id, s);
    }
    return s;
}

// ─── Fairy / popcorn enemies (multiple variants for variation) ───

export type FairyVariant = 'sprite' | 'wisp' | 'sentinel';

export function buildFairy(variant: FairyVariant, tint: string, dark: string, accent: string): Surface[] {
    const frames: Surface[] = [];
    for (let f = 0; f < 2; f++) {
        const s = createSurface(28, 28);
        const ctx = s.ctx;
        const ox = 14;
        const wing = f === 0 ? 7 : 5;
        // wings (flap)
        ctx.fillStyle = hexA('#ffffff', 0.5);
        ctx.beginPath();
        ctx.ellipse(ox - 7, 13, 5, wing, -0.5, 0, Math.PI * 2);
        ctx.ellipse(ox + 7, 13, 5, wing, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA(accent, 0.4);
        ctx.beginPath();
        ctx.ellipse(ox - 7, 13, 3, wing - 2, -0.5, 0, Math.PI * 2);
        ctx.ellipse(ox + 7, 13, 3, wing - 2, 0.5, 0, Math.PI * 2);
        ctx.fill();

        if (variant === 'wisp') {
            const g = ctx.createRadialGradient(ox, 13, 1, ox, 13, 8);
            g.addColorStop(0, '#fff');
            g.addColorStop(0.5, tint);
            g.addColorStop(1, hexA(tint, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ox, 13, 8, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // body
            px(ctx, dark, ox - 4, 10, 8, 9);
            px(ctx, tint, ox - 3, 10, 6, 9);
            px(ctx, accent, ox - 3, 10, 6, 1);
            // head
            px(ctx, '#ffe0cf', ox - 3, 5, 6, 6);
            px(ctx, tint, ox - 4, 3, 8, 4); // hair
            px(ctx, dark, ox - 4, 4, 1, 5);
            px(ctx, dark, ox + 3, 4, 1, 5);
            px(ctx, '#2a1b2e', ox - 2, 7, 1, 2);
            px(ctx, '#2a1b2e', ox + 1, 7, 1, 2);
            if (variant === 'sentinel') {
                // crown spikes for the tougher variant
                px(ctx, accent, ox - 4, 1, 1, 3);
                px(ctx, accent, ox, 0, 1, 3);
                px(ctx, accent, ox + 3, 1, 1, 3);
            }
        }
        frames.push(s);
    }
    return frames;
}

// ─── Bosses ───

export interface BossSprite {
    frames: Surface[];
    portrait: Surface;
    nativeW: number;
    nativeH: number;
}

export interface BossTheme {
    hair: string;
    hairShade: string;
    outfit: string;
    outfitShade: string;
    outfitLight: string;
    accent: string;
    eyes: string;
    wings: 'feather' | 'crystal' | 'astral';
}

export const BOSS_THEMES: BossTheme[] = [
    { hair: '#4a2436', hairShade: '#2f1623', outfit: '#d8364f', outfitShade: '#8c1f36', outfitLight: '#ff6f86', accent: '#ffd34d', eyes: '#ffe14d', wings: 'feather' },
    { hair: '#2a7aa0', hairShade: '#185a78', outfit: '#1f8fb8', outfitShade: '#12576f', outfitLight: '#7fe0ff', accent: '#aef3ff', eyes: '#dffaff', wings: 'crystal' },
    { hair: '#3a2a66', hairShade: '#231741', outfit: '#7d4bd6', outfitShade: '#4a2a8c', outfitLight: '#b78cff', accent: '#e0b3ff', eyes: '#f0d6ff', wings: 'astral' },
];

const BW = 72;
const BH = 80;

function drawBoss(ctx: CanvasRenderingContext2D, t: BossTheme, bob: number, wingPhase: number): void {
    const cx = BW / 2;
    const cy = 30 + bob;

    // ── wings behind ──
    drawWings(ctx, t, cx, cy, wingPhase);

    // ── flowing back hair ──
    ctx.fillStyle = t.hairShade;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, 20, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── dress ──
    ctx.fillStyle = t.outfitShade;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 8);
    ctx.lineTo(cx + 9, cy + 8);
    ctx.lineTo(cx + 26, BH - 2);
    ctx.lineTo(cx - 26, BH - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = t.outfit;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 9);
    ctx.lineTo(cx + 7, cy + 9);
    ctx.lineTo(cx + 19, BH - 4);
    ctx.lineTo(cx - 19, BH - 4);
    ctx.closePath();
    ctx.fill();
    // dress trim + sash
    ctx.fillStyle = t.accent;
    ctx.fillRect(cx - 8, cy + 16, 16, 2);
    ctx.fillStyle = t.outfitLight;
    for (let i = -16; i <= 14; i += 8) {
        ctx.fillRect(cx + i + 2, cy + 20, 1, BH - (cy + 24));
    }

    // ── sleeves + arms (spread, casting) ──
    ctx.fillStyle = t.outfit;
    ctx.save();
    ctx.translate(cx - 8, cy + 10);
    ctx.rotate(-0.5 - wingPhase * 0.1);
    ctx.fillRect(-3, 0, 6, 18);
    ctx.fillStyle = t.outfitLight;
    ctx.fillRect(-3, 0, 6, 2);
    ctx.restore();
    ctx.fillStyle = t.outfit;
    ctx.save();
    ctx.translate(cx + 8, cy + 10);
    ctx.rotate(0.5 + wingPhase * 0.1);
    ctx.fillRect(-3, 0, 6, 18);
    ctx.fillStyle = t.outfitLight;
    ctx.fillRect(-3, 0, 6, 2);
    ctx.restore();
    // glowing palms
    for (const sgn of [-1, 1]) {
        const handX = cx + sgn * 18;
        const handY = cy + 26;
        const g = ctx.createRadialGradient(handX, handY, 0, handX, handY, 7);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.4, t.accent);
        g.addColorStop(1, hexA(t.accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(handX, handY, 7, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── neck + face ──
    ctx.fillStyle = '#ffe0cf';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b6a0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 11, 7, 0, 0, Math.PI);
    ctx.fill();
    // eyes glowing
    for (const ex of [cx - 4, cx + 4]) {
        ctx.fillStyle = '#2a1b2e';
        ctx.beginPath();
        ctx.ellipse(ex, cy, 2.4, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.eyes;
        ctx.beginPath();
        ctx.ellipse(ex, cy + 0.5, 1.6, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - 0.6, cy - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── front bangs ──
    ctx.fillStyle = t.hair;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 6);
    ctx.quadraticCurveTo(cx, cy - 22, cx + 13, cy - 6);
    ctx.quadraticCurveTo(cx + 7, cy - 12, cx + 3, cy - 2);
    ctx.quadraticCurveTo(cx, cy - 16, cx - 3, cy - 2);
    ctx.quadraticCurveTo(cx - 7, cy - 12, cx - 13, cy - 6);
    ctx.closePath();
    ctx.fill();
    // side locks
    ctx.fillStyle = t.hairShade;
    ctx.fillRect(cx - 15, cy - 5, 4, 22);
    ctx.fillRect(cx + 11, cy - 5, 4, 22);

    // ── crown / headpiece ──
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 12);
    ctx.lineTo(cx - 5, cy - 20);
    ctx.lineTo(cx, cy - 12);
    ctx.lineTo(cx + 5, cy - 20);
    ctx.lineTo(cx + 10, cy - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 1.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawWings(ctx: CanvasRenderingContext2D, t: BossTheme, cx: number, cy: number, phase: number): void {
    const spread = 1 + phase * 0.12;
    for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + sgn * 10, cy + 8);
        ctx.scale(sgn * spread, spread);
        if (t.wings === 'feather') {
            ctx.fillStyle = hexA(t.outfitLight, 0.85);
            for (let i = 0; i < 5; i++) {
                ctx.save();
                ctx.rotate(-0.3 - i * 0.28);
                ctx.beginPath();
                ctx.ellipse(14, 0, 14 - i, 4, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        } else if (t.wings === 'crystal') {
            ctx.fillStyle = hexA(t.accent, 0.7);
            for (let i = 0; i < 4; i++) {
                ctx.save();
                ctx.rotate(-0.2 - i * 0.3);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(22 - i * 3, -3);
                ctx.lineTo(20 - i * 3, 3);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        } else {
            // astral: glowing arcs
            ctx.strokeStyle = hexA(t.accent, 0.7);
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(2, 0, 12 + i * 5, -1.1, 0.5);
                ctx.stroke();
            }
            ctx.fillStyle = hexA(t.accent, 0.5);
            for (let i = 0; i < 6; i++) {
                const a = -1 + i * 0.25;
                ctx.beginPath();
                ctx.arc(2 + Math.cos(a) * 18, Math.sin(a) * 18, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

export function buildBoss(themeIndex: number): BossSprite {
    const t = BOSS_THEMES[themeIndex % BOSS_THEMES.length];
    const frames: Surface[] = [];
    for (let f = 0; f < 4; f++) {
        const s = createSurface(BW, BH);
        const bob = [0, -1.5, 0, 1.5][f];
        const wing = [0, 1, 2, 1][f];
        drawBoss(s.ctx, t, bob, wing);
        frames.push(s);
    }
    // portrait reuses the player portrait pipeline shape but boss-themed
    const portrait = buildBossPortrait(t);
    return { frames, portrait, nativeW: BW, nativeH: BH };
}

function buildBossPortrait(t: BossTheme): Surface {
    const W = 110;
    const H = 132;
    const s = createSurface(W, H);
    const ctx = s.ctx;
    const cx = W / 2;
    const bg = ctx.createRadialGradient(cx, 56, 6, cx, 56, 84);
    bg.addColorStop(0, hexA(t.accent, 0.4));
    bg.addColorStop(1, hexA(t.accent, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx - BW * 0.75, 6);
    ctx.scale(1.5, 1.5);
    drawBoss(ctx, t, 0, 1);
    ctx.restore();
    return s;
}

// ─── utils ───

function hexA(hex: string, a: number): string {
    if (hex.startsWith('#')) {
        const c = hex.slice(1);
        const r = parseInt(c.slice(0, 2), 16);
        const g = parseInt(c.slice(2, 4), 16);
        const b = parseInt(c.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    }
    return hex;
}
