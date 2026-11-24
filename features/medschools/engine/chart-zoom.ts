/**
 * The charts' zoom and pan (owner 2026-11-24): a view window over the x domain (days, or calendar days for History).
 * Pure, client-safe and unit-tested; `ui/charts/ChartFrame.tsx` drives it from the wheel, a pinch, a drag, the zoom
 * buttons and the keyboard. The full domain is the chart's own; a view never leaves it and never gets narrower than
 * `MIN_SPAN` units (a week of days), so a zoom always shows something readable.
 */
export type Domain = [number, number];
/** An input range: any pair, read only. */
type Range = readonly [number, number];

/** The narrowest view, in x units. */
export const MIN_SPAN = 7;
/** One zoom step (a button press, a `+` key, a wheel notch): the view's span is multiplied by this, or divided. */
export const ZOOM_STEP = 0.7;

const span = (d: Range) => d[1] - d[0];

/** `view` moved and trimmed to lie inside `full`, keeping its span where it can. */
export function clampView(view: Range, full: Range): [number, number] {
  const fullSpan = span(full);
  const s = Math.min(Math.max(span(view), Math.min(MIN_SPAN, fullSpan)), fullSpan);
  let a = view[0];
  if (a < full[0]) a = full[0];
  if (a + s > full[1]) a = full[1] - s;
  return [a, a + s];
}

/**
 * Zoom by `factor` (under 1 zooms in) about `anchor`, a fraction of the plot's width (0 the start, 1 the end): the data
 * under the anchor stays under it. A view that would cover the whole domain is `null` (no zoom).
 */
export function zoomView(view: Range | null, full: Range, factor: number, anchor = 0.5): [number, number] | null {
  const cur = view ?? full;
  const at = cur[0] + span(cur) * Math.min(1, Math.max(0, anchor));
  const nextSpan = span(cur) * factor;
  if (nextSpan >= span(full)) return null;
  const next = clampView([at - nextSpan * anchor, at - nextSpan * anchor + nextSpan], full);
  return next[0] <= full[0] && next[1] >= full[1] ? null : next;
}

/** Pan by `fraction` of the view's span (positive moves later in time), held inside the domain. */
export function panView(view: Range | null, full: Range, fraction: number): [number, number] | null {
  if (!view) return null;
  const d = span(view) * fraction;
  return clampView([view[0] + d, view[1] + d], full);
}

/** Whether data x lies inside the view (a mark outside it is not drawn and not probed). */
export const inView = (x: number, view: Range): boolean => x >= view[0] && x <= view[1];
