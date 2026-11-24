import type { MedProgram } from './types';

/**
 * Rolling-admissions guidance: pure rules. Which school fact answers a member's list or tracker item, and the order the
 * view shows. Client-safe (no `node:`, no zod, no I/O). The fact itself is the school's own page, quoted; nothing here
 * advises anything.
 */

export type RollingKind = 'rolling' | 'set-dates' | 'unknown';

/**
 * The program whose fact answers an item. A PHD item reads the PHD fact only; REG and ANY read the REG fact only
 * (the same mapping as the secondaries overlap). A fact for the other program is never borrowed.
 */
export const policyProgramOf = (program: 'ANY' | MedProgram): MedProgram => (program === 'PHD' ? 'PHD' : 'REG');

export interface RollingPolicy {
  rolling: boolean;
  evidence: string;
  url: string;
  checkedOn: string;
}

export interface RollingInput {
  slug: string;
  schoolName: string;
  degree: 'MD' | 'DO';
  /** The item's own program (list: ANY, REG or PHD; tracker: REG or PHD). */
  program: 'ANY' | MedProgram;
  /** Tracker: whether a step is recorded. Null for a list. */
  submitted: boolean | null;
  /** The school's facts by program. */
  policies: Partial<Record<MedProgram, RollingPolicy>>;
}

export interface RollingEntry {
  slug: string;
  schoolName: string;
  degree: 'MD' | 'DO';
  program: MedProgram;
  kind: RollingKind;
  evidence: string | null;
  url: string | null;
  checkedOn: string | null;
  submitted: boolean | null;
}

const KIND_RANK: Record<RollingKind, number> = { rolling: 0, 'set-dates': 1, unknown: 2 };

/**
 * One entry per school x program (the same school as MD and MD-PhD is two rows; a repeated pair, such as an ANY and a REG
 * item, is one). Sorted rolling, then set dates, then unknown; inside a kind a school not yet submitted comes before one
 * with a step recorded, and otherwise the input order stands (the sort is stable).
 */
export function buildRolling(items: readonly RollingInput[]): RollingEntry[] {
  const seen = new Set<string>();
  const entries: RollingEntry[] = [];
  for (const i of items) {
    const program = policyProgramOf(i.program);
    const key = `${i.slug}:${program}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = i.policies[program];
    entries.push({
      slug: i.slug,
      schoolName: i.schoolName,
      degree: i.degree,
      program,
      kind: p ? (p.rolling ? 'rolling' : 'set-dates') : 'unknown',
      evidence: p?.evidence ?? null,
      url: p?.url ?? null,
      checkedOn: p?.checkedOn ?? null,
      submitted: i.submitted,
    });
  }
  const open = (e: RollingEntry): number => (e.submitted === true ? 1 : 0);
  return entries
    .map((e, index) => ({ e, index }))
    .sort((a, b) => KIND_RANK[a.e.kind] - KIND_RANK[b.e.kind] || open(a.e) - open(b.e) || a.index - b.index)
    .map((x) => x.e);
}
