/** Map an unmasked WebGL GPU renderer string to a coarse strength bucket.
 *  Deliberately conservative — used only to pick a starting tier; the Phase 5
 *  adaptive governor corrects mistakes at runtime. */
export function gpuTierFromRendererString(s: string): 0 | 1 | 2 | 3 {
    const g = s.toLowerCase();
    if (!g || g.includes('swiftshader') || g.includes('software') || g.includes('llvmpipe')) return 0;
    if (g.includes('apple m') || /rtx|radeon rx|geforce (gtx|rtx)/.test(g)) return 3;
    if (g.includes('iris') || g.includes('apple gpu') || g.includes('adreno 7') || g.includes('mali-g7')) return 2;
    if (g.includes('intel') || g.includes('uhd') || g.includes('hd graphics')) return 1;
    return 1;
}

/** Is a downscaled RGBA read-back of the canvas blank: transparent, or one flat
 *  colour? The arena always has a lit floor, a neon ring and fighters in frame,
 *  so a healthy picture is never uniform. Returns null for an empty sample. */
export function isBlankSample(rgba: ArrayLike<number>, tolerance = 4): boolean | null {
    const n = rgba.length - (rgba.length % 4);
    if (n < 8) return null;
    let transparent = true;
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (let i = 0; i < n; i += 4) {
        if (rgba[i + 3] > 0) transparent = false;
        for (let c = 0; c < 3; c++) {
            const v = rgba[i + c];
            if (v < lo[c]) lo[c] = v;
            if (v > hi[c]) hi[c] = v;
        }
    }
    if (transparent) return true;
    return hi[0] - lo[0] <= tolerance && hi[1] - lo[1] <= tolerance && hi[2] - lo[2] <= tolerance;
}
