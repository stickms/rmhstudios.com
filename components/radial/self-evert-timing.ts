/**
 * How long the globe's self-eversion runs (`LiquidGlobe`), shared with the hub, which keeps the globe mounted
 * and carries it down onto the orb for exactly this long while it plays (`RadialHub`, `landing`).
 */
export const SELF_EVERT_MS = 1500;

/**
 * Dispatched on `window` by the hub when it navigates from its own links (the foot: identity, settings, sign in)
 * so the globe turns itself inside out for them exactly as it does for a pin.
 */
export const GLOBE_EVERT_EVENT = 'rmh:globe-evert';
