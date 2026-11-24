import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';

/**
 * The fixed colour mappings of the RMH Med Schools charts. Colours are the `--app-med-chart-1`..`-5` tokens (the lines;
 * `-n-fill` is the pastel for fills), set per mode in `ui/medschools.css`. Every line is at least 3:1 against paper and
 * ground in both modes (`charts.test.tsx` pins it from the stylesheet). A component never writes a hex. Colour follows
 * the entity, never its rank or position: a category is the same colour on every chart and page whichever categories
 * are switched on, and a source is always the same colour on every per-type chart. Dash and width stay as the
 * secondary cue (colour is never the only cue).
 *
 * The slots are hued like the status colours (`ui/status`), so a category's line matches the swatch of its rows:
 * 1 blue (secondary), 2 orange (interview), 3 green (acceptance), 4 red (rejection), 5 yellow (waitlist).
 */
export const chartVar = (slot: 1 | 2 | 3 | 4 | 5): string => `var(--app-med-chart-${slot})`;

/** The pastel of a line colour (`var(--app-med-chart-3)` gives `var(--app-med-chart-3-fill)`), for the body of a bar. */
export const fillOf = (color: string): string => color.replace(/\)$/, '-fill)');

/** One colour per event category, the hue of its status colour. */
export const CATEGORY_COLOR: Record<MedChartedTypeId, string> = {
  SECONDARY: chartVar(1),
  INTERVIEW: chartVar(2),
  ACCEPTANCE: chartVar(3),
  REJECTION: chartVar(4),
  WAITLIST: chartVar(5),
};

/** Line weight and dash per category (secondary cue, kept from O4). */
export const CATEGORY_STYLE: Record<MedChartedTypeId, { color: string; width: number; dash?: string }> = {
  INTERVIEW: { color: CATEGORY_COLOR.INTERVIEW, width: 2 },
  ACCEPTANCE: { color: CATEGORY_COLOR.ACCEPTANCE, width: 2, dash: '8 3 2 3' },
  SECONDARY: { color: CATEGORY_COLOR.SECONDARY, width: 2, dash: '2 3' },
  WAITLIST: { color: CATEGORY_COLOR.WAITLIST, width: 2, dash: '6 3' },
  REJECTION: { color: CATEGORY_COLOR.REJECTION, width: 2, dash: '3 3' },
};

/** One colour per source, in the order a school's primary is chosen (CycleTrack first). */
export const SOURCE_COLOR: Record<MedSourceId, string> = {
  CYCLETRACK: chartVar(1),
  ADMIT: chartVar(2),
  SDN: chartVar(3),
  RMH: chartVar(4),
  MDAPPLICANTS: chartVar(5),
};

/** The primary source is solid; each comparison source has its own dash. */
export const SOURCE_DASH: Record<MedSourceId, string | undefined> = {
  CYCLETRACK: undefined,
  ADMIT: '6 3',
  SDN: '2 3',
  RMH: '8 3 2 3',
  MDAPPLICANTS: '3 3',
};

/** Cycles on the History overlay, newest first: their own fixed order (a cycle is a different thing from a category). */
const CYCLE_SLOTS = [1, 2, 3, 4, 5] as const;
const CYCLE_DASH: (string | undefined)[] = [undefined, '6 3', '2 3', '8 3 2 3', '3 3'];
export const cycleColor = (rank: number): string => chartVar(CYCLE_SLOTS[rank % CYCLE_SLOTS.length]!);
export const cycleDash = (rank: number): string | undefined => CYCLE_DASH[rank % CYCLE_DASH.length];
