/**
 * Appearance sync is per device (owner, 2026-11-23). Turning it back on settles which side is right with "most recent
 * wins": this device's last appearance change (`APPEARANCE_CHANGED_AT_KEY`) against the account row's `updatedAt`.
 * Design: docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md §Appearance sync.
 *
 * Field by field. A field this device never set is never pushed: a theme that only follows the OS (`style: null`)
 * would otherwise wipe the theme the other devices chose. Readable font keeps the existing rule that the account wins
 * (its GET answers `false` for unset, so it is always "set"), unless there is no account row at all. Equal or unknown
 * device time leaves the account winning, as before this switch existed. Pure; client-safe.
 */
import { APPEARANCE_CHANGED_AT_KEY } from '@/lib/appearance/fonts';
import { readString, writeString } from '@/lib/core/persist';

export interface AppearanceFields {
  /** null = this device follows its OS theme (nothing chosen). */
  style: string | null;
  readableFont: boolean;
  colorVision: string;
  jellyMotion: string;
  fontMain: string;
  fontReading: string;
  fontMono: string;
}

export interface AccountAppearance {
  style?: string | null;
  readableFont?: boolean | null;
  colorVision?: string | null;
  jellyMotion?: string | null;
  fontMain?: string | null;
  fontReading?: string | null;
  fontMono?: string | null;
}

const FIELDS = ['style', 'readableFont', 'colorVision', 'jellyMotion', 'fontMain', 'fontReading', 'fontMono'] as const;

export function mergeOnSyncEnable({
  device,
  deviceChangedAt,
  account,
  accountUpdatedAt,
}: {
  device: AppearanceFields;
  deviceChangedAt: number | null;
  account: AccountAppearance | null;
  accountUpdatedAt: string | null;
}): { push: Partial<AppearanceFields>; apply: Partial<AppearanceFields> } {
  const push: Partial<AppearanceFields> = {};
  const apply: Partial<AppearanceFields> = {};
  const set = <K extends keyof AppearanceFields>(into: Partial<AppearanceFields>, k: K, v: AppearanceFields[K]) => {
    into[k] = v;
  };
  const accountTime = accountUpdatedAt ? Date.parse(accountUpdatedAt) : NaN;
  if (!account || Number.isNaN(accountTime)) {
    for (const k of FIELDS) if (device[k] !== null) set(push, k, device[k]);
    return { push, apply };
  }
  const deviceNewer = deviceChangedAt != null && deviceChangedAt > accountTime;
  for (const k of FIELDS) {
    const remote = account[k];
    const accountWins = !deviceNewer || k === 'readableFont';
    if (accountWins) {
      if (remote != null) set(apply, k, remote as AppearanceFields[typeof k]);
    } else if (device[k] !== null) {
      set(push, k, device[k]);
    }
  }
  return { push, apply };
}

/** Record a user's appearance change on this device, for the merge above. */
export function markAppearanceChanged(now: number = Date.now()): void {
  writeString(APPEARANCE_CHANGED_AT_KEY, String(now));
}

/** This device's last appearance change, or null when it has none recorded. */
export function appearanceChangedAt(): number | null {
  const v = Number(readString(APPEARANCE_CHANGED_AT_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}
