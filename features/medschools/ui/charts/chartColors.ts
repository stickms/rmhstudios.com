import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';

/**
 * The fixed colour mappings of the RMH Med Schools charts (owner O7, 2026-11-23; Steel section 18 D13). Colours are the
 * `--site-chart-1`..`-5` tokens (Day and Night values in `app/globals/tokens-themes.css`, validated with the dataviz
 * skill's validator); a component never writes a hex. Colour follows the entity, never its rank or position: Interview
 * is always chart-1 on every chart and page, whichever categories are switched on, and a source is always the same
 * colour on every per-type chart. Dash and width stay as the secondary cue (colour is never the only cue).
 */
export const chartVar = (slot: 1 | 2 | 3 | 4 | 5): string => `var(--site-chart-${slot})`;

/** One colour per event category. Order of slots follows the validated palette, not the canonical category order. */
export const CATEGORY_COLOR: Record<MedChartedTypeId, string> = {
  INTERVIEW: chartVar(1),
  REJECTION: chartVar(2),
  ACCEPTANCE: chartVar(3),
  SECONDARY: chartVar(4),
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
