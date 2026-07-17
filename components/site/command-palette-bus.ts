'use client';

/**
 * Tiny, dependency-free bus for opening the ⌘K command palette.
 *
 * Kept separate from CommandPalette.tsx (which statically pulls in fuse.js and
 * the full games/apps registries) so callers that only need to *open* the
 * palette — the "Jump back in" rail, the keyboard-shortcuts sheet — don't drag
 * that whole module into their chunk. The palette itself is lazy-mounted
 * (see CommandPaletteMount.tsx) and listens for this event.
 */
export const COMMAND_PALETTE_EVENT = 'rmh:command-palette';

/** Open the palette from anywhere (e.g. a toolbar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
}
