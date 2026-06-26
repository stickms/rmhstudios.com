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
