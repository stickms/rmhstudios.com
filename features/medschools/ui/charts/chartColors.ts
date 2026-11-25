import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';
import { STATUS, statusOfEvent } from '../status/status';

/**
 * The fixed colour mappings of the RMH Med Schools charts. A category is drawn in its STATUS colour (owner
 * 2026-11-24): the line, the bar and the legend swatch are `var(--app-med-<stem>-text)`, the same token the row's
 * status words use, so a category matches its row icon and words everywhere (acceptance green, rejection red, hold dark
 * purple, secondary orange, waitlist yellow, interview light blue, matriculation rose, withdrawn neutral). Its pastel
 * fill is `var(--app-med-<stem>-fill)`. Sources and cycles are a different thing from a category and keep their own
 * slots, `--app-med-chart-1`..`-5`. Every line holds 3:1 against paper and ground in both modes (`status.test.tsx`
 * holds the status text at 4.5:1, `charts.test.tsx` the slots at 3:1). A component never writes a hex. Colour follows
 * the entity, never its rank or position. Dash and width stay as the secondary cue (colour is never the only cue).
 */
export const chartVar = (slot: 1 | 2 | 3 | 4 | 5): string => `var(--app-med-chart-${slot})`;

/** A status key's line colour (the status text token). */
export const statusLine = (stem: string): string => `var(--app-med-${stem}-text)`;

/** The pastel of a category's line colour (`var(--app-med-accept-text)` gives `var(--app-med-accept-fill)`). */
export const fillOf = (color: string): string => color.replace(/-text\)$/, '-fill)');

/** One colour per event category: its status colour. */
export const CATEGORY_COLOR: Record<MedChartedTypeId, string> = {
  SECONDARY: statusLine(STATUS[statusOfEvent('SECONDARY')].stem),
  INTERVIEW: statusLine(STATUS[statusOfEvent('INTERVIEW')].stem),
  ACCEPTANCE: statusLine(STATUS[statusOfEvent('ACCEPTANCE')].stem),
  REJECTION: statusLine(STATUS[statusOfEvent('REJECTION')].stem),
  WAITLIST: statusLine(STATUS[statusOfEvent('WAITLIST')].stem),
};

/** Line weight and dash per category (secondary cue, kept from O4). */
export const CATEGORY_STYLE: Record<MedChartedTypeId, { color: string; width: number; dash?: string }> = {
  INTERVIEW: { color: CATEGORY_COLOR.INTERVIEW, width: 2 },
  ACCEPTANCE: { color: CATEGORY_COLOR.ACCEPTANCE, width: 2, dash: '8 3 2 3' },
  SECONDARY: { color: CATEGORY_COLOR.SECONDARY, width: 2, dash: '2 3' },
  WAITLIST: { color: CATEGORY_COLOR.WAITLIST, width: 2, dash: '6 3' },
  REJECTION: { color: CATEGORY_COLOR.REJECTION, width: 2, dash: '10 4' },
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
