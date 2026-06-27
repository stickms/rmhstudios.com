/**
 * Procedural character sprites for Dream Rift.
 *
 * Authored at small native resolution and scaled up by the renderer with image
 * smoothing disabled, so they read as crisp pixel-art chibis in the Touhou
 * tradition: a tiny playable shrine maiden / witch, fairy popcorn enemies and
 * larger boss portraits with per-stage theming.
 *
 * Player frames: [bankLeft, idle, bankRight]. The renderer selects by lateral
 * movement so the character leans into turns the way danmaku sprites do.
 */

import { createSurface, type Surface } from './surface';

export type PlayerId = 'reika' | 'mira';

export interface CharacterSprites {
    frames: Surface[]; // bankLeft, idle, bankRight
    nativeW: number;
    nativeH: number;
}

interface Palette {
    hair: string;
    hairShade: string;
    skin: string;
    skinShade: string;
    outfit: string;
    outfitShade: string;
    trim: string;
    accent: string;
    eyes: string;
}

const REIKA: Palette = {
    hair: '#3a2233',
    hairShade: '#271622',
    skin: '#ffe0cf',
    skinShade: '#e8b6a0',
    outfit: '#d33a55',
    outfitShade: '#a32440',
    trim: '#fdfdfd',
    accent: '#ffd34d',
    eyes: '#b22a4a',
};

const MIRA: Palette = {
    hair: '#ffe27a',
    hairShade: '#d9b94f',
    skin: '#ffe0cf',
    skinShade: '#e8b6a0',
    outfit: '#241a30',
    outfitShade: '#150e1d',
    trim: '#e7e0ff',
    accent: '#8a5cff',
    eyes: '#6f4bd8',
};

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

/**
 * Draw a chibi at native scale. `lean` in {-1,0,1} tilts the body and offsets
 * the hair to imply motion.
 */
function drawChibi(ctx: CanvasRenderingContext2D, p: Palette, id: PlayerId, lean: number): void {
    const ox = 16; // centre x
    const dx = lean * 1; // body shift
    // hair back
    px(ctx, p.hairShade, ox - 6 + dx, 6, 12, 11);
    // dress / body
    px(ctx, p.outfitShade, ox - 5 + dx, 16, 10, 12);
    px(ctx, p.outfit, ox - 4 + dx, 16, 8, 12);
    // skirt flare
    px(ctx, p.outfit, ox - 6 + dx, 24, 12, 4);
    px(ctx, p.outfitShade, ox - 6 + dx, 27, 12, 1);
    px(ctx, p.trim, ox - 6 + dx, 28, 12, 1);
    // detached sleeves / arms
    px(ctx, p.trim, ox - 7 + dx, 17, 2, 6);
    px(ctx, p.trim, ox + 5 + dx, 17, 2, 6);
    // head
    px(ctx, p.skin, ox - 4 + dx, 8, 8, 8);
    px(ctx, p.skinShade, ox - 4 + dx, 14, 8, 1);
    // hair front + bangs
    px(ctx, p.hair, ox - 5 + dx, 5, 10, 5);
    px(ctx, p.hair, ox - 5 + dx, 9, 2, 4);
    px(ctx, p.hair, ox + 3 + dx, 9, 2, 4);
    // side locks
    px(ctx, p.hairShade, ox - 6 + dx - (lean < 0 ? 1 : 0), 9, 1, 8);
    px(ctx, p.hairShade, ox + 5 + dx + (lean > 0 ? 1 : 0), 9, 1, 8);
    // eyes
    px(ctx, p.eyes, ox - 3 + dx, 11, 2, 2);
    px(ctx, p.eyes, ox + 1 + dx, 11, 2, 2);
    px(ctx, '#ffffff', ox - 3 + dx, 11, 1, 1);
    px(ctx, '#ffffff', ox + 1 + dx, 11, 1, 1);
    // accessory: shrine bow vs witch hat
    if (id === 'reika') {
        px(ctx, p.accent, ox - 6 + dx, 4, 3, 3);
        px(ctx, p.trim, ox - 5 + dx, 5, 1, 1);
        px(ctx, p.accent, ox + 3 + dx, 4, 3, 3);
        px(ctx, p.trim, ox + 4 + dx, 5, 1, 1);
    } else {
        // witch hat
        px(ctx, p.outfitShade, ox - 7 + dx, 4, 14, 2);
        px(ctx, p.outfitShade, ox - 4 + dx, 1, 8, 4);
        px(ctx, p.accent, ox - 7 + dx, 4, 14, 1);
    }
    // glowing focus orb at feet (read as the shot focus)
    px(ctx, p.accent, ox - 1 + dx, 30, 2, 1);
}

function buildPlayer(id: PlayerId): CharacterSprites {
    const pal = id === 'reika' ? REIKA : MIRA;
    const frames: Surface[] = [];
    for (const lean of [-1, 0, 1]) {
        const s = createSurface(32, 34);
        drawChibi(s.ctx, pal, id, lean);
        frames.push(s);
    }
    return { frames, nativeW: 32, nativeH: 34 };
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

/** Small fairy / popcorn enemy. `tint` is a base hue colour. */
export function buildFairy(tint: string, dark: string): Surface {
    const s = createSurface(24, 24);
    const ctx = s.ctx;
    const ox = 12;
    // wings
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(ox - 6, 11, 5, 7, -0.4, 0, Math.PI * 2);
    ctx.ellipse(ox + 6, 11, 5, 7, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // body
    px(ctx, dark, ox - 4, 9, 8, 9);
    px(ctx, tint, ox - 3, 9, 6, 9);
    // head
    px(ctx, '#ffe0cf', ox - 3, 4, 6, 6);
    px(ctx, tint, ox - 4, 3, 8, 3); // hair
    px(ctx, dark, ox - 4, 3, 1, 5);
    px(ctx, dark, ox + 3, 3, 1, 5);
    // eyes
    px(ctx, '#2a1b3a', ox - 2, 6, 1, 2);
    px(ctx, '#2a1b3a', ox + 1, 6, 1, 2);
    return s;
}

export interface BossSprite {
    surface: Surface;
    nativeW: number;
    nativeH: number;
}

/**
 * Larger boss portrait. Theming via two outfit colours + a hair colour keeps
 * each of the three bosses visually distinct while sharing the silhouette.
 */
export function buildBoss(opts: { hair: string; outfit: string; outfitShade: string; accent: string }): BossSprite {
    const W = 48;
    const H = 56;
    const s = createSurface(W, H);
    const ctx = s.ctx;
    const ox = W / 2;
    // flowing hair back
    ctx.fillStyle = opts.hair;
    ctx.beginPath();
    ctx.ellipse(ox, 18, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // dress
    ctx.fillStyle = opts.outfitShade;
    ctx.beginPath();
    ctx.moveTo(ox - 6, 26);
    ctx.lineTo(ox + 6, 26);
    ctx.lineTo(ox + 18, 54);
    ctx.lineTo(ox - 18, 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = opts.outfit;
    ctx.beginPath();
    ctx.moveTo(ox - 5, 27);
    ctx.lineTo(ox + 5, 27);
    ctx.lineTo(ox + 13, 53);
    ctx.lineTo(ox - 13, 53);
    ctx.closePath();
    ctx.fill();
    // sleeves
    px(ctx, opts.outfit, ox - 14, 28, 5, 12);
    px(ctx, opts.outfit, ox + 9, 28, 5, 12);
    px(ctx, opts.accent, ox - 14, 38, 5, 2);
    px(ctx, opts.accent, ox + 9, 38, 5, 2);
    // skin: neck + face
    px(ctx, '#ffe0cf', ox - 6, 20, 12, 10);
    px(ctx, '#ffd9c4', ox - 6, 28, 12, 2);
    // hair front
    ctx.fillStyle = opts.hair;
    px(ctx, opts.hair, ox - 8, 6, 16, 8);
    px(ctx, opts.hair, ox - 8, 12, 3, 12);
    px(ctx, opts.hair, ox + 5, 12, 3, 12);
    // eyes
    px(ctx, opts.accent, ox - 4, 22, 2, 3);
    px(ctx, opts.accent, ox + 2, 22, 2, 3);
    px(ctx, '#ffffff', ox - 4, 22, 1, 1);
    px(ctx, '#ffffff', ox + 2, 22, 1, 1);
    // headpiece
    px(ctx, opts.accent, ox - 9, 4, 18, 2);
    px(ctx, opts.accent, ox - 1, 1, 2, 4);
    return { surface: s, nativeW: W, nativeH: H };
}
