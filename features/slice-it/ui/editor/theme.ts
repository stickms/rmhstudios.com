/**
 * The colours the timeline canvas draws with, resolved once per theme change.
 *
 * `getComputedStyle()` flushes pending style and layout, so calling it inside a
 * draw loop costs a full style recalculation every time. The 07-30 performance
 * audit removed exactly this pattern from the game's own renderer (1 + N forced
 * recalcs per frame); `GameCanvas.tsx` carries the long version of the rationale.
 * Same mistake, same fix: read the palette on mount, again when the theme class
 * changes, and never per frame.
 *
 * Resolved against the CANVAS, not `<html>`: the `--slice-*` palette is scoped to
 * `.slice-theme` (a wrapper div), so reading it off `document.documentElement`
 * returns "" and silently falls back to the light-mode values in both themes.
 */

import { canvasGlowEnabled } from '@/lib/render/canvas2d-fx';

export interface EditorTheme {
  /** False on low-end devices and under reduced motion — flat fills, same geometry. */
  glow: boolean;
  bg: string;
  shadowDark: string;
  shadowLight: string;
  text: string;
  textMuted: string;
  primary: string;
  accent: string;
  holdTrail: string;
}

export function readEditorTheme(
  element: HTMLElement,
): EditorTheme {
  const cs =
    getComputedStyle(
      element,
    );
  const v =
    (
      name: string,
      fallback: string,
    ) =>
      cs
        .getPropertyValue(
          name,
        )
        .trim() ||
      fallback;
  return {
    glow: canvasGlowEnabled(),
    bg: v(
      '--slice-bg',
      '#0b1241',
    ),
    shadowDark:
      v(
        '--slice-shadow-dark',
        'rgba(2, 4, 15, 0.78)',
      ),
    shadowLight:
      v(
        '--slice-shadow-light',
        'rgba(45, 179, 240, 0.07)',
      ),
    text: v(
      '--slice-text',
      '#f0f1f6',
    ),
    textMuted:
      v(
        '--slice-text-muted',
        '#8f9ac9',
      ),
    primary:
      v(
        '--slice-primary',
        '#2db3f0',
      ),
    accent:
      v(
        '--slice-accent',
        '#f4509f',
      ),
    holdTrail:
      v(
        '--slice-hold-trail',
        'rgba(234, 246, 255, 0.5)',
      ),
  };
}

/**
 * Quantisation colouring — the genre standard (StepMania note colours), and the
 * single change that makes a dense chart readable at a glance
 * (`docs/slice-it-chart-editor.md` §4.3).
 *
 * Fixed rather than themed on purpose: these are a notation, the way a treble
 * clef is, and an author who learned them in another editor must not have to
 * relearn them here because a theme moved. §14 requires colour never be the only
 * channel, so the timeline also varies note SHAPE by type and prints the
 * division in the inspector.
 */
export const QUANT_COLORS: Record<
  number,
  string
> =
  {
    1: '#ef4444', // quarter    — red
    2: '#3b82f6', // eighth     — blue
    3: '#a855f7', // triplet    — purple
    4: '#eab308', // sixteenth  — yellow
    6: '#ec4899', // 1/24
    8: '#f97316', // 1/32
    16: '#94a3b8', // off-grid  — grey
  };

/** Human-readable name for a quantisation bucket, for the inspector and aria. */
export const QUANT_LABELS: Record<
  number,
  string
> =
  {
    1: '1/4',
    2: '1/8',
    3: '1/12',
    4: '1/16',
    6: '1/24',
    8: '1/32',
    16: 'off-grid',
  };
