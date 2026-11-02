/**
 * Narrative tunables (H3.1). Times are seconds on the simulation clock (`world.curtime`), which
 * stops while the game is paused, so a line never runs out behind the pause menu.
 */

/** Shortest a line is ever shown, whatever its text. */
export const LINE_MIN_MS = 1800;
/** Reading time per character of the default text (about 18 characters a second). */
export const LINE_MS_PER_CHAR = 55;
/** Fixed lead-out added to a computed duration. */
export const LINE_PAD_MS = 700;
/** Silence between two lines of one script. */
export const LINE_GAP_S = 0.25;
/** A line must have been up this long before +use may skip it (so opening a door never skips). */
export const SKIP_GRACE_S = 0.4;
/** Level of the radio's static bed under a radio line (0..1, multiplies the bank's own level). */
export const RADIO_STATIC_VOLUME = 0.5;
/** Level of the click that opens and closes a radio line. */
export const RADIO_CLICK_VOLUME = 1;
