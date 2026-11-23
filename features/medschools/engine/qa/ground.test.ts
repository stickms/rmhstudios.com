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
  it('lets a sentence name a source whose domain-shaped name is in our own fact text, and nothing else', () => {
    const own: RetrievedFact = { ...F2, ref: 'f6', text: 'Duke MCAT median 511 (Admit.org).' };
    expect(
      groundAnswer({ segments: [seg('Admit.org reports a median of 511.', 'f6')] }, [...FACTS, own]).segments,
    ).toHaveLength(1);
    // A domain no trusted fact holds is still a link, and so is a planted one.
    expect(run(seg('Other.org reports a median of 511.', 'f2')).reasons).toEqual(['link']);
    const planted: RetrievedFact = { ...F3, ref: 'f7', text: 'Ask about evil.example' };
    expect(groundAnswer({ segments: [seg('Ask about evil.example', 'f7')] }, [...FACTS, planted]).segments).toEqual([]);
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

describe('numbers the old lookbehind let through (the reviewer probe)', () => {
  const cases: [string, string][] = [
    ['zh glued', 'MCAT中央値は999です'],
    ['zh', '杜克的中位数是999。'],
    ['ja', 'MCAT中央値は999です。'],
    ['ar prefix', 'الوسيط ب٩٩٩'],
    ['ar prefix 2', 'وال٩٩٩'],
    ['invisible filler', 'Duke median is\u3164999'],
    ['zero-width', 'Duke median is 9\u200b9\u200b9'],
    ['bidi override', 'Duke MCAT median is \u202E999\u202C.'],
    ['letter prefix', 'Duke MCAT median abc999'],
    ['number word', 'Duke MCAT median is nine hundred ninety-nine.'],
    ['a dozen', 'Duke has a dozen reported events.'],
    ['half', 'Half of Duke interview events came in November.'],
    ['spanish', 'La mediana es novecientos noventa y nueve, o sea cincuenta por ciento.'],
    ['k suffix', 'Duke has 412k reported events.'],
    ['per cent', 'Duke has 412 per cent reported events.'],
    ['minus', 'Duke application-to-interview rate is -8%.'],
  ];
  it.each(cases)('drops %s', (_n, text) => {
    const g = run(seg(text, 'f1'), seg(text, 'f2'));
    expect(g.segments, text).toEqual([]);
  });
  it('still keeps the same figures when they match', () => {
    expect(run(seg('Duke has 412 reported events, MD-PhD or not, in 2026\u20132027.', 'f1')).segments).toHaveLength(1);
    expect(run(seg('Duke has four hundred twelve reported events.', 'f1')).segments).toHaveLength(1);
    expect(run(seg('No one knows how many events Duke will see.', 'f1')).segments).toHaveLength(1);
  });
  it('keeps a matching percent written as per cent and a matching negative', () => {
    const f: RetrievedFact = { ...F2, ref: 'f8', text: 'Duke rate 8% and change -3%.' };
    const g = (t: string) => groundAnswer({ segments: [seg(t, 'f8')] }, [f]).segments.length;
    expect(g('Duke rate is 8 per cent.')).toBe(1);
    expect(g('Duke change is -3%.')).toBe(1);
    expect(g('Duke change is 3%.')).toBe(0);
    expect(g('Duke rate is -8%.')).toBe(0);
    expect(g('Duke rate is 8k.')).toBe(0);
  });
});

describe('format characters', () => {
  it('removes bidi controls and zero-width characters from a kept sentence', () => {
    const g = run(seg('Duke has \u202E412\u202C reported\u200b interview events\u2066.', 'f1'));
    expect(g.segments).toEqual([seg('Duke has 412 reported interview events.', 'f1')]);
  });
  it('cannot hide a wrong number behind them', () => {
    expect(run(seg('Duke has \u202E999\u202C reported events.', 'f1')).segments).toEqual([]);
  });
});

describe('lookalike domains', () => {
  const planted: RetrievedFact = { ...F3, ref: 'f7', text: 'Ask about it' };
  const bad = [
    'Visit evil\u3002example now',
    'Visit evil\uff0eexample now',
    'Visit evil\ufe52example now',
    'Visit evil[.]example now',
    'Visit evil(.)example now',
    'Visit evil(dot)example now',
    'Visit evil\u200b.example now',
    'Visit ev\u200bil.example now',
    'Visit evil . com now',
    'Visit evil .com now',
    '访问evil。example',
  ];
  it.each(bad)('drops %j', (text) => {
    const g = groundAnswer({ segments: [seg(text, 'f7')] }, [...FACTS, planted]);
    expect(g.segments, text).toEqual([]);
    expect(g.reasons).toEqual(['link']);
  });
  it('leaves an ordinary sentence alone', () => {
    expect(run(seg('They ask about failure. Me too, we think.', 'f3')).segments).toHaveLength(1);
  });
});

describe('a sentence that pools several schools', () => {
  const unc: RetrievedFact = { ...F2, ref: 'f4', schoolSlug: 'unc', text: 'UNC MCAT median 515 (Admit.org).' };
  const names = new Map([
    ['duke', ['Duke', 'Duke University School of Medicine']],
    ['unc', ['UNC']],
  ]);
  const g = (t: string, ...cites: string[]) =>
    groundAnswer({ segments: [seg(t, ...cites)] }, [...FACTS, unc], { schoolNames: names }).segments.length;
  it('takes a number from a cited fact of a school the sentence names', () => {
    expect(g('Duke MCAT median is 511 and UNC is 515.', 'f2', 'f4')).toBe(1);
    expect(g('Duke MCAT median is 511.', 'f2', 'f4')).toBe(1);
  });
  it('refuses a number only a cited fact of an unnamed school holds', () => {
    expect(g('Duke MCAT median is 515.', 'f2', 'f4')).toBe(0);
    expect(g('The MCAT median is 515.', 'f2', 'f4')).toBe(0);
  });
  it('does not change a one-school sentence', () => {
    expect(g('The MCAT median is 511.', 'f2')).toBe(1);
  });
});

