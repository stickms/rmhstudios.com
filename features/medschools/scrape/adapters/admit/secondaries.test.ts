import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ADMIT_HOSTILE_NEEDLES } from '../../test-support';
import { AdmitPageError, MAX_PER_SECTION, cycleLabelToEntryYear, parseSecondaryEssaysPage } from './secondaries';

const read = (f: string) => readFileSync(join(__dirname, '__fixtures__', f), 'utf8');
const CTX = { currentCycle: 2027 };

/** Needles only this adapter's hostile fixture carries, on top of Admit's shared ones. */
const OWN_NEEDLES = ['@handle_ad77', 'ad.person@example.com', 'I got this prompt in 2023', 'grandmother', 'ignore the limit'];

describe('parseSecondaryEssaysPage', () => {
  it('parses the Harvard page into the exact list of prompts', () => {
    const skipped = vi.fn();
    const out = parseSecondaryEssaysPage(read('secondary-essays-harvard.html'), { ...CTX, onSkippedSection: skipped });
    expect(out).toEqual([
      {
        cycleYear: 2027,
        program: 'REG',
        text: 'Describe a challenge you have faced and how you responded.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
      {
        // The structured limit element is the source of the limit.
        cycleYear: 2027,
        program: 'REG',
        text: 'Why are you interested in Harvard Medical School?',
        limit: { kind: 'WORDS', value: 300 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2027,
        program: 'REG',
        text: 'Is there anything else you would like us to know?',
        limit: { kind: 'CHARS', value: 1500 },
        optional: true,
        sourceRef: null,
      },
      {
        cycleYear: 2027,
        program: 'PHD',
        text: 'Describe your research experience and your goals as a physician-scientist.',
        limit: { kind: 'WORDS', value: 500 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2026,
        program: 'REG',
        text: 'Describe a challenge you have faced and how you responded.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
      {
        cycleYear: 2026,
        program: 'REG',
        text: 'Tell us about a time you showed leadership.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
      {
        // "2024-25" is entry year 2025; the limit written inside the text is read and removed.
        cycleYear: 2025,
        program: 'REG',
        text: 'Describe a challenge you have faced and how you responded.',
        limit: { kind: 'WORDS', value: 250 },
        optional: false,
        sourceRef: null,
      },
    ]);
    // The 2027-2028 section is beyond the current cycle: skipped and counted, never stored.
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it('never carries the "Chance %" statistic', () => {
    const dump = JSON.stringify(parseSecondaryEssaysPage(read('secondary-essays-harvard.html'), CTX));
    expect(dump).not.toMatch(/chance|%|64|91/i);
  });

  it('a hostile page gives only the prompt fields and none of its needles', () => {
    const out = parseSecondaryEssaysPage(read('secondary-essays-hostile.html'), CTX);
    expect(out.map((p) => p.text)).toEqual(['Why are you interested in our school?', 'Describe a time you worked on a team.']);
    for (const p of out) expect(Object.keys(p).sort()).toEqual(['cycleYear', 'limit', 'optional', 'program', 'sourceRef', 'text']);
    // The heading inside the comment block did not make the later prompts combined-degree ones.
    expect(out.every((p) => p.program === 'REG')).toBe(true);
    const dump = JSON.stringify(out);
    for (const n of [...ADMIT_HOSTILE_NEEDLES, ...OWN_NEEDLES]) expect(dump, n).not.toContain(n);
    // The fixture really carries every needle, so the assertion above has teeth.
    const page = read('secondary-essays-hostile.html');
    for (const n of [...ADMIT_HOSTILE_NEEDLES, ...OWN_NEEDLES]) expect(page, n).toContain(n);
  });

  it('a page that says it has no prompts is an empty list', () => {
    expect(parseSecondaryEssaysPage(read('secondary-essays-empty.html'), CTX)).toEqual([]);
  });

  it('a page with no recognisable section is an AdmitPageError (markup changed)', () => {
    expect(() => parseSecondaryEssaysPage(read('secondary-essays-changed.html'), CTX)).toThrow(AdmitPageError);
    expect(() => parseSecondaryEssaysPage('', CTX)).toThrow(AdmitPageError);
  });

  it('more than MAX_PER_SECTION prompts under one cycle is an AdmitPageError', () => {
    expect(MAX_PER_SECTION).toBe(40);
    expect(() => parseSecondaryEssaysPage(read('secondary-essays-toomany.html'), CTX)).toThrow(AdmitPageError);
  });

  it('reads the cycle from the heading when the section has no data attribute', () => {
    const html =
      '<section class="secondary-cycle"><h2 class="cycle-heading">2025-2026 prompts</h2><ol><li class="secondary-prompt"><p class="prompt-text">Why us? Tell us about our program.</p></li></ol></section>';
    expect(parseSecondaryEssaysPage(html, CTX).map((p) => p.cycleYear)).toEqual([2026]);
  });

  it('a prompt with a combined-degree phrase in its own text is PHD without a heading', () => {
    const html =
      '<section class="secondary-cycle" data-cycle="2026-2027"><li class="secondary-prompt"><p class="prompt-text">Why are you applying to the MD-PhD program?</p></li></section>';
    expect(parseSecondaryEssaysPage(html, CTX)[0]?.program).toBe('PHD');
  });
});

describe('cycleLabelToEntryYear (re-exported for the adapters)', () => {
  it('maps a range to its entry year and refuses what it cannot read', () => {
    expect(cycleLabelToEntryYear('2024-2025')).toBe(2025);
    expect(cycleLabelToEntryYear('Spring 2025')).toBeNull();
  });
});
