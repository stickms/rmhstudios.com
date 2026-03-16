/**
 * Snap a beat position to the nearest grid line.
 */
export function snapToGrid(beat: number, snapValue: number, enabled: boolean): number {
  if (!enabled || snapValue <= 0) return beat;
  return Math.round(beat / snapValue) * snapValue;
}

/**
 * Convert a beat position to pixel x-coordinate.
 */
export function beatToPixel(beat: number, pixelsPerBeat: number, scrollX: number): number {
  return beat * pixelsPerBeat - scrollX;
}

/**
 * Convert a pixel x-coordinate to a beat position.
 */
export function pixelToBeat(px: number, pixelsPerBeat: number, scrollX: number): number {
  return (px + scrollX) / pixelsPerBeat;
}

/**
 * Get the number of pixels per beat based on zoom level.
 * At zoom 1.0, one beat = 40px.
 */
export function getPixelsPerBeat(zoomX: number): number {
  return 40 * zoomX;
}

/**
 * Calculate visible beat range given viewport width and scroll.
 */
export function getVisibleBeatRange(
  viewportWidth: number,
  pixelsPerBeat: number,
  scrollX: number,
): { startBeat: number; endBeat: number } {
  return {
    startBeat: scrollX / pixelsPerBeat,
    endBeat: (scrollX + viewportWidth) / pixelsPerBeat,
  };
}

/**
 * Format a beat position as bars.beats.ticks string.
 */
export function formatBeatPosition(beat: number, beatsPerBar: number): string {
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const beatInBar = Math.floor(beat % beatsPerBar) + 1;
  const tick = Math.floor((beat % 1) * 100);
  return `${bar}.${beatInBar}.${tick.toString().padStart(2, '0')}`;
}
