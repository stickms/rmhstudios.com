// ============================================================
// Muting — turning a model into quiet set-dressing.
//
// The menu's duel is background: the hits and sparks should be the vivid thing, the bodies should read
// as a desaturated, slightly darkened silhouette. The maths is a luma-preserving saturation scale and a
// brightness multiplier; the same expression is spliced into a material's fragment shader at the very
// end (after tone mapping and colour-space output), so it mutes whatever the lighting produced.
//
// Only for plain WebGL materials (the menu canvas). The arena renders through WebGPU node materials,
// where `onBeforeCompile` does nothing — it never calls this.
// ============================================================

import { clamp01 } from '@/lib/core/math';

/** The neon rig's colours: as designed (the card art's hot pink and cyan), or softened for set-dressing. */
export interface RigColors { sky: string; ground: string; key: string; pink: string; cyan: string; violet: string }
export const RIG_COLORS: RigColors = {
    sky: '#9a86d6', ground: '#1a0b24', key: '#ffd9c0', pink: '#ff2e88', cyan: '#46e6ff', violet: '#8f5cff',
};
export const RIG_COLORS_MUTED: RigColors = {
    sky: '#8d85b4', ground: '#1c1426', key: '#e6d6ca', pink: '#c86a98', cyan: '#6fb2c2', violet: '#8a78bc',
};
export const rigColors = (muted: boolean): RigColors => (muted ? RIG_COLORS_MUTED : RIG_COLORS);

/** HSL saturation (0..1) of a #rrggbb colour — what "muted" lowers. */
export function hexSaturation(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return 0;
    return (max - min) / (1 - Math.abs(2 * l - 1));
}

export interface MuteOptions {
    /** 1 = unchanged, 0 = greyscale. */
    saturation: number;
    /** 1 = unchanged, <1 darker. */
    brightness: number;
}

/** The menu's setting: half the colour, a tenth darker (dark outfits stay readable against the street). */
export const MENU_MUTE: MuteOptions = { saturation: 0.5, brightness: 0.9 };

/** Rec. 709 luma, the weights the shader uses too. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

export const luma = (r: number, g: number, b: number): number => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;

/** What the shader computes, on the CPU: the reference the tests hold the GLSL to. */
export function muteRgb(rgb: readonly [number, number, number], o: MuteOptions): [number, number, number] {
    const l = luma(rgb[0], rgb[1], rgb[2]);
    const m = (c: number) => clamp01((l + (c - l) * o.saturation) * o.brightness);
    return [m(rgb[0]), m(rgb[1]), m(rgb[2])];
}

const num = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));

/** The GLSL that applies `o` to `gl_FragColor.rgb`. */
export function muteFragmentChunk(o: MuteOptions): string {
    const s = num(Math.min(1, Math.max(0, o.saturation)));
    const b = num(Math.max(0, o.brightness));
    return [
        '{',
        `  float kkLuma = dot(gl_FragColor.rgb, vec3(${LUMA.map(num).join(', ')}));`,
        `  gl_FragColor.rgb = clamp((vec3(kkLuma) + (gl_FragColor.rgb - vec3(kkLuma)) * ${s}) * ${b}, 0.0, 1.0);`,
        '}',
    ].join('\n');
}

/** The include every three.js lit/unlit material ends with; the chunk goes right in front of it. */
export const MUTE_ANCHOR = '#include <dithering_fragment>';

/** The least of a three.js Material this needs, so it is testable without a renderer. */
export interface MutableMaterial {
    userData: Record<string, unknown>;
    needsUpdate: boolean;
    onBeforeCompile?: (shader: { fragmentShader: string }, renderer?: unknown) => void;
    customProgramCacheKey?: () => string;
}

/** Splice the mute chunk in front of the anchor, or return the source unchanged when it is absent. */
export function muteShaderSource(fragmentShader: string, o: MuteOptions): string {
    return fragmentShader.includes(MUTE_ANCHOR)
        ? fragmentShader.replace(MUTE_ANCHOR, `${muteFragmentChunk(o)}\n${MUTE_ANCHOR}`)
        : fragmentShader;
}

/**
 * Patch a material once (flagged in `userData`) so it renders muted. Chains any `onBeforeCompile` it
 * already had, gives it its own program-cache key so muted and plain materials never share a program,
 * and asks for a recompile. Returns true when it patched, false when it already was.
 */
export function muteMaterial(m: MutableMaterial, o: MuteOptions = MENU_MUTE): boolean {
    if (m.userData.kkMuted) return false;
    m.userData.kkMuted = true;
    const previous = m.onBeforeCompile;
    const previousKey = m.customProgramCacheKey;
    m.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        shader.fragmentShader = muteShaderSource(shader.fragmentShader, o);
    };
    const key = `kk-mute-${o.saturation}-${o.brightness}`;
    m.customProgramCacheKey = () => `${previousKey ? previousKey.call(m) : ''}|${key}`;
    m.needsUpdate = true;
    return true;
}
