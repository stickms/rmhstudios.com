/**
 * The curated catalogue: every author and every paper in the RMH Research
 * archive, one file per division, plus the cross-division citations in
 * `cross-links.ts`. Fiction, in the in-universe register of the other RMH arms;
 * no real person is named (docs/people.md). `__tests__/catalog.test.ts` holds
 * the integrity rules (unique ids, references resolve and never point forward
 * in time, every field is populated).
 */
import type { Author, Paper } from '../types';
import { FORMAL_AUTHORS, FORMAL_PAPERS } from './formal';
import { PHYSICAL_AUTHORS, PHYSICAL_PAPERS } from './physical';
import { LIFE_AUTHORS, LIFE_PAPERS } from './life';
import { HUMAN_AUTHORS, HUMAN_PAPERS } from './human';
import { CROSS_LINKS } from './cross-links';
import { REPORTS } from './reports';

export const AUTHORS: readonly Author[] = [...FORMAL_AUTHORS, ...PHYSICAL_AUTHORS, ...LIFE_AUTHORS, ...HUMAN_AUTHORS];

/** Each paper with its cross-division references appended. */
export const PAPERS: readonly Paper[] = [...FORMAL_PAPERS, ...PHYSICAL_PAPERS, ...LIFE_PAPERS, ...HUMAN_PAPERS, ...REPORTS].map((p) => {
  const extra = CROSS_LINKS[p.id];
  return extra ? { ...p, refs: [...p.refs, ...extra.filter((r) => !p.refs.includes(r))] } : p;
});
