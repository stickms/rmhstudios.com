import { describe, expect, it } from 'vitest';
import {
    MENU_MUTE, MUTE_ANCHOR, RIG_COLORS, RIG_COLORS_MUTED, hexSaturation, luma, muteFragmentChunk, muteMaterial, muteRgb,
    muteShaderSource, rigColors, type MutableMaterial,
} from './mute';

describe('the muted lighting rig', () => {
    it('every colour of the muted rig is less saturated than the vivid one', () => {
        for (const key of Object.keys(RIG_COLORS) as (keyof typeof RIG_COLORS)[]) {
            expect(hexSaturation(RIG_COLORS_MUTED[key])).toBeLessThan(hexSaturation(RIG_COLORS[key]));
        }
    });
    it('the rim lights lose the most: hot pink and cyan are the loudest part of the rig', () => {
        expect(hexSaturation(RIG_COLORS.pink) - hexSaturation(RIG_COLORS_MUTED.pink)).toBeGreaterThan(0.2);
        expect(hexSaturation(RIG_COLORS.cyan) - hexSaturation(RIG_COLORS_MUTED.cyan)).toBeGreaterThan(0.2);
    });
    it('rigColors picks by flag; hexSaturation is 0 for greys and 1 for pure primaries', () => {
        expect(rigColors(false)).toBe(RIG_COLORS);
        expect(rigColors(true)).toBe(RIG_COLORS_MUTED);
        expect(hexSaturation('#808080')).toBe(0);
        expect(hexSaturation('#ff0000')).toBeCloseTo(1);
    });
});

const mat = (): MutableMaterial => ({ userData: {}, needsUpdate: false });
const SHADER = 'void main() {\n  gl_FragColor = vec4(1.0);\n  #include <tonemapping_fragment>\n  #include <dithering_fragment>\n}';

describe('muteRgb', () => {
    it('leaves a neutral grey the same hue and only darkens it', () => {
        const [r, g, b] = muteRgb([0.5, 0.5, 0.5], MENU_MUTE);
        expect(r).toBeCloseTo(g, 6);
        expect(g).toBeCloseTo(b, 6);
        expect(r).toBeCloseTo(0.5 * MENU_MUTE.brightness, 6);
    });
    it('pulls a saturated colour toward its luma: less chroma, same ordering of channels', () => {
        const hot = [1, 0.1, 0.5] as const;
        const out = muteRgb(hot, { saturation: 0.5, brightness: 1 });
        const chroma = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
        expect(chroma(out)).toBeCloseTo(chroma(hot) * 0.5, 6);
        expect(out[0]).toBeGreaterThan(out[2]);
        expect(out[2]).toBeGreaterThan(out[1]);
        expect(luma(out[0], out[1], out[2])).toBeCloseTo(luma(...hot), 6); // luma kept (brightness 1)
    });
    it('saturation 0 is greyscale, saturation 1 and brightness 1 change nothing', () => {
        const g = muteRgb([0.9, 0.2, 0.1], { saturation: 0, brightness: 1 });
        expect(g[0]).toBeCloseTo(g[1], 6);
        expect(muteRgb([0.3, 0.6, 0.9], { saturation: 1, brightness: 1 })).toEqual([0.3, 0.6, 0.9]);
    });
    it('always stays in 0..1', () => {
        for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 0, 1]] as const) {
            for (const o of [MENU_MUTE, { saturation: 2, brightness: 3 }, { saturation: -1, brightness: 0 }]) {
                for (const v of muteRgb(c, o)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
            }
        }
    });
});

describe('the shader chunk', () => {
    it('uses the same luma weights and numbers as the CPU reference', () => {
        const chunk = muteFragmentChunk({ saturation: 0.5, brightness: 0.8 });
        expect(chunk).toContain('vec3(0.2126, 0.7152, 0.0722)');
        expect(chunk).toContain('* 0.5)');
        expect(chunk).toContain('* 0.8,');
        expect(chunk).toContain('gl_FragColor.rgb');
    });
    it('prints whole numbers as GLSL floats (an int literal would not compile)', () => {
        const chunk = muteFragmentChunk({ saturation: 1, brightness: 1 });
        expect(chunk).toContain('* 1.0)');
        expect(chunk).toContain('* 1.0,');
        expect(chunk).not.toMatch(/\* 1\)/);
    });
    it('is spliced right in front of the dithering include, once', () => {
        const out = muteShaderSource(SHADER, MENU_MUTE);
        expect(out.indexOf('kkLuma')).toBeLessThan(out.indexOf(MUTE_ANCHOR));
        expect(out.indexOf('kkLuma')).toBeGreaterThan(out.indexOf('tonemapping_fragment'));
        expect(out.match(/kkLuma = /g)).toHaveLength(1);
    });
    it('leaves a shader without the anchor alone rather than breaking it', () => {
        expect(muteShaderSource('void main() {}', MENU_MUTE)).toBe('void main() {}');
    });
});

describe('muteMaterial', () => {
    it('patches once, asks for a recompile and a program of its own', () => {
        const m = mat();
        expect(muteMaterial(m)).toBe(true);
        expect(m.needsUpdate).toBe(true);
        expect(m.customProgramCacheKey!()).toContain('kk-mute');
        const shader = { fragmentShader: SHADER };
        m.onBeforeCompile!(shader);
        expect(shader.fragmentShader).toContain('kkLuma');
        m.needsUpdate = false;
        expect(muteMaterial(m)).toBe(false); // flagged: a second pass does nothing
        expect(m.needsUpdate).toBe(false);
    });
    it('keeps whatever onBeforeCompile and cache key the material already had', () => {
        const m = mat();
        let ran = 0;
        m.onBeforeCompile = (s) => { ran++; s.fragmentShader += '\n// original'; };
        m.customProgramCacheKey = () => 'orig';
        muteMaterial(m);
        const shader = { fragmentShader: SHADER };
        m.onBeforeCompile!(shader);
        expect(ran).toBe(1);
        expect(shader.fragmentShader).toContain('// original');
        expect(shader.fragmentShader).toContain('kkLuma');
        expect(m.customProgramCacheKey!()).toMatch(/^orig\|kk-mute/);
    });
    it('different strengths get different programs', () => {
        const a = mat(), b = mat();
        muteMaterial(a, { saturation: 0.5, brightness: 0.8 });
        muteMaterial(b, { saturation: 0.3, brightness: 0.8 });
        expect(a.customProgramCacheKey!()).not.toBe(b.customProgramCacheKey!());
    });
});
