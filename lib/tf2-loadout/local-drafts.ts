/**
 * Per-class loadout drafts in localStorage, so the builder keeps what you were
 * working on for each class without an account. Signing in adds saving,
 * sharing and the workshop; it is never needed to build.
 */

import {
  readJson,
  writeJson,
} from '@/lib/core/persist';
import type {
  LoadoutSlots,
  TfClass,
} from './catalog-types';

const KEY =
  'rmh-tf2-loadout-drafts';

type Drafts =
  Partial<
    Record<
      TfClass,
      LoadoutSlots
    >
  >;

function read(): Drafts {
  return readJson<Drafts>(
    KEY,
    {},
    {
      validate:
        (
          v,
        ) =>
          v &&
          typeof v ===
            'object'
            ? (v as Drafts)
            : undefined,
    },
  );
}

export function loadDraft(
  cls: TfClass,
): LoadoutSlots {
  return (
    read()[
      cls
    ] ??
    {}
  );
}

/**
 * Whether this class has ever been edited here. A class with no draft starts from its stock
 * loadout; one the player emptied on purpose keeps an empty draft, so it stays empty.
 */
export function hasDraft(
  cls: TfClass,
): boolean {
  return (
    read()[
      cls
    ] !==
    undefined
  );
}

export function saveDraft(
  cls: TfClass,
  slots: LoadoutSlots,
): void {
  // Storage unavailable (private mode, quota): the draft just isn't kept.
  const all =
    read();
  all[
    cls
  ] =
    slots;
  writeJson(
    KEY,
    all,
  );
}
