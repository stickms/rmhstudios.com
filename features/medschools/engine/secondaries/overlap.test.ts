import { describe, expect, it } from 'vitest';
import { buildOverlap, type OverlapSchool } from './overlap';
import type { PromptLimit } from './types';
import type { ProgramView, PromptView } from './view';

const NOW = new Date('2026-11-23T00:00:00Z');

function pv(id: string, text: string, themes: PromptView['themes'], o: Partial<PromptView> = {}): PromptView {
  return {
    id,
    program: 'REG',
    text,
    limit: null,
    optional: false,
    themes,
    status: null,
    previousText: null,
    cycles: [2027],
    sources: ['ADMIT'],
    lastCheckedAt: NOW,
    ...o,
  };
}
const words = (value: number): PromptLimit => ({ kind: 'WORDS', value });
const view = (program: 'REG' | 'PHD', prompts: PromptView[], state: ProgramView['state'] = 'current'): ProgramView => ({
  program,
  state,
  shownCycle: state === 'current' ? 2027 : 2026,
  comparedWith: null,
  prompts: prompts.map((p) => ({ ...p, program })),
});
const school = (slug: string, name: string, programs: OverlapSchool['programs'], v: ProgramView[]): OverlapSchool => ({
  slug,
  name,
  programs,
  view: v,
});

describe('buildOverlap', () => {
  it('groups by theme, ordered by school count then theme order, with other last', () => {
    const r = buildOverlap(
      [
        school(
          'a',
          'Alpha',
          ['REG'],
          [view('REG', [pv('a1', 'Diversity A', ['diversity']), pv('a2', 'Odd', ['other'])])],
        ),
        school(
          'b',
          'Beta',
          ['REG'],
          [
            view('REG', [
              pv('b1', 'Diversity B', ['diversity']),
              pv('b2', 'Odd B', ['other']),
              pv('b3', 'Odd C', ['other']),
            ]),
          ],
        ),
        school('c', 'Gamma', ['REG'], [view('REG', [pv('c1', 'Why us', ['why-school'])])]),
      ],
      2027,
    );
    expect(r.groups.map((g) => [g.theme, g.schools])).toEqual([
      ['diversity', 2],
      ['why-school', 1],
      ['other', 2],
    ]);
    expect(r.withoutPrompts).toEqual([]);
  });

  it('a prompt with two themes is in both groups; word limits only feed the shortest and longest', () => {
    const r = buildOverlap(
      [
        school(
          'a',
          'Alpha',
          ['REG'],
          [view('REG', [pv('a1', 'Led and learned', ['leadership', 'growth'], { limit: words(250) })])],
        ),
        school(
          'b',
          'Beta',
          ['REG'],
          [
            view('REG', [
              pv('b1', 'Led', ['leadership'], { limit: words(400) }),
              pv('b2', 'Chars', ['leadership'], { limit: { kind: 'CHARS', value: 5000 } }),
            ]),
          ],
        ),
      ],
      2027,
    );
    const lead = r.groups.find((g) => g.theme === 'leadership');
    const growth = r.groups.find((g) => g.theme === 'growth');
    expect(growth?.entries.map((e) => e.promptId)).toEqual(['a1']);
    expect([lead?.shortestWords, lead?.longestWords]).toEqual([250, 400]);
    expect([growth?.shortestWords, growth?.longestWords]).toEqual([250, 250]);
    const noWords = buildOverlap(
      [
        school(
          'a',
          'Alpha',
          ['REG'],
          [view('REG', [pv('a1', 'x', ['growth'], { limit: { kind: 'CHARS', value: 100 } })])],
        ),
      ],
      2027,
    );
    expect([noWords.groups[0]?.shortestWords, noWords.groups[0]?.longestWords]).toEqual([null, null]);
  });

  it('a not-yet school contributes last cycle prompts marked last-cycle; gone prompts are left out', () => {
    const r = buildOverlap(
      [
        school(
          'a',
          'Alpha',
          ['REG'],
          [view('REG', [pv('a1', 'Old', ['service'], { status: 'last-cycle' })], 'not-yet')],
        ),
        school(
          'b',
          'Beta',
          ['REG'],
          [
            view('REG', [
              pv('b1', 'Dropped', ['service'], { status: 'gone' }),
              pv('b2', 'Kept', ['service'], { status: 'same' }),
            ]),
          ],
        ),
      ],
      2027,
    );
    expect(r.groups[0]?.entries.map((e) => [e.promptId, e.basis])).toEqual([
      ['a1', 'last-cycle'],
      ['b2', 'current'],
    ]);
  });

  it('a school with no prompts is listed as without prompts, not dropped', () => {
    const r = buildOverlap(
      [
        school('a', 'Alpha', ['REG'], []),
        school('b', 'Beta', ['REG'], [view('PHD', [pv('x', 'PhD only', ['research'])])]),
      ],
      2027,
    );
    expect(r.groups).toEqual([]);
    expect(r.withoutPrompts).toEqual([
      { slug: 'a', name: 'Alpha' },
      { slug: 'b', name: 'Beta' },
    ]);
    expect(buildOverlap([], 2027)).toEqual({ groups: [], withoutPrompts: [] });
  });

  it('a PHD item includes the regular prompts too (R7); a REG item only the regular ones', () => {
    const v = [view('REG', [pv('r1', 'Regular', ['why-school'])]), view('PHD', [pv('p1', 'PhD', ['research'])])];
    const phd = buildOverlap([school('a', 'Alpha', ['PHD'], v)], 2027);
    expect(phd.groups.flatMap((g) => g.entries.map((e) => [e.promptId, e.program]))).toEqual([
      ['r1', 'REG'],
      ['p1', 'PHD'],
    ]);
    const regOnly = buildOverlap([school('a', 'Alpha', ['REG'], v)], 2027);
    expect(regOnly.groups.flatMap((g) => g.entries.map((e) => e.promptId))).toEqual(['r1']);
  });

  it('the same school twice (REG then PHD) is one school and each prompt is listed once', () => {
    const v = [view('REG', [pv('r1', 'Regular', ['why-school'])]), view('PHD', [pv('p1', 'PhD', ['why-school'])])];
    const r = buildOverlap([school('a', 'Alpha', ['REG'], v), school('a', 'Alpha', ['PHD'], v)], 2027);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]?.schools).toBe(1);
    expect(r.groups[0]?.entries.map((e) => e.promptId)).toEqual(['r1', 'p1']);
  });

  it('does not mutate its input', () => {
    const input = [school('a', 'Alpha', ['REG'], [view('REG', [pv('a1', 'x', ['growth'])])])];
    const copy = structuredClone(input);
    buildOverlap(input, 2027);
    expect(input).toEqual(copy);
  });
});
