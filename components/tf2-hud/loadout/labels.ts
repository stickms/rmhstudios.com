/**
 * Display names for classes and loadout slots. Strings go through `t()` at the
 * call site; this only decides which key and default each slot or class uses.
 */

import type { TFunction } from 'i18next';
import type { TfClass } from '@/lib/tf2-loadout/catalog-types';

export const CLASS_DEFAULT: Record<
  TfClass,
  string
> =
  {
    scout:
      'Scout',
    soldier:
      'Soldier',
    pyro: 'Pyro',
    demoman:
      'Demoman',
    heavy:
      'Heavy',
    engineer:
      'Engineer',
    medic:
      'Medic',
    sniper:
      'Sniper',
    spy: 'Spy',
  };

export function parseClass(
  v: unknown,
):
  | TfClass
  | undefined {
  return typeof v ===
    'string' &&
    v in
      CLASS_DEFAULT
    ? (v as TfClass)
    : undefined;
}

/**
 * Every class's translated name, written out as literal `t()` calls so
 * `pnpm i18n:extract` sees each key (a key built from the class id is
 * invisible to it). `labels.test.ts` holds this equal to `CLASS_DEFAULT`.
 */
export function tfClassLabels(
  t: TFunction,
): Record<TfClass, string> {
  return {
    scout: t('class-scout', { ns: 'c-tf2-hud', defaultValue: 'Scout' }),
    soldier: t('class-soldier', { ns: 'c-tf2-hud', defaultValue: 'Soldier' }),
    pyro: t('class-pyro', { ns: 'c-tf2-hud', defaultValue: 'Pyro' }),
    demoman: t('class-demoman', { ns: 'c-tf2-hud', defaultValue: 'Demoman' }),
    heavy: t('class-heavy', { ns: 'c-tf2-hud', defaultValue: 'Heavy' }),
    engineer: t('class-engineer', { ns: 'c-tf2-hud', defaultValue: 'Engineer' }),
    medic: t('class-medic', { ns: 'c-tf2-hud', defaultValue: 'Medic' }),
    sniper: t('class-sniper', { ns: 'c-tf2-hud', defaultValue: 'Sniper' }),
    spy: t('class-spy', { ns: 'c-tf2-hud', defaultValue: 'Spy' }),
  };
}
