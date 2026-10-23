/**
 * Is this browser rendering on a real GPU, or in software?
 *
 * CI runners have no GPU: Chromium falls back to SwiftShader (or Mesa's llvmpipe), where every GL frame is slow
 * enough that the jelly governor (lib/jelly/governor.ts) legitimately steps the ambient clock down to 0 ("static
 * haze"). On such a machine a check that needs real frames — R7 "never freezes while haze is visible" — cannot be
 * judged either way. Scripts call this once and report those checks as SKIP with the renderer string, never as a
 * silent pass; every deterministic check (budgets, ledger, rest-return, teardown, frames under `still`) stays a real
 * failure regardless.
 *
 * `JELLY_ASSUME_GPU=1` / `JELLY_ASSUME_GPU=0` overrides the detection (for a machine whose driver string is unusual).
 */

/** Renderer strings that mean "no GPU": SwiftShader (Chromium's own), llvmpipe / softpipe (Mesa), Microsoft Basic Render. */
export const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * @param {import('playwright').Page} page any page of the browser under test
 * @returns {Promise<{ vendor: string, renderer: string, software: boolean, webgl: boolean }>}
 */
export async function probeRenderer(page) {
  const info = await page
    .evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) return { vendor: '', renderer: '', webgl: false };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? '');
      const renderer = String(
        gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '',
      );
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return { vendor, renderer, webgl: true };
    })
    .catch(() => ({ vendor: '', renderer: '', webgl: false }));
  const forced = process.env.JELLY_ASSUME_GPU;
  // No WebGL at all is the most software of renderers: nothing GPU-bound can be judged.
  const software =
    forced === '1'
      ? false
      : forced === '0'
        ? true
        : !info.webgl || SOFTWARE_GL.test(`${info.vendor} ${info.renderer}`);
  return { ...info, software };
}

/** One line for a log: `GL: Google Inc. (Google) / ANGLE (… SwiftShader …) — software`. */
export function describeRenderer(gpu) {
  return `GL: ${gpu.webgl ? `${gpu.vendor} / ${gpu.renderer}` : 'no WebGL'} — ${gpu.software ? 'software (GPU-only checks SKIP)' : 'hardware'}`;
}

/** Emit a GitHub Actions annotation for a skipped check, so a skip is visible on the run, not only in the log. */
export function annotateSkip(title, message) {
  // A workflow command must go to stdout.
  if (process.env.GITHUB_ACTIONS === 'true')
    process.stdout.write(`::notice title=${title}::${message.replace(/\n/g, ' ')}\n`);
}
