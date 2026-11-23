import { describe, expect, it, vi } from 'vitest';
import { SDN_HOSTILE_NEEDLES } from '../../test-support';
import { SdnPageError } from './guard';
import { parseEssayQuestionsPage } from './parse-essays';
import { readFixture } from './test-fixtures';

const CTX = { currentCycle: 2027 };

const EXPECTED_VISIBLE = [
  {
    cycleYear: 2027,
    program: 'REG',
    text: 'Why Columbia?',
    limit: { kind: 'WORDS', value: 300 },
    optional: false,
    sourceRef: null,
  },
  {
    cycleYear: 2027,
    program: 'REG',
    text: 'Is there anything else you would like us to know?',
    limit: { kind: 'CHARS', value: 1000 },
    optional: true,
    sourceRef: null,
  },
  {
    cycleYear: 2027,
    program: 'PHD',
    text: 'Why do you want to pursue combined training in medicine and research?',
    limit: { kind: 'WORDS', value: 500 },
    optional: false,
    sourceRef: null,
  },
  {
    cycleYear: 2026,
    program: 'REG',
    text: 'Describe a time you worked with someone whose views differed from yours.',
    limit: { kind: 'WORDS', value: 250 },
    optional: false,
    sourceRef: null,
  },
];

describe('parseEssayQuestionsPage, inline data', () => {
  it('parses the Columbia page into the exact list of prompts', () => {
    const skipped = vi.fn();
    const out = parseEssayQuestionsPage(readFixture('essays-columbia.html'), { ...CTX, onSkippedSection: skipped });
    expect(out).toEqual([
      {
        cycleYear: 2027,
        program: 'REG',
        text: 'Describe a time you worked with someone whose views differed from yours.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2027,
        program: 'REG',
        text: 'Why Columbia?',
        limit: { kind: 'WORDS', value: 300 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2027,
        program: 'PHD',
        text: 'Why do you want to pursue combined training in medicine and research?',
        limit: { kind: 'WORDS', value: 500 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2026,
        program: 'REG',
        text: 'Describe a time you worked with someone whose views differed from yours.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2026,
        program: 'REG',
        text: 'Is there anything else you would like us to know?',
        limit: { kind: 'CHARS', value: 1000 },
        optional: true,
        sourceRef: null,
      },
    ]);
    // 2027-2028 has not begun: skipped and counted once.
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it('a hostile page gives only the prompt fields and none of its needles', () => {
    const page = readFixture('essays-hostile.html');
    for (const n of SDN_HOSTILE_NEEDLES) expect(page, n).toContain(n);
    const out = parseEssayQuestionsPage(page, CTX);
    expect(out.map((p) => p.text)).toEqual([
      'Why are you interested in our school?',
      'Describe a time you worked on a team.',
    ]);
    for (const p of out)
      expect(Object.keys(p).sort()).toEqual(['cycleYear', 'limit', 'optional', 'program', 'sourceRef', 'text']);
    const dump = JSON.stringify(out);
    for (const n of [...SDN_HOSTILE_NEEDLES, 'MentionedUserZQ', '9931']) expect(dump, n).not.toContain(n);
  });

  it('bad inline data is an SdnPageError without a status', () => {
    const wrap = (j: string) => `<script id="essay-questions-data" type="application/json">${j}</script>`;
    for (const bad of ['{not json', '{"a":1}', '"text"']) {
      let err: unknown;
      try {
        parseEssayQuestionsPage(wrap(bad), CTX);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(SdnPageError);
      expect((err as SdnPageError).status).toBeUndefined();
    }
  });

  it('an empty inline array is an empty list; malformed rows are skipped', () => {
    const wrap = (j: string) => `<script id="essay-questions-data" type="application/json">${j}</script>`;
    expect(parseEssayQuestionsPage(wrap('[]'), CTX)).toEqual([]);
    expect(parseEssayQuestionsPage(wrap('[null, 3, {"cycle": 5}, {"cycle":"2026-2027"}]'), CTX)).toEqual([]);
  });

  it('more than MAX_PER_SECTION rows under one cycle is an SdnPageError', () => {
    const rows = Array.from({ length: 41 }, (_, i) => ({
      cycle: '2026-2027',
      question: `Prompt ${i} about an experience`,
    }));
    const html = `<script id="essay-questions-data" type="application/json">${JSON.stringify(rows)}</script>`;
    expect(() => parseEssayQuestionsPage(html, CTX)).toThrow(SdnPageError);
  });
});

describe('parseEssayQuestionsPage, visible list', () => {
  it('parses the visible list when there is no inline data', () => {
    expect(parseEssayQuestionsPage(readFixture('essays-columbia-visible.html'), CTX)).toEqual(EXPECTED_VISIBLE);
  });

  it('a page that says it has no prompts is an empty list', () => {
    expect(parseEssayQuestionsPage(readFixture('essays-empty.html'), CTX)).toEqual([]);
  });

  it('a changed page and an empty document are SdnPageErrors', () => {
    expect(() => parseEssayQuestionsPage(readFixture('essays-changed.html'), CTX)).toThrow(SdnPageError);
    expect(() => parseEssayQuestionsPage('', CTX)).toThrow(SdnPageError);
  });

  it('prompt-shaped elements inside a comment block are never read', () => {
    const html = `<section class="essay-cycle" data-cycle="2026-2027">
      <ul><li class="essay-question"><p class="essay-text">Why are you interested in this school?</p></li></ul>
      <aside><h3 class="essay-program">MD/PhD</h3><ul><li class="essay-question"><p class="essay-text">A reply that looks like a prompt.</p></li></ul></aside>
    </section>`;
    const out = parseEssayQuestionsPage(html, CTX);
    expect(out.map((p) => p.text)).toEqual(['Why are you interested in this school?']);
  });
});
