import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ADMIT_HOSTILE_NEEDLES } from '../../test-support';
import { AdmitPageError, MAX_PER_SECTION, cycleLabelToEntryYear, parseSecondaryEssaysPage } from './secondaries';

const read = (f: string) => readFileSync(join(__dirname, '__fixtures__', f), 'utf8');
const CTX = { currentCycle: 2027 };

/** Needles only this adapter's hostile fixture carries, on top of Admit's shared ones. */
const OWN_NEEDLES = [
  '@handle_ad77',
  'ad.person@example.com',
  'I got this prompt in 2023',
  'grandmother',
  'ignore the limit',
];

const byCycle = (out: { cycleYear: number }[]): Record<number, number> => {
  const m: Record<number, number> = {};
  for (const p of out) m[p.cycleYear] = (m[p.cycleYear] ?? 0) + 1;
  return m;
};

/** A page whose flight stream is `stream`, split in two pushes the way the real one is. */
function flightPage(stream: string): string {
  const cut = Math.floor(stream.length / 2);
  return [stream.slice(0, cut), stream.slice(cut)]
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join('');
}
const dataRow = (years: unknown): string => `1c:${JSON.stringify(['$', 'main', null, { backendData: years }])}\n`;

describe('parseSecondaryEssaysPage (real pages captured 2026-11-23)', () => {
  it('Harvard: application year N is the N-(N+1) cycle, entry year N+1, one count per year', () => {
    const skipped = vi.fn();
    const out = parseSecondaryEssaysPage(read('secondary-essays-harvard.html'), { ...CTX, onSkippedSection: skipped });
    expect(byCycle(out)).toEqual({ 2020: 4, 2021: 5, 2022: 6, 2023: 6, 2024: 6, 2025: 5, 2026: 5 });
    expect(skipped).not.toHaveBeenCalled();
    // The newest tab (application year 2025) as a list: texts, structured limits, no program headings.
    const latest = out.filter((p) => p.cycleYear === 2026);
    expect(latest.map((p) => p.text.slice(0, 40))).toEqual([
      'On average how many hours per week did y',
      'If you have already graduated, briefly s',
      'If there is an important aspect of your ',
      'The interview season for the 2025-2026 c',
      'The HST MD program draws on the combined',
    ]);
    expect(latest.map((p) => p.limit)).toEqual([
      null,
      { kind: 'CHARS', value: 4000 },
      { kind: 'CHARS', value: 4000 },
      { kind: 'CHARS', value: 1000 },
      { kind: 'CHARS', value: 4000 },
    ]);
    // A long prompt arrives through a text row reference ("$52") in the older years and is read whole.
    const hst2020 = out.find((p) => p.cycleYear === 2020 && p.text.startsWith('The HST MD program'));
    expect(hst2020?.text.length).toBe(1060);
    expect(hst2020?.text.endsWith('a font size of 10 or 12.')).toBe(true);
    expect(latest.every((p) => p.program === 'REG' && !p.optional && p.sourceRef === null)).toBe(true);
  });

  it('a cycle after the current one is skipped and counted, never stored', () => {
    const skipped = vi.fn();
    const out = parseSecondaryEssaysPage(read('secondary-essays-harvard.html'), {
      currentCycle: 2025,
      onSkippedSection: skipped,
    });
    expect(Math.max(...out.map((p) => p.cycleYear))).toBe(2025);
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it('Alabama COM (DO): word limits come from the structured fields and change by cycle', () => {
    const out = parseSecondaryEssaysPage(read('secondary-essays-alabama.html'), CTX);
    expect(byCycle(out)).toEqual({ 2020: 2, 2021: 2, 2022: 2, 2023: 2, 2024: 3, 2025: 3, 2026: 3 });
    expect(out.filter((p) => p.cycleYear === 2023).map((p) => p.limit)).toEqual([
      { kind: 'WORDS', value: 500 },
      { kind: 'WORDS', value: 500 },
    ]);
    expect(out.filter((p) => p.cycleYear === 2026).map((p) => p.limit)).toEqual([
      { kind: 'WORDS', value: 250 },
      { kind: 'WORDS', value: 250 },
      { kind: 'WORDS', value: 500 },
    ]);
  });

  it('WashU and Rowan: character limits, and a prompt with no limit', () => {
    const wu = parseSecondaryEssaysPage(read('secondary-essays-wustl.html'), CTX);
    expect(byCycle(wu)).toEqual({ 2020: 3, 2021: 3, 2022: 3, 2023: 3, 2024: 3, 2025: 3, 2026: 3 });
    expect(wu.filter((p) => p.cycleYear === 2026).map((p) => p.limit)).toEqual([
      { kind: 'CHARS', value: 2000 },
      { kind: 'CHARS', value: 3000 },
      { kind: 'CHARS', value: 3000 },
    ]);
    const ro = parseSecondaryEssaysPage(read('secondary-essays-rowan.html'), CTX);
    expect(byCycle(ro)).toEqual({ 2020: 3, 2021: 3, 2022: 5, 2023: 4, 2024: 4, 2025: 4, 2026: 5 });
    expect(ro.filter((p) => p.cycleYear === 2026).every((p) => p.limit === null)).toBe(true);
  });

  it('none of the captured Admit pages names a combined-degree program, so nothing is PHD', () => {
    for (const f of ['harvard', 'wustl', 'rowan', 'alabama'])
      for (const p of parseSecondaryEssaysPage(read(`secondary-essays-${f}.html`), CTX)) expect(p.program).toBe('REG');
  });

  it('never carries the "Chance %" statistic or the years a prompt was used', () => {
    const page = read('secondary-essays-harvard.html');
    expect(page).toMatch(/\\"chance\\"|"chance"/);
    const dump = JSON.stringify(parseSecondaryEssaysPage(page, CTX));
    expect(dump).not.toMatch(/chance|0\.99|99%|pYears/i);
  });

  it('a hostile page gives only the prompt fields and none of its needles', () => {
    const page = read('secondary-essays-hostile.html');
    for (const n of [...ADMIT_HOSTILE_NEEDLES, ...OWN_NEEDLES]) expect(page, n).toContain(n);
    const out = parseSecondaryEssaysPage(page, CTX);
    expect(out.filter((p) => p.cycleYear === 2026).map((p) => p.text.slice(0, 40))).toEqual([
      'On average how many hours per week did y',
      'If you have already graduated, briefly s',
    ]);
    for (const p of out)
      expect(Object.keys(p).sort()).toEqual(['cycleYear', 'limit', 'optional', 'program', 'sourceRef', 'text']);
    const dump = JSON.stringify(out);
    for (const n of [...ADMIT_HOSTILE_NEEDLES, ...OWN_NEEDLES]) expect(dump, n).not.toContain(n);
  });

  it('a page whose years hold no prompts is an empty list', () => {
    expect(parseSecondaryEssaysPage(read('secondary-essays-empty.html'), CTX)).toEqual([]);
  });

  it('a page whose data key is gone is an AdmitPageError (markup changed)', () => {
    expect(() => parseSecondaryEssaysPage(read('secondary-essays-changed.html'), CTX)).toThrow(AdmitPageError);
    expect(() => parseSecondaryEssaysPage('', CTX)).toThrow(AdmitPageError);
  });

  it('more than MAX_PER_SECTION prompts under one year is an AdmitPageError', () => {
    expect(MAX_PER_SECTION).toBe(40);
    expect(() => parseSecondaryEssaysPage(read('secondary-essays-toomany.html'), CTX)).toThrow(AdmitPageError);
  });
});

describe('parseSecondaryEssaysPage, the flight stream', () => {
  const year = (y: number, prompts: unknown[]) => ({ year: y, prompts });

  it('reads a text row by its byte length (multibyte text), a literal "$$" and a limit in the text', () => {
    const text = 'Describe how Ünïversity life shaped your goals.';
    const stream =
      `52:T${Buffer.byteLength(text).toString(16)},${text}` +
      dataRow([
        year(2025, [
          { pBody: '$52', countNum: 250, typeCount: 'words' },
          { pBody: '$$5 application fee: explain why. (Optional)', countNum: null, typeCount: null },
          { pBody: 'Why us? (300 words)', countNum: null, typeCount: null },
        ]),
      ]);
    const out = parseSecondaryEssaysPage(flightPage(stream), CTX);
    expect(out).toEqual([
      { cycleYear: 2026, program: 'REG', text, limit: { kind: 'WORDS', value: 250 }, optional: false, sourceRef: null },
      {
        cycleYear: 2026,
        program: 'REG',
        text: '$5 application fee: explain why.',
        limit: null,
        optional: true,
        sourceRef: null,
      },
      {
        cycleYear: 2026,
        program: 'REG',
        text: 'Why us?',
        limit: { kind: 'WORDS', value: 300 },
        optional: false,
        sourceRef: null,
      },
    ]);
  });

  it('a prompt that names a combined-degree program in its text is PHD', () => {
    const stream = dataRow([year(2025, [{ pBody: 'Why are you applying to the MD-PhD program?' }])]);
    expect(parseSecondaryEssaysPage(flightPage(stream), CTX)[0]?.program).toBe('PHD');
  });

  it('a reference to a text row that is not there is an AdmitPageError', () => {
    const stream = dataRow([year(2025, [{ pBody: '$99' }])]);
    expect(() => parseSecondaryEssaysPage(flightPage(stream), CTX)).toThrow(AdmitPageError);
  });

  it('an empty list of years is an empty page; years that are not numbers are ignored', () => {
    expect(parseSecondaryEssaysPage(flightPage(dataRow([])), CTX)).toEqual([]);
    expect(parseSecondaryEssaysPage(flightPage(dataRow([year('x' as unknown as number, [{ pBody: 'Why?' }])])), CTX)).toEqual(
      [],
    );
  });
});

describe('cycleLabelToEntryYear (re-exported for the adapters)', () => {
  it('maps a range to its entry year and refuses what it cannot read', () => {
    expect(cycleLabelToEntryYear('2024-2025')).toBe(2025);
    // Admit's numeric year is the application year; the adapter passes `${year}-${year + 1}`.
    expect(cycleLabelToEntryYear('2025-2026')).toBe(2026);
    expect(cycleLabelToEntryYear('Spring 2025')).toBeNull();
  });
});
