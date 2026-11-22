/**
 * The admin membership grant (the pure half; the dialog is `components/admin/GrantMembershipDialog.tsx`).
 *
 * A grant is a tier and a whole number of months from 1 to 24, or a revoke of the active grants. The months field is
 * parsed strictly: anything that is not a whole number in range is `null` and the dialog's Grant stays disabled. It
 * used to be a second prompt whose empty or cancelled answer fell back to one month, so Cancel granted.
 */

export const GRANT_MIN_MONTHS = 1;
export const GRANT_MAX_MONTHS = 24;

export type GrantChoice = 'starter' | 'pro' | 'revoke';
export type GrantBody = { tier: 'starter' | 'pro'; months: number } | { revoke: true };

export function isGrantChoice(value: string): value is GrantChoice {
  return value === 'starter' || value === 'pro' || value === 'revoke';
}

/** A whole number of months in range, or null. No clamping and no default. */
export function parseGrantMonths(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const months = Number(trimmed);
  return months >= GRANT_MIN_MONTHS && months <= GRANT_MAX_MONTHS ? months : null;
}

/** The request body for the dialog's current fields, or null while they are not a valid grant. */
export function buildGrantBody(choice: GrantChoice, monthsText: string): GrantBody | null {
  if (choice === 'revoke') return { revoke: true };
  const months = parseGrantMonths(monthsText);
  return months === null ? null : { tier: choice, months };
}
