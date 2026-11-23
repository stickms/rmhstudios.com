import { describe, expect, it } from 'vitest';
import { formatCycleRanges } from './cycle-ranges';
import type { PromptSource } from './types';
import { buildSchoolView, type StoredObservation, type StoredPrompt } from './view';

const NOW = new Date('2026-11-23T00:00:00Z');
const CUR = 2027;

function obs(cycleYear: number, source: PromptSource = 'ADMIT', o: Partial<StoredObservation> = {}): StoredObservation {
  return { cycleYear, source, limit: null, optional: false, sourceRef: null, lastCheckedAt: NOW, ...o };
}
function prompt(
  id: string,
  text: string,
  observations: StoredObservation[],
  program: 'REG' | 'PHD' = 'REG',
  themes: string[] = ['other'],
): StoredPrompt {
  return { id, program, text, themes, observations };
}
function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as object)) deepFreeze(v);
  }
  return x;
}
const reg = (view: ReturnType<typeof buildSchoolView>) => view.find((v) => v.program === 'REG');

const CHALLENGE = 'Describe a challenge you have faced and how you overcame it.';
const CHALLENGE2 = 'Tell us about a challenge you faced and how you overcame it.';
const WHY = 'Why are you interested in our medical school?';

describe('buildSchoolView', () => {
  it('same: observed last cycle and this one; two sources in one cycle count once', () => {
    const v = reg(buildSchoolView([prompt('a', WHY, [obs(2026), obs(2027), obs(2027, 'SDN')])], CUR));
    const p = v?.prompts[0];
    expect(p?.status).toBe('same');
    expect(p?.cycles).toEqual([2026, 2027]);
    expect(p?.sources).toEqual(['ADMIT', 'SDN']);
    expect(v?.state).toBe('current');
    expect(v?.comparedWith).toBe(2026);
  });

  it('reworded: matched to last cycle, whose wording is not also listed as gone; unmatched are new and gone', () => {
    const v = reg(
      buildSchoolView(
        [
          prompt('old', CHALLENGE, [obs(2026)]),
          prompt('new', CHALLENGE2, [obs(2027)]),
          prompt('fresh', 'Describe your research experience and what you learned.', [obs(2027)]),
          prompt('dropped', 'Discuss a significant ethical dilemma you encountered recently.', [obs(2026)]),
        ],
        CUR,
      ),
    );
    const byId = Object.fromEntries((v?.prompts ?? []).map((p) => [p.id, p]));
    expect(byId.new?.status).toBe('reworded');
    expect(byId.new?.previousText).toBe(CHALLENGE);
    expect(byId.old).toBeUndefined();
    expect(byId.fresh?.status).toBe('new');
    expect(byId.dropped?.status).toBe('gone');
    expect(v?.prompts.at(-1)?.id).toBe('dropped'); // gone prompts last
  });

  it('a prompt that returns after a gap keeps every cycle and reads as a range list', () => {
    const v = reg(
      buildSchoolView(
        [prompt('a', WHY, [obs(2023), obs(2024), obs(2027)]), prompt('b', CHALLENGE, [obs(2026), obs(2027)])],
        CUR,
      ),
    );
    const p = v?.prompts.find((x) => x.id === 'a');
    expect(p?.cycles).toEqual([2023, 2024, 2027]);
    expect(p?.status).toBe('new'); // not observed 2026
    expect(formatCycleRanges(p?.cycles ?? [])).toBe('2022–2023 to 2023–2024, 2026–2027');
  });

  it('not-yet: nothing seen this cycle shows last cycle as last cycle, never gone (Review Focus 1)', () => {
    const v = reg(buildSchoolView([prompt('a', WHY, [obs(2026)]), prompt('b', CHALLENGE, [obs(2026)])], CUR));
    expect(v?.state).toBe('not-yet');
    expect(v?.shownCycle).toBe(2026);
    expect(v?.comparedWith).toBeNull();
    expect(v?.prompts.map((p) => p.status)).toEqual(['last-cycle', 'last-cycle']);
  });

  it('compares only on sources that have seen something this cycle', () => {
    const v = reg(
      buildSchoolView(
        [
          prompt('adm', 'Describe your community service and volunteer experience.', [obs(2026, 'ADMIT')]),
          prompt('sdnOld', CHALLENGE, [obs(2026, 'SDN')]),
          prompt('sdnNow', WHY, [obs(2026, 'SDN'), obs(2027, 'SDN')]),
        ],
        CUR,
      ),
    );
    const ids = (v?.prompts ?? []).map((p) => p.id);
    expect(ids).not.toContain('adm'); // ADMIT has not been read this cycle: not evidence of a drop
    expect(v?.prompts.find((p) => p.id === 'sdnOld')?.status).toBe('gone');
    expect(v?.prompts.find((p) => p.id === 'sdnNow')?.status).toBe('same');
  });

  it('a first year of data has no marks (Review Focus 2)', () => {
    const v = reg(buildSchoolView([prompt('a', WHY, [obs(2027)]), prompt('b', CHALLENGE, [obs(2027)])], CUR));
    expect(v?.comparedWith).toBeNull();
    expect(v?.prompts.every((p) => p.status === null)).toBe(true);
  });

  it('programs build independently and only the ones with prompts appear (Review Focus 7)', () => {
    const only = buildSchoolView([prompt('a', WHY, [obs(2027)])], CUR);
    expect(only.map((v) => v.program)).toEqual(['REG']);
    const phdOnly = buildSchoolView([prompt('a', WHY, [obs(2027)], 'PHD')], CUR);
    expect(phdOnly.map((v) => v.program)).toEqual(['PHD']);
    const both = buildSchoolView(
      [
        prompt('r', WHY, [obs(2027)], 'REG'),
        prompt('p', WHY, [obs(2027)], 'PHD'),
        prompt('p2', CHALLENGE, [obs(2026)], 'PHD'),
      ],
      CUR,
    );
    expect(both.map((v) => v.program)).toEqual(['REG', 'PHD']);
    expect(both[0]?.prompts).toHaveLength(1);
    expect(both[1]?.prompts.map((p) => p.id).sort()).toEqual(['p', 'p2']);
    expect(buildSchoolView([], CUR)).toEqual([]);
  });

  it('shows the limit by source priority in the shown cycle, the newest check, and optional from any source', () => {
    const early = new Date('2026-10-01T00:00:00Z');
    const late = new Date('2026-11-20T00:00:00Z');
    const v = reg(
      buildSchoolView(
        [
          prompt('a', WHY, [
            obs(2027, 'SDN', { limit: { kind: 'WORDS', value: 300 }, lastCheckedAt: late, optional: true }),
            obs(2027, 'ADMIT', { limit: { kind: 'WORDS', value: 250 }, lastCheckedAt: early }),
            obs(2026, 'ADMIT', { limit: { kind: 'WORDS', value: 100 } }),
          ]),
        ],
        CUR,
      ),
    );
    const p = v?.prompts[0];
    expect(p?.limit).toEqual({ kind: 'WORDS', value: 250 });
    expect(p?.optional).toBe(true);
    expect(p?.lastCheckedAt).toEqual(late);
    expect(p?.sources).toEqual(['ADMIT', 'SDN']);
  });

  it('a school source outranks the pages and a missing limit falls through to the next source', () => {
    const v = reg(
      buildSchoolView(
        [
          prompt('a', WHY, [
            obs(2027, 'SCHOOL', { limit: { kind: 'CHARS', value: 2000 } }),
            obs(2027, 'ADMIT', { limit: { kind: 'WORDS', value: 250 } }),
          ]),
          prompt('b', CHALLENGE, [obs(2027, 'ADMIT'), obs(2027, 'SDN', { limit: { kind: 'WORDS', value: 300 } })]),
        ],
        CUR,
      ),
    );
    expect(v?.prompts.find((p) => p.id === 'a')?.limit).toEqual({ kind: 'CHARS', value: 2000 });
    expect(v?.prompts.find((p) => p.id === 'b')?.limit).toEqual({ kind: 'WORDS', value: 300 });
  });

  it('orders by theme then text, with unknown themes as other', () => {
    const v = reg(
      buildSchoolView(
        [
          prompt('z', 'Zzz something odd about you here.', [obs(2027)], 'REG', ['bogus']),
          prompt('r', 'Describe your research.', [obs(2027)], 'REG', ['research']),
          prompt('s', WHY, [obs(2027)], 'REG', ['why-school']),
        ],
        CUR,
      ),
    );
    expect(v?.prompts.map((p) => p.id)).toEqual(['s', 'r', 'z']);
    expect(v?.prompts.at(-1)?.themes).toEqual(['other']);
  });

  it('does not mutate its input', () => {
    const input = deepFreeze([
      prompt('old', CHALLENGE, [obs(2026)]),
      prompt('new', CHALLENGE2, [obs(2027)]),
      prompt('x', WHY, [obs(2026), obs(2027)]),
    ]);
    expect(() => buildSchoolView(input, CUR)).not.toThrow();
  });
});

describe('buildSchoolView: which sources can say a prompt is gone', () => {
  const THREAD = 'https://forums.studentdoctor.net/threads/duke-secondaries.1234/';
  const prompts = () => [
    prompt('page', WHY, [obs(2026, 'SDN')]),
    prompt('forum', CHALLENGE, [obs(2027, 'SDN', { sourceRef: THREAD })]),
  ];
  it('a forum sighting does not make SDN comparable, so the page prompt is not "gone"', () => {
    const v = reg(buildSchoolView(prompts(), CUR));
    expect(v?.prompts.map((p) => [p.id, p.status])).toEqual([['forum', 'new']]);
  });
  it('a source with no OK check this cycle is not comparable even if it saw something', () => {
    const p = [prompt('a', WHY, [obs(2026)]), prompt('b', CHALLENGE, [obs(2027)])];
    expect(reg(buildSchoolView(p, CUR, { readSources: new Set() }))?.prompts.map((x) => x.status)).toEqual(['new']);
    expect(reg(buildSchoolView(p, CUR, { readSources: new Set(['ADMIT']) }))?.prompts.map((x) => x.status)).toEqual(['new', 'gone']);
  });
});
