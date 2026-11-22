/** The ban dialog's two fields (reason, length in days) and the limits the ban endpoint enforces. */

export const BAN_REASON_MAX = 500;
export const BAN_DAYS_MAX = 3650;

export type BanReasonCheck = { ok: true; reason: string } | { ok: false; error: 'required' };
export type BanDaysCheck = { ok: true; days: number | null } | { ok: false };

/** A ban needs a reason: whitespace alone is the same as none. */
export function checkBanReason(text: string): BanReasonCheck {
  const reason = text.trim().slice(0, BAN_REASON_MAX);
  return reason ? { ok: true, reason } : { ok: false, error: 'required' };
}

/** Blank is a permanent ban (`null`); otherwise a whole number of days from 1 to `BAN_DAYS_MAX`. */
export function checkBanDays(text: string): BanDaysCheck {
  const value = text.trim();
  if (value === '') return { ok: true, days: null };
  if (!/^\d+$/.test(value)) return { ok: false };
  const days = Number(value);
  return days >= 1 && days <= BAN_DAYS_MAX ? { ok: true, days } : { ok: false };
}
