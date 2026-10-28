/**
 * Body groups: the parts of a class body a cosmetic replaces. A class model lists named groups (`hat`,
 * `headphones`, `shoes_socks`, …), each with a few submodels; the game shows submodel 0 unless a worn item's
 * schema (`player_bodygroups`, plus a style's `additional_hidden_bodygroups`) selects another — usually an
 * empty one, which is how a hat takes the class's own cap off. Pure, so the viewer and the tests share it.
 */

import type { Bodygroups, CatalogItem } from './catalog-types';

/** What one worn item selects: its own groups, plus those of the style it is worn in. */
export function bodygroupsOf(
  item: Pick<CatalogItem, 'bg' | 'st'> | undefined,
  style?: number,
): Bodygroups | undefined {
  const own = item?.bg;
  const styled = style !== undefined ? item?.st?.find((s) => s.k === style)?.bg : undefined;
  return own && styled ? merge([own, styled]) : (styled ?? own);
}

/** The submodel to show per group once every worn item has had its say. The higher submodel wins a clash. */
export function merge(all: readonly (Bodygroups | undefined)[]): Bodygroups {
  const out: Bodygroups = {};
  for (const groups of all) {
    if (!groups) continue;
    for (const [name, sub] of Object.entries(groups)) out[name] = Math.max(out[name] ?? 0, sub);
  }
  return out;
}

/** Whether the mesh for `submodel` of `group` is drawn under `selection` (an unlisted group shows submodel 0). */
export const showsSubmodel = (selection: Bodygroups, group: string, submodel: number): boolean =>
  (selection[group] ?? 0) === submodel;

/** A stable string for a selection, to tell a changed one from a new object holding the same groups. */
export const selectionKey = (selection: Bodygroups): string =>
  Object.keys(selection)
    .sort()
    .map((k) => `${k}=${selection[k]}`)
    .join(',');
