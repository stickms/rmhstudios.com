import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';

/** Fraction of the limit at which the composer starts showing a counter. */
export const LENGTH_WARN_RATIO = 0.9;

export type LengthState = 'hidden' | 'warn' | 'full';

/**
 * Whether a message composer should show its used/max counter.
 *
 * The text field enforces `maxLength` natively, which silently drops keystrokes
 * (and truncates pastes) with no signal. The counter appears only near the
 * limit so it never adds noise to ordinary messages.
 */
export function lengthState(used: number, max: number = MESSAGE_MAX_LENGTH): LengthState {
  if (used >= max) return 'full';
  if (used >= max * LENGTH_WARN_RATIO) return 'warn';
  return 'hidden';
}
