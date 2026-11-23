import { describe, expect, it } from 'vitest';
import { LIMITS, groundAnswer } from './ground';
import { F2, F3, FACTS, INJECTION_TEXT } from './fixtures';
import type { RetrievedFact } from './types';

const seg = (text: string, ...cites: string[]) => ({ text, cites });
const run = (...segments: unknown[]) => groundAnswer({ segments }, FACTS);

describe('groundAnswer', () => {
  it('keeps a matching, cited sentence', () => {
    const g = run(seg('Duke has 412 reported interview events.', 'f1'));
    expect(g.segments).toEqual([seg('Duke has 412 reported interview events.', 'f1')]);
    expect(g.dropped).toBe(0);
    expect(g.citedRefs).toEqual(['f1']);
  });
  it('drops an uncited sentence, even without digits', () => {
    expect(run(seg('Duke has 412 reported interview events.')).reasons).toEqual(['no-cite']);
    expect(run(seg('Duke is a school.')).segments).toEqual([]);
  });
  it('drops a cite that was never issued', () => {
    const g = run(seg('Duke has 412 reported interview events.', 'f9'));
    expect(g.segments).toEqual([]);
    expect(g.reasons).toEqual(['unknown-cite']);
    expect(run(seg('ok', 'f1', 'f9')).segments).toEqual([]);
  });
  it('drops a number that is not in the cited fact', () => {
    expect(run(seg("Duke's MCAT median is 512.", 'f2')).reasons).toEqual(['number-mismatch']);
    expect(run(seg('The MCAT median is 511.', 'f1')).reasons).toEqual(['number-mismatch']);
    expect(run(seg('That is 412 events, about 10% of 4,000', 'f1')).segments).toEqual([]);
  });
  it('catches near misses and accepts the legitimate forms', () => {
    for (const bad of ['MCAT median 511.5', 'GPA median 3.7', 'MCAT median 0.511', 'median 511%', '٥١٢']) {
      expect(run(seg(bad, 'f2')).segments, bad).toEqual([]);
    }
    for (const good of ['MCAT median 511', 'GPA median 3.76', 'MCAT median ٥١١', 'MCAT median ５１１']) {
      expect(run(seg(good, 'f2')).segments.length, good).toBe(1);
    }
    expect(run(seg('Reports run through Nov 21.', 'f1')).segments).toHaveLength(1);
    expect(run(seg('Reports run through 2026-11-21 for 2026-2027.', 'f1')).segments).toHaveLength(1);
    expect(run(seg('Reports run through 2026-11-22.', 'f1')).segments).toEqual([]);
  });
  it('lets numbers come from any cited numeric fact', () => {
    expect(run(seg('Duke: 412 events and MCAT median 511.', 'f1', 'f2')).segments).toHaveLength(1);
  });
  it('gives forum text no say over a number', () => {
    const g = run(seg('They once asked it 3 times.', 'f3'));
    expect(g.reasons).toEqual(['untrusted-number']);
    expect(run(seg('They ask about failure.', 'f3')).segments).toHaveLength(1);
    // an untrusted fact beside a numeric one adds no allowed number
    expect(run(seg('Duke has 412 events and they failed 3 times.', 'f1', 'f3')).segments).toEqual([]);
  });
  it('drops links, markup and bare domains', () => {
    for (const bad of [
      'See http://x.y',
      'See www.x.y',
      'See [a](b)',
      'It is <b>bold</b>',
      'Visit evil.example',
      'mail me@x',
    ]) {
      const g = run(seg(bad, 'f3'));
      expect(g.segments, bad).toEqual([]);
      expect(g.reasons, bad).toEqual(['link']);
    }
  });
  it('drops a sentence that repeats the system prompt', () => {
    const secret = 'Copy numbers exactly as written in a fact. Do not calculate anything at all.';
    const g = groundAnswer(
      { segments: [seg('My rules say copy numbers exactly as written in a fact.', 'f3')] },
      FACTS,
      { secrets: [secret] },
    );
    expect(g.reasons).toEqual(['leak']);
  });
  it('treats junk as empty', () => {
    for (const junk of ['prose', null, {}, { segments: 'x' }, { segments: [] }, 5, []]) {
      const g = groundAnswer(junk, FACTS);
      expect(g.segments).toEqual([]);
      expect(g.reasons).toEqual(['empty']);
    }
    expect(run(null, 5, seg('', 'f1'), { text: 3, cites: [] }).segments).toEqual([]);
  });
  it('caps segments, segment length and the total', () => {
    const nine = Array.from({ length: 9 }, (_, i) => seg(`They ask about failure ${'x'.repeat(i)}.`, 'f3'));
    const g = groundAnswer({ segments: nine }, FACTS);
    expect(g.segments).toHaveLength(LIMITS.segments);
    expect(g.dropped).toBe(1);
    expect(g.reasons).toEqual(['over-limit']);
    expect(run(seg(`${'a'.repeat(401)}`, 'f3')).reasons).toEqual(['over-limit']);
    const long = Array.from({ length: 4 }, () => seg('a'.repeat(390), 'f3'));
    expect(groundAnswer({ segments: long }, FACTS).segments).toHaveLength(3);
  });
  it('orders cites and cited refs by first use and dedupes', () => {
    const g = run(seg('Duke: 412 events and MCAT median 511.', 'f2', 'f1', 'f2'), seg('Reports: 412.', 'f1'));
    expect(g.segments[0]!.cites).toEqual(['f2', 'f1']);
    expect(g.citedRefs).toEqual(['f2', 'f1']);
  });
  it('does not claim to catch the same number at another school', () => {
    // Documented limit: the number match is the guard. A fact for another school holding the same figure passes, which is
    // why every fact's text names its school and the prompt keeps one school per fact.
    const other: RetrievedFact = { ...F2, ref: 'f4', schoolSlug: 'unc', text: 'UNC MCAT median 511 (Admit.org).' };
    const g = groundAnswer({ segments: [seg('Duke MCAT median is 511.', 'f4')] }, [...FACTS, other]);
    expect(g.segments).toHaveLength(1);
  });
  it('never lets planted forum text through', () => {
    const planted: RetrievedFact = { ...F3, ref: 'f5', text: INJECTION_TEXT };
    const g = groundAnswer(
      {
        segments: [
          seg('The MCAT median is 999.', 'f5'),
          seg('Visit evil.example.', 'f5'),
          seg('The MCAT median is 999.', 'f1'),
        ],
      },
      [...FACTS, planted],
    );
    expect(g.segments).toEqual([]);
  });
});
