/**
 * Game-agnostic GPU capability probe.
 *
 * Runs once per page load against a throwaway canvas so callers can pick a
 * render tier *before* mounting a `<Canvas>` — which is what makes it possible
 * to set the `dpr` prop correctly on the first render instead of resizing the
 * drawing buffer after the fact.
 *
 * Generalised from the kowloon-knockout probe (which only ran inside the
 * Canvas, via `useThree`) so every game can share one detection path.
 */

/** Coarse GPU strength bucket: 0 software/unknown-weak, 3 strong discrete. */
export type GpuTier = 0 | 1 | 2 | 3;

export interface GpuProbe {
    gpuTier: GpuTier;
    /** Unmasked renderer string when the browser exposes it, else ''. */
    renderer: string;
    /** Highest context the browser granted. 'none' when WebGL is unavailable. */
    backend: 'webgl2' | 'webgl' | 'none';
}

const SERVER_PROBE: GpuProbe = { gpuTier: 1, renderer: '', backend: 'webgl2' };

/**
 * Map an unmasked WebGL renderer string to a coarse strength bucket.
 *
 * Deliberately conservative: it only picks a *starting* tier, and the runtime
 * governor corrects mistakes either way. Ordering matters — software renderers
 * are checked first, then discrete/high-end, then mid, then integrated.
 */
export function gpuTierFromRendererString(s: string): GpuTier {
    const g = s.toLowerCase();
    if (!g) return 1;
    // Software rasterisers — never try to run effects on these.
    if (g.includes('swiftshader') || g.includes('software') || g.includes('llvmpipe') || g.includes('basic render')) return 0;
    // High-end desktop discrete + Apple Silicon.
    if (/rtx|radeon rx|geforce (gtx|rtx)|apple m\d|arc a\d/.test(g)) return 3;
    // Capable integrated / recent mobile.
    if (/iris|apple gpu|adreno (7|8)\d\d|mali-g[78]\d|mali-g\d{3}|xclipse/.test(g)) return 2;
    // Older integrated.
    if (/intel|uhd|hd graphics|adreno|mali|powervr|videocore/.test(g)) return 1;
    return 1;
}

let cached: GpuProbe | null = null;

/** Probe the GPU once per page load. SSR-safe; returns a neutral guess on the server. */
export function probeGpu(): GpuProbe {
    if (cached) return cached;
    if (typeof document === 'undefined') return SERVER_PROBE;

    let renderer = '';
    let backend: GpuProbe['backend'] = 'none';
    try {
        const canvas = document.createElement('canvas');
        const gl =
            (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
            (canvas.getContext('webgl') as WebGLRenderingContext | null);
        if (gl) {
            backend = 'getParameter' in gl && 'drawBuffers' in gl ? 'webgl2' : 'webgl';
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
            // Release the probe context immediately — browsers cap live contexts
            // (~16), and a leaked one can starve the real game canvas.
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    } catch {
        /* probing is best-effort; fall through to the conservative default */
    }

    // No renderer string (Firefox privacy.resistFingerprinting, some Safari
    // builds) — infer from the platform rather than assuming the worst.
    const gpuTier = renderer
        ? gpuTierFromRendererString(renderer)
        : backend === 'none'
          ? 0
          : 1;

    cached = { gpuTier, renderer, backend };
    return cached;
}

/** Test seam — clears the memoised probe. */
export function resetGpuProbe(): void {
    cached = null;
}
