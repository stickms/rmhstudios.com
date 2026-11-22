/**
 * RMHType key statistics: what a finished run sends (pure, client-safe, zod-free).
 *
 * Solo, daily and lesson runs fold each keystroke into a `createKeyStatAccumulator()` (`./keystats`) and call
 * `buildKeyStatsBody` once, when the run finishes. The switch ("Record key statistics", on by default) is read here,
 * before a body exists, so a member who turned it off never has a request built. What leaves the device is three
 * counters per key and the layout: never the order the keys were pressed in, never any text.
 */
import { DEFAULT_LAYOUT, sanitizeAggregates, type KeyStatAggregate, type TypingLayout } from '@/lib/rmhtype/keystats';

export interface KeyStatsBody {
  layout: TypingLayout;
  keys: KeyStatAggregate[];
}

export interface RecordKeyStatsInput {
  /** The "Record key statistics" switch. Anything but an explicit `false` counts as on. */
  enabled: boolean | undefined;
  /** True only when the run was completed; an abandoned run records nothing. */
  finished: boolean;
  aggregates: readonly KeyStatAggregate[];
  layout?: TypingLayout;
}

/** The one request body for a finished run, or `null` when nothing should be sent. */
export function buildKeyStatsBody(input: RecordKeyStatsInput): KeyStatsBody | null {
  if (input.enabled === false) return null;
  if (!input.finished) return null;
  const keys = sanitizeAggregates(input.aggregates);
  if (keys.length === 0) return null;
  return { layout: input.layout ?? DEFAULT_LAYOUT, keys };
}
