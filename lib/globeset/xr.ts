/**
 * GlobeSet in the room — the WebXR half, kept away from the renderer.
 *
 * Detection, the physical dimensions, and the card face as data. Everything
 * here is pure or DOM-only so it can be reasoned about (and tested) without an
 * XR device, a GPU or a headset.
 *
 * ## What "AR" means here, precisely
 *
 * An `immersive-ar` session hands the page a pose and lets the XR runtime
 * composite the scene over the device's own camera feed. The page never
 * receives camera pixels, which is why this needs `xr-spatial-tracking` in the
 * Permissions-Policy and explicitly does NOT need `camera` — see the header in
 * `deploy/apache/rmhstudios.conf` and the gate in
 * `lib/__tests__/permissions-policy.test.ts`.
 *
 * It is also the only mode with real **6DoF**: the globe is anchored to a
 * point in the room, so walking round it gives true parallax. The gyroscope
 * mode on the ordinary page is 3DoF — orientation only — and turning in place
 * there does the same thing as walking, which is the tell.
 */

/** Radius of the globe once it is standing in the room, in metres. */
export const AR_GLOBE_RADIUS_M = 0.22;

/** A card's width in the room, in metres. About the size of a playing card. */
export const AR_CARD_WIDTH_M = 0.1;
export const AR_CARD_HEIGHT_M = AR_CARD_WIDTH_M * 0.7;

/** How far in front of the viewer the globe lands when no surface was found. */
export const AR_FALLBACK_DISTANCE_M = 0.9;

/** Pixels per metre used when baking a card face into a texture. */
export const AR_TEXTURE_PPM = 2048;

interface XRCapableNavigator {
  xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
}

/** True where the browser exposes WebXR at all. Says nothing about hardware. */
export function hasWebXr(): boolean {
  return typeof navigator !== 'undefined' && 'xr' in navigator;
}

/**
 * Whether to offer "view in your room" at all.
 *
 * Deliberately conservative and permission-free, in the spirit of
 * `lib/neon-driftway/headset.ts`: `isSessionSupported` prompts for nothing and
 * is the only answer that means anything, so a `false` here hides the control
 * rather than showing one that fails on press. iOS Safari has no `navigator.xr`
 * whatsoever, so it resolves `false` there and the button never appears —
 * which is the honest outcome, because Apple's only AR path is a
 * non-interactive model viewer that could not be played.
 *
 * Never throws and never rejects; resolves `false` on anything unexpected.
 */
export async function arSupported(): Promise<boolean> {
  try {
    if (!hasWebXr()) return false;
    const xr = (navigator as XRCapableNavigator).xr;
    if (typeof xr?.isSessionSupported !== 'function') return false;
    return (await xr.isSessionSupported('immersive-ar')) === true;
  } catch {
    return false;
  }
}

/* ── The card face, as data ──────────────────────────────────────────────── */

/** Dot centres on the card face, in fractions of its width/height. */
export const AR_DOT_SLOTS: readonly { x: number; y: number }[] = [
  { x: 0.2, y: 0.305 },
  { x: 0.5, y: 0.305 },
  { x: 0.8, y: 0.305 },
  { x: 0.2, y: 0.72 },
  { x: 0.5, y: 0.72 },
  { x: 0.8, y: 0.72 },
];

/** Dot radius, as a fraction of the card's width. Matches the SVG board. */
export const AR_DOT_RADIUS = 0.11;

/**
 * Resolve the `--globeset-*` palette to concrete colours.
 *
 * WebGL cannot read a CSS custom property, and the values move with the theme
 * and the colour-vision mode, so they are sampled from a live element once per
 * session rather than duplicated as constants. A missing property falls back to
 * a visible magenta: a card that renders in the wrong colour is a bug the
 * player can report, one that renders invisibly is a bug nobody can describe.
 */
export function readPalette(from: Element): {
  face: string;
  edge: string;
  ink: string;
  dots: string[];
} {
  const styles = getComputedStyle(from);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    face: read('--globeset-card-face', '#f7f7f5'),
    edge: read('--globeset-card-edge', '#c9cbd2'),
    ink: read('--globeset-dot-ink', '#17181c'),
    dots: [
      read('--globeset-dot-red', '#ff00ff'),
      read('--globeset-dot-orange', '#ff00ff'),
      read('--globeset-dot-yellow', '#ff00ff'),
      read('--globeset-dot-green', '#ff00ff'),
      read('--globeset-dot-blue', '#ff00ff'),
      read('--globeset-dot-purple', '#ff00ff'),
    ],
  };
}
