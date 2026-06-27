/**
 * Colour palettes for Dream Rift.
 *
 * Touhou danmaku bullets read as a bright white core wrapped in a saturated
 * coloured shell with a slightly darker rim. We store each bullet colour as an
 * HSL triple so the sprite generator can derive core / body / rim shades
 * consistently across every bullet shape.
 */

export type BulletColorName =
    | 'red'
    | 'orange'
    | 'yellow'
    | 'green'
    | 'mint'
    | 'cyan'
    | 'blue'
    | 'indigo'
    | 'purple'
    | 'magenta'
    | 'white';

export interface Hsl {
    h: number;
    s: number;
    l: number;
}

/** Base hue/sat/light for each bullet colour (the saturated "body" shade). */
export const BULLET_COLORS: Record<BulletColorName, Hsl> = {
    red: { h: 352, s: 90, l: 55 },
    orange: { h: 28, s: 95, l: 55 },
    yellow: { h: 50, s: 95, l: 58 },
    green: { h: 130, s: 70, l: 50 },
    mint: { h: 160, s: 70, l: 55 },
    cyan: { h: 188, s: 85, l: 55 },
    blue: { h: 214, s: 90, l: 58 },
    indigo: { h: 244, s: 75, l: 62 },
    purple: { h: 276, s: 75, l: 62 },
    magenta: { h: 316, s: 82, l: 60 },
    white: { h: 220, s: 20, l: 88 },
};

export const BULLET_COLOR_NAMES = Object.keys(BULLET_COLORS) as BulletColorName[];

export function hsl({ h, s, l }: Hsl, a = 1): string {
    return a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

/** Shift a colour's lightness, clamped to [0, 100]. */
export function shade(c: Hsl, dl: number, ds = 0): Hsl {
    return { h: c.h, s: Math.max(0, Math.min(100, c.s + ds)), l: Math.max(0, Math.min(100, c.l + dl)) };
}

export interface StageTheme {
    id: string;
    name: string;
    /** Vertical gradient stops for the sky (top → bottom). */
    sky: [string, string, string];
    /** Accent colour for nebula / glow. */
    glow: string;
    /** Distant silhouette colour. */
    silhouette: string;
    /** Star / particle tint. */
    star: string;
    /** Dominant danmaku palette for this stage's boss. */
    bulletColors: BulletColorName[];
}

export const STAGE_THEMES: StageTheme[] = [
    {
        id: 'twilight-shrine',
        name: 'Twilight Shrine',
        sky: ['#1a1033', '#2d1b4e', '#4a2c6d'],
        glow: '#ff6ba8',
        silhouette: '#0c0820',
        star: '#ffd9ec',
        bulletColors: ['red', 'magenta', 'orange', 'white'],
    },
    {
        id: 'lucid-sea',
        name: 'Lucid Sea',
        sky: ['#021024', '#053a5e', '#0a6b8f'],
        glow: '#46e0ff',
        silhouette: '#01080f',
        star: '#bff4ff',
        bulletColors: ['cyan', 'blue', 'mint', 'white'],
    },
    {
        id: 'astral-rift',
        name: 'Astral Rift',
        sky: ['#0a0118', '#241048', '#3d1d7a'],
        glow: '#b06bff',
        silhouette: '#06010f',
        star: '#e6ccff',
        bulletColors: ['purple', 'indigo', 'magenta', 'cyan'],
    },
];

export function stageTheme(index: number): StageTheme {
    return STAGE_THEMES[Math.max(0, Math.min(STAGE_THEMES.length - 1, index))];
}
