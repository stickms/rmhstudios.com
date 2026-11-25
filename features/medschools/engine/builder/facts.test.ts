import { describe, expect, it } from 'vitest';
import { selectCandidates } from './candidates';
import { candidateFigures, groundPicks, memberFacts, type ModelCandidate } from './facts';
import { SCHOOLS } from './fixtures';

const MEMBER = memberFacts({
  mcat: { total: 512, year: 2026, month: 4 },
  gpaCumulative: 3.81,
  gpaScience: null,
  homeState: 'TX',
  hours: [{ category: 'RESEARCH', hours: 1200 }],
  missions: ['research'],
});

const cands = selectCandidates(SCHOOLS, { states: [], degree: null, mdphd: false, size: null, missions: [] }).candidates;
const model: ModelCandidate[] = cands.map((c, i) => {
  const { figures, texts } = candidateFigures(c, i + 1);
  return {
    id: `c${i + 1}`,
    name: c.school.name,
    state: c.school.state,
    label: 'target',
    facts: figures.map((f, k) => ({ ref: f.ref, label: f.kind, text: texts[k]! })),
  };
});
const pick = (id: string, text?: string, ...cites: string[]) => ({ id, ...(text ? { reason: { text, cites } } : {}) });

describe('memberFacts', () => {
  it('labels every figure as the member’s own and carries no note', () => {
    expect(MEMBER.map((m) => m.text)).toEqual([
      'Your most recent MCAT total (April 2026): 512',
      'Your cumulative GPA: 3.81',
      'Your home state: TX',
      'Your research hours: 1200',
      'Your mission interests: research',
    ]);
    expect(MEMBER.map((m) => m.ref)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(memberFacts(null)).toEqual([]);
  });
});

describe('candidateFigures', () => {
  it('lists the published figures of the label’s class and the MD-PhD facts, each with its source', () => {
    const { figures, texts } = candidateFigures(cands[0]!, 1);
    expect(figures.map((f) => f.kind)).toEqual(['MCAT_MEDIAN', 'GPA_MEDIAN', 'MATRICULANTS', 'MDPHD_PROGRAM', 'MSTP_T32']);
    expect(figures.every((f) => f.sourceUrl.startsWith('https://'))).toBe(true);
    expect(texts[0]).toBe('Median MCAT, Entered 2026: 520');
    expect(figures.map((f) => f.ref)).toEqual(['c1f1', 'c1f2', 'c1f3', 'c1f4', 'c1f5']);
  });
});

describe('groundPicks', () => {
  it('keeps picks among the candidates only, once, up to the count', () => {
    const r = groundPicks({ picks: [pick('c2'), pick('c2'), pick('zz'), pick('c1'), pick('c3')] }, model, MEMBER, 2);
    expect(r?.picks.map((p) => p.index)).toEqual([1, 0]);
    expect(r?.ignored).toBe(3);
  });

  it('keeps a reason whose numbers are in the cited school or member facts', () => {
    const r = groundPicks(
      { picks: [pick('c1', 'Your MCAT of 512 is below the class median of 520.', 'm1', 'c1f1')] },
      model,
      MEMBER,
      15,
    );
    expect(r?.picks[0]?.reason).toEqual({ text: 'Your MCAT of 512 is below the class median of 520.', cites: ['m1', 'c1f1'] });
    expect(r?.reasonsDropped).toBe(0);
  });

  it('drops an invented number, a derived difference, a link, another school’s figure, an unknown cite; the school stays', () => {
    for (const [text, ...cites] of [
      ['Your MCAT is 8 points below the median.', 'm1', 'c1f1'],
      ['The median is 523.', 'c1f1'],
      ['See https://evil.example for more.', 'c1f1'],
      ['Its median MCAT is 512.', 'c2f1'],
      ['A fine school.', 'f9'],
      ['A fine school.'],
    ] as const) {
      const r = groundPicks({ picks: [pick('c1', text, ...cites)] }, model, MEMBER, 15);
      expect(r?.picks.map((p) => p.index), text).toEqual([0]);
      expect(r?.picks[0]?.reason, text).toBeNull();
      expect(r?.reasonsDropped, text).toBe(1);
    }
  });

  it('an unreadable reply is null; a readable one with nothing valid is an empty list', () => {
    expect(groundPicks(null, model, MEMBER, 15)).toBeNull();
    expect(groundPicks({ segments: [] }, model, MEMBER, 15)).toBeNull();
    expect(groundPicks({ picks: [pick('nope')] }, model, MEMBER, 15)?.picks).toEqual([]);
  });
});
