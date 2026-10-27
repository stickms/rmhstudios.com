/**
 * Per-class loadout drafts in localStorage, so the builder keeps what you were
 * working on for each class without an account. Signing in adds saving,
 * sharing and the workshop; it is never needed to build.
 */

import type { LoadoutSlots, TfClass } from './catalog-types';

const KEY = 'rmh-tf2-loadout-drafts';

type Drafts = Partial<Record<TfClass, LoadoutSlots>>;

function read(): Drafts {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Drafts) : {};
  } catch {
    return {};
  }
}

export function loadDraft(cls: TfClass): LoadoutSlots {
  return read()[cls] ?? {};
}

/**
 * Whether this class has ever been edited here. A class with no draft starts from its stock
 * loadout; one the player emptied on purpose keeps an empty draft, so it stays empty.
 */
export function hasDraft(cls: TfClass): boolean {
  return read()[cls] !== undefined;
}

export function saveDraft(cls: TfClass, slots: LoadoutSlots): void {
  try {
    const all = read();
    all[cls] = slots;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable (private mode, quota): the draft just isn't kept */
  }
}
