/**
 * Bum's Rush — the pure formatting the DOM layer needs.
 *
 * Kept out of the components so it can be tested without a canvas, a renderer
 * or a DOM, and so the HUD's per-frame path has one place to look for "did the
 * number I am about to paint actually change?" — the answer decides whether we
 * touch the DOM at all sixty times a second.
 *
 * Numerals go through `Intl.NumberFormat` per design doc §15: a timer that says
 * "1:07.24" in English says "١:٠٧٫٢٤" in Arabic, and the HUD is the one place
 * in the game where numbers are read at a glance.
 */

/** The three fields a clock is painted from. Separated so the HUD can diff them. */
export interface ClockParts {
  minutes: number;
  seconds: number;
  /** Hundredths, 0..99. */
  centis: number;
}

export function clockParts(ms: number): ClockParts {
  const clamped = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalCentis = Math.floor(clamped / 10);
  return {
    minutes: Math.floor(totalCentis / 6000),
    seconds: Math.floor(totalCentis / 100) % 60,
    centis: totalCentis % 100,
  };
}

/**
 * A stable integer identity for a rendered clock, so the HUD can skip the DOM
 * write on the ~5 of every 6 frames where the hundredths have not moved. A
 * 60 Hz loop produces a new centisecond only every 1.67 frames, and the
 * `textContent` assignment is the expensive half of painting a timer.
 */
export function clockTick(ms: number): number {
  return Math.floor((Number.isFinite(ms) && ms > 0 ? ms : 0) / 10);
}

/** `m:ss.cc`, with the locale's own digits and separators. */
export function formatClock(ms: number, nf: Intl.NumberFormat): string {
  const { minutes, seconds, centis } = clockParts(ms);
  return `${nf.format(minutes)}:${pad2(seconds, nf)}.${pad2(centis, nf)}`;
}

function pad2(value: number, nf: Intl.NumberFormat): string {
  // Padding is done on the FORMATTED string, not on the number, because a
  // locale with two-character digits (Arabic-Indic) needs two of ITS digits,
  // not two ASCII ones.
  const text = nf.format(value);
  return value < 10 ? `${nf.format(0)}${text}` : text;
}

/** "3 / 9" style progress, both sides localised. */
export function formatFraction(done: number, total: number, nf: Intl.NumberFormat): string {
  return `${nf.format(done)} / ${nf.format(total)}`;
}

export function formatPercent(value0to100: number, nf: Intl.NumberFormat): string {
  return `${nf.format(Math.round(value0to100))}%`;
}

/**
 * A cosmetic id as a human string, for the wardrobe.
 *
 * Cosmetic ids are kebab-case and there are 62 of them; giving each one a
 * hand-written `t()` call would be 62 keys that say the same thing the id
 * already says. The caller passes this through `t(\`cosmetic.${id}\`, {
 * defaultValue: humaniseId(id) })`, so a translator can override any of them
 * and English costs nothing.
 */
export function humaniseId(id: string): string {
  return id
    .split('-')
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}
