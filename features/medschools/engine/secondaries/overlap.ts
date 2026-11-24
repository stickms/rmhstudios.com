import type { MedProgram } from '../types';
import { THEME_IDS, type ThemeId } from './theme-ids';
import type { PromptLimit } from './types';
import type { ProgramView } from './view';

/**
 * The pre-write overlap: the prompts of a member's list or tracker schools grouped by theme, so one essay can be drafted
 * for several schools. Pure, over the same `ProgramView`s the public tab shows (D8).
 */

export interface OverlapSchool {
  slug: string;
  name: string;
  /** The programs the member applies to at this school. A `PHD` item brings the regular prompts too (R7). */
  programs: readonly MedProgram[];
  view: readonly ProgramView[];
}

export interface OverlapEntry {
  slug: string;
  schoolName: string;
  program: MedProgram;
  promptId: string;
  text: string;
  limit: PromptLimit | null;
  optional: boolean;
  basis: 'current' | 'last-cycle';
}

export interface OverlapGroup {
  theme: ThemeId;
  schools: number;
  entries: OverlapEntry[];
  shortestWords: number | null;
  longestWords: number | null;
}

const PROGRAM_ORDER: Record<MedProgram, number> = { REG: 0, PHD: 1 };

const wordsOf = (e: OverlapEntry): number | null => (e.limit?.kind === 'WORDS' ? e.limit.value : null);

export function buildOverlap(
  schools: readonly OverlapSchool[],
  currentCycle: number,
): { groups: OverlapGroup[]; withoutPrompts: { slug: string; name: string }[] } {
  void currentCycle; // the basis comes from each view's state; kept so the signature matches the school view's
  // The same school twice (a REG item and a PHD item) is one school.
  const merged = new Map<
    string,
    { slug: string; name: string; programs: Set<MedProgram>; view: readonly ProgramView[] }
  >();
  for (const s of schools) {
    const have = merged.get(s.slug);
    if (have) for (const p of s.programs) have.programs.add(p);
    else merged.set(s.slug, { slug: s.slug, name: s.name, programs: new Set(s.programs), view: s.view });
  }

  const byTheme = new Map<ThemeId, OverlapEntry[]>();
  const withoutPrompts: { slug: string; name: string }[] = [];
  for (const s of merged.values()) {
    const wanted = new Set<MedProgram>(s.programs.has('PHD') ? ['REG', 'PHD'] : ['REG']);
    let any = false;
    for (const pv of s.view) {
      if (!wanted.has(pv.program)) continue;
      for (const p of pv.prompts) {
        if (p.status === 'gone') continue; // a school that stopped asking it is not asking it this cycle
        any = true;
        const entry: OverlapEntry = {
          slug: s.slug,
          schoolName: s.name,
          program: pv.program,
          promptId: p.id,
          text: p.text,
          limit: p.limit,
          optional: p.optional,
          basis: pv.state === 'not-yet' ? 'last-cycle' : 'current',
        };
        for (const theme of p.themes) {
          const list = byTheme.get(theme) ?? [];
          list.push(entry);
          byTheme.set(theme, list);
        }
      }
    }
    if (!any) withoutPrompts.push({ slug: s.slug, name: s.name });
  }

  const groups: OverlapGroup[] = [...byTheme.entries()].map(([theme, entries]) => {
    const sorted = [...entries].sort(
      (a, b) =>
        a.schoolName.localeCompare(b.schoolName) ||
        PROGRAM_ORDER[a.program] - PROGRAM_ORDER[b.program] ||
        a.text.localeCompare(b.text),
    );
    const words = sorted.map(wordsOf).filter((w): w is number => w !== null);
    return {
      theme,
      schools: new Set(sorted.map((e) => e.slug)).size,
      entries: sorted,
      shortestWords: words.length > 0 ? Math.min(...words) : null,
      longestWords: words.length > 0 ? Math.max(...words) : null,
    };
  });
  groups.sort((a, b) => {
    if ((a.theme === 'other') !== (b.theme === 'other')) return a.theme === 'other' ? 1 : -1;
    return b.schools - a.schools || THEME_IDS.indexOf(a.theme) - THEME_IDS.indexOf(b.theme);
  });
  return { groups, withoutPrompts };
}
