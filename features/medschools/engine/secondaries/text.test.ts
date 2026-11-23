import { describe, expect, it } from 'vitest';
import { MAX_KEY, MAX_TEXT, classifyProgram, cycleLabelToEntryYear, parsePromptText, secondaryKey } from './text';

describe('parsePromptText', () => {
  it('pulls the list number and a bracketed word limit out of the text', () => {
    expect(parsePromptText('1. Describe a challenge you faced. (250 words)')).toEqual({
      text: 'Describe a challenge you faced.',
      limit: { kind: 'WORDS', value: 250 },
      optional: false,
    });
  });

  it.each([
    'Describe a challenge you faced in 250 words or fewer.',
    'Describe a challenge you faced. (max 250 words)',
    'Describe a challenge you faced. 250-word limit',
    'Describe a challenge you faced, no more than 250 words.',
    'Describe a challenge you faced. [250 words]',
  ])('reads a 250 word limit from %s', (raw) => {
    const r = parsePromptText(raw);
    expect(r.limit).toEqual({ kind: 'WORDS', value: 250 });
    expect(r.text).not.toMatch(/\d/);
    expect(r.text.startsWith('Describe a challenge you faced')).toBe(true);
  });

  it('reads an optional marker and a character limit with a thousands separator', () => {
    expect(parsePromptText('(Optional) Is there anything else? 1,500 characters with spaces')).toEqual({
      text: 'Is there anything else?',
      limit: { kind: 'CHARS', value: 1500 },
      optional: true,
    });
  });

  it('a prompt with neither has no limit and is not optional', () => {
    expect(parsePromptText('Why us?')).toEqual({ text: 'Why us?', limit: null, optional: false });
  });

  it('counts an optional marker only in a bracket, at the start or at the end', () => {
    expect(parsePromptText('Describe your optional courses').optional).toBe(false);
    expect(parsePromptText('Optional: Anything else we should know?')).toMatchObject({
      optional: true,
      text: 'Anything else we should know?',
    });
    expect(parsePromptText('Anything else we should know? - Optional')).toMatchObject({
      optional: true,
      text: 'Anything else we should know?',
    });
    expect(parsePromptText('Anything else we should know? (Optional, 300 words)')).toMatchObject({
      optional: true,
      limit: { kind: 'WORDS', value: 300 },
      text: 'Anything else we should know?',
    });
  });

  it('drops an impossible limit but still removes its phrase', () => {
    expect(parsePromptText('Why us? (0 words)').limit).toBeNull();
    expect(parsePromptText('Why us? (30000 words)')).toMatchObject({ limit: null, text: 'Why us?' });
  });

  it('cuts overlong text at a word boundary and removes control and zero-width characters', () => {
    const long = `${'word '.repeat(600)}end`;
    const r = parsePromptText(long).text;
    expect(r.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(r.endsWith('word')).toBe(true);
    expect(parsePromptText('Why​ us\u0000 here\tnow?').text).toBe('Why us here now?');
  });
});

describe('secondaryKey', () => {
  it('is the same for one prompt written with different noise (Review Focus 4)', () => {
    const variants = [
      'Describe a challenge you faced. (250 words)',
      '1. DESCRIBE a challenge you faced.  (Optional)',
      'Describe a challenge you faced, in 300 words or fewer.',
      '“Describe” a  challenge you faced.',
    ];
    const keys = variants.map(secondaryKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('describe a challenge you faced');
  });

  it('differs when a word differs', () => {
    expect(secondaryKey('Describe a challenge you faced.')).not.toBe(
      secondaryKey('Describe a challenge you overcame.'),
    );
  });

  it('keeps an in-word apostrophe, curly or straight, and drops a quoting one', () => {
    expect(secondaryKey('What’s your story?')).toBe("what's your story");
    expect(secondaryKey("What's your story?")).toBe("what's your story");
    expect(secondaryKey("Explain 'why' now")).toBe('explain why now');
  });

  it('is capped, and empty text has the empty key', () => {
    expect(secondaryKey('word '.repeat(400)).length).toBeLessThanOrEqual(MAX_KEY);
    expect(secondaryKey('')).toBe('');
    expect(secondaryKey('  (250 words) ')).toBe('');
  });
});

describe('classifyProgram', () => {
  it.each([
    ['Why are you applying to the MD-PhD program?', undefined],
    ['Describe your research', 'MD/PhD Applicants'],
    ['MSTP applicants only: describe your research.', undefined],
    ['DO/PhD applicants describe your goals.', undefined],
    ['Describe your goals.', 'Combined degree program'],
  ])('%s is PHD', (text, heading) => {
    expect(classifyProgram(text, heading)).toBe('PHD');
  });

  it('is REG otherwise', () => {
    expect(classifyProgram('Why this school?')).toBe('REG');
    expect(classifyProgram('Tell us about a PhD in economics you considered.')).toBe('REG');
    expect(classifyProgram('Why this school?', 'All applicants')).toBe('REG');
  });
});

describe('cycleLabelToEntryYear', () => {
  it.each(['2024-2025', '2024\u20132025', '2024-25', ' 2024 - 2025 ', '2024\u201325'])('reads %j as the entry year 2025', (label) => {
    expect(cycleLabelToEntryYear(label)).toBe(2025);
  });

  it('reads a bare year as the entry year as written (unverified, plan Facts 2)', () => {
    expect(cycleLabelToEntryYear('2025')).toBe(2025);
  });

  it.each(['Spring 2025', '', '1999-2000', '2024-2026', '2024-26', '2025-2024', 'cycle', '2024-2025 prompts'])(
    'is null for %j',
    (label) => {
      expect(cycleLabelToEntryYear(label)).toBeNull();
    },
  );

  it('is null for a cycle after the current one, and the current one itself stands', () => {
    expect(cycleLabelToEntryYear('2027-2028', 2027)).toBeNull();
    expect(cycleLabelToEntryYear('2026-2027', 2027)).toBe(2027);
    expect(cycleLabelToEntryYear('2028', 2027)).toBeNull();
  });
});
