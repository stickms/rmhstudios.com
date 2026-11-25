import type { SourcePref } from '../../engine/source-pref';

/**
 * The two sources' own favicons, used for attribution on the source toggle (owner 2026-11-24), as single-colour paths
 * in `currentColor`, so each is the text colour in light and dark and the pressed state never rests on colour.
 *
 * - CycleTrack: cycletrack.org's favicon (`/static/images/ct-favicon.svg`, a rounded square with "CT" stroked in it),
 *   redrawn exactly from its own geometry on a 24 grid: the square filled, the C and T strokes as outlined holes.
 * - Admit.org: admit.org's touch icon (`/apple-icon.png`, a mortarboard with a hook), its dark outline traced
 *   (threshold, potrace, then straight-line simplification); the yellow fill is left as the ground.
 *
 * Fetched once each, robots.txt allowing, on 2026-11-25. Decorative here: the control's accessible name is the source.
 */
const PATHS: Record<SourcePref, string> = {
  cycletrack:
    'M5.25 0H18.75A5.25 5.25 0 0 1 24 5.25V18.75A5.25 5.25 0 0 1 18.75 24H5.25A5.25 5.25 0 0 1 0 18.75V5.25A5.25 5.25 0 0 1 5.25 0ZM11.57 6.99A6.38 6.38 0 1 0 11.57 17.01A1.13 1.13 0 0 0 10.18 15.24A4.13 4.13 0 1 1 10.18 8.76A1.13 1.13 0 0 0 11.57 6.99ZM13.5 5.63H20.63A1.13 1.13 0 0 1 20.63 7.88H18.19V17.63A1.13 1.13 0 0 1 15.94 17.63V7.88H13.5A1.13 1.13 0 0 1 13.5 5.63Z',
  admit:
    'M12 22.6L5.1 18.6L5 13L0 10.1L0 8.2L12.1 1.4L24 8.3L24 10.1L12 17L8.5 14.9L8.5 13.1L12 15L22.1 9.1L11.9 3.3L1.9 9.1L6.6 11.9L6.7 17.6L11.9 20.6L17.3 17.6L17.3 16.1L19 15.1L19 18.6ZM12.6 12.6L5.9 8.8L7.8 7.9L13.5 11.1L14.2 11.6ZM16.5 10.3L9.8 6.5L11.6 5.5L16.3 8.2L18.1 9.2Z',
};

export function SourceGlyph({
  source,
  size = 18,
  className,
}: {
  source: SourcePref;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-source-glyph={source}
    >
      <path fill="currentColor" fillRule="evenodd" d={PATHS[source]} />
    </svg>
  );
}
