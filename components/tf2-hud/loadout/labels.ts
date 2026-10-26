/**
 * Display names for classes and loadout slots. Strings go through `t()` at the
 * call site; this only decides which key and default each slot or class uses.
 */

import type { TfClass } from '@/lib/tf2-loadout/catalog-types';

export const CLASS_DEFAULT: Record<TfClass, string> = {
  scout: 'Scout',
  soldier: 'Soldier',
  pyro: 'Pyro',
  demoman: 'Demoman',
  heavy: 'Heavy',
  engineer: 'Engineer',
  medic: 'Medic',
  sniper: 'Sniper',
  spy: 'Spy',
};

export function parseClass(v: unknown): TfClass | undefined {
  return typeof v === 'string' && v in CLASS_DEFAULT ? (v as TfClass) : undefined;
}
