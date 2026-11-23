import { describe, expect, it, vi } from 'vitest';
import { SDN_HOSTILE_NEEDLES } from '../../test-support';
import { SdnPageError } from './guard';
import { parseEssayQuestionsPage } from './parse-essays';
import { readFixture } from './test-fixtures';

const CTX = { currentCycle: 2027 };

const byCycle = (out: { cycleYear: number; program: string }[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const p of out) {
    const k = `${p.cycleYear}/${p.program}`;
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
};

/** A page in the real shape with the given items: `[data-years, text]`. */
function pageWith(items: [string, string][], metric = items.length): string {
  const lis = items
    .map(([years, text]) => `<li class="question-item py-3" data-years="${years}"><div><p class="x">${text}</p></div></li>`)
    .join('');
  return `<div id="essay-questions-page"><section class="sdn-school-essay-metrics"><div>Prompts</div><div>${metric}</div></section><section class="category-card"><h2>Other</h2><ul>${lis}</ul></section></div>`;
}

describe('parseEssayQuestionsPage (real pages captured 2026-11-23)', () => {
  it('Harvard: one prompt per cycle it was used in, ranges read as entry years, counts per cycle', () => {
    const skipped = vi.fn();
    const out = parseEssayQuestionsPage(readFixture('essays-hms.html'), { ...CTX, onSkippedSection: skipped });
    // 8 prompt wordings; the page's cycles are 2026-2027, 2024-2025, 2023-2024 and 2022-2023.
    expect(byCycle(out)).toEqual({ '2027/REG': 2, '2025/REG': 2, '2024/REG': 4, '2023/REG': 5 });
    expect(skipped).not.toHaveBeenCalled();
    const current = out.filter((p) => p.cycleYear === 2027);
    expect(current.map((p) => p.text.slice(0, 40))).toEqual([
      'If there is an important aspect of your ',
      'If you have already graduated, please br',
    ]);
    // The limit is written inside the text and is read out of it ("(maximum 4000 characters)").
    expect(current.map((p) => p.limit)).toEqual([null, { kind: 'CHARS', value: 4000 }]);
    expect(current[1]?.text).toBe('If you have already graduated, please briefly summarize your activities since graduation.');
    expect(out.every((p) => p.sourceRef === null)).toBe(true);
  });

  it('the list number and the (Optional) marker are not part of the text', () => {
    const out = parseEssayQuestionsPage(readFixture('essays-hms.html'), CTX);
    expect(out.every((p) => !/^\d+\.\s/.test(p.text))).toBe(true);
    const opt = out.filter((p) => p.optional);
    expect(opt).toHaveLength(1);
    expect(opt[0]?.cycleYear).toBe(2023);
    expect(opt[0]?.text.startsWith('The Committee on Admissions recognizes')).toBe(true);
  });

  it('WashU: a combined-degree prompt is PHD from its own text, nothing else is', () => {
    const out = parseEssayQuestionsPage(readFixture('essays-wustl.html'), CTX);
    expect(byCycle(out)).toEqual({
      '2027/REG': 4,
      '2027/PHD': 1,
      '2025/REG': 3,
      '2024/REG': 3,
      '2021/REG': 3,
      '2020/REG': 5,
      '2019/REG': 12,
    });
    const phd = out.filter((p) => p.program === 'PHD');
    expect(phd).toHaveLength(1);
    expect(phd[0]).toMatchObject({ cycleYear: 2027, limit: { kind: 'CHARS', value: 1800 }, optional: false });
    expect(phd[0]?.text).toMatch(/^Briefly describe the area of research you would like to explore in graduate school/);
  });

  it('Alabama COM (DO): three prompts from one older cycle, categories are not programs', () => {
    const out = parseEssayQuestionsPage(readFixture('essays-acom.html'), CTX);
    expect(byCycle(out)).toEqual({ '2024/REG': 3 });
    expect(out.map((p) => p.text.slice(0, 30))).toEqual([
      'Describe how specific attribut',
      'What are your personal attribu',
      'The Alabama College of Osteopa',
    ]);
  });

  it('a cycle after the current one is skipped and counted once, never stored', () => {
    const skipped = vi.fn();
    const out = parseEssayQuestionsPage(readFixture('essays-hms.html'), { currentCycle: 2026, onSkippedSection: skipped });
    expect(out.some((p) => p.cycleYear > 2026)).toBe(false);
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it('a school with no prompts says so in its metrics and is an empty list', () => {
    expect(parseEssayQuestionsPage(readFixture('essays-empty.html'), CTX)).toEqual([]);
  });

  it('a hostile page gives only the prompt fields and none of its needles', () => {
    const page = readFixture('essays-hostile.html');
    for (const n of SDN_HOSTILE_NEEDLES.filter((n) => n !== 'sigzq-contact-line' || page.includes(n)))
      expect(page, n).toContain(n);
    const out = parseEssayQuestionsPage(page, CTX);
    expect(out).toEqual(parseEssayQuestionsPage(readFixture('essays-hms.html'), CTX));
    for (const p of out)
      expect(Object.keys(p).sort()).toEqual(['cycleYear', 'limit', 'optional', 'program', 'sourceRef', 'text']);
    const dump = JSON.stringify(out);
    for (const n of [...SDN_HOSTILE_NEEDLES, 'MentionedUserZQ', 'looks like a prompt']) expect(dump, n).not.toContain(n);
  });

  it('a changed page and an empty document are SdnPageErrors without a status', () => {
    for (const html of [readFixture('essays-changed.html'), '']) {
      let err: unknown;
      try {
        parseEssayQuestionsPage(html, CTX);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(SdnPageError);
      expect((err as SdnPageError).status).toBeUndefined();
    }
  });

  it('no prompts without the page saying there are none is an SdnPageError', () => {
    expect(() => parseEssayQuestionsPage('<div id="essay-questions-page"></div>', CTX)).toThrow(SdnPageError);
    expect(() => parseEssayQuestionsPage(pageWith([], 8), CTX)).toThrow(SdnPageError);
    expect(parseEssayQuestionsPage(pageWith([], 0), CTX)).toEqual([]);
  });

  it('more than MAX_PER_SECTION prompts under one cycle is an SdnPageError', () => {
    const items = Array.from({ length: 41 }, (_, i): [string, string] => ['2026-2027', `Prompt ${i} about an experience`]);
    expect(() => parseEssayQuestionsPage(pageWith(items), CTX)).toThrow(SdnPageError);
    expect(parseEssayQuestionsPage(pageWith(items.slice(0, 40)), CTX)).toHaveLength(40);
  });

  it('items with no cycle, an unreadable cycle or prompt-shaped markup in a comment block are not read', () => {
    const html = `${pageWith([
      ['', 'No cycle at all?'],
      ['Spring 2026', 'A cycle nobody can read?'],
      ['2026-2027,2026-2027', 'Why this school?'],
    ])}<div id="comments" class="comment-list"><ul><li class="question-item" data-years="2026-2027"><p>A reply that looks like a prompt?</p></li></ul></div>`;
    const skipped = vi.fn();
    const out = parseEssayQuestionsPage(html, { ...CTX, onSkippedSection: skipped });
    expect(out.map((p) => p.text)).toEqual(['Why this school?']);
    expect(skipped).toHaveBeenCalledTimes(1);
  });
});
