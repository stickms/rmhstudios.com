/**
 * The validator behind the session-description retry.
 *
 * In the suite for the same reason `components/pf2ecal/rich-text.test.tsx` is:
 * this is the boundary where MODEL OUTPUT becomes page content, and the failure
 * it prevents is not subtle. Without it a DeepSeek response that opened with
 * "Sure! Here's the JSON:" would be stored on the row and rendered under a
 * session as literal braces, on an unlisted page five people use to work out
 * when to show up.
 *
 * It is also what makes the retry mean anything. `writeSessionBlurb` re-asks up
 * to three times, and "re-ask" is only correct if the thing deciding whether the
 * answer was good is strict — a lenient parser would accept the first mangled
 * response and never retry at all. So the assertions below are mostly about what
 * is REJECTED.
 */

import { describe, it, expect } from 'vitest';
import { parseSessionBlurb } from '@/lib/ai/text.server';

const good = JSON.stringify({
  short: 'At Zack’s place, and three people are already in.',
  long: 'The notes say the party is picking up outside the vault. Zack is hosting, so it is the usual room. Three have said they are coming and one is a maybe.',
});

describe('parseSessionBlurb — accepts', () => {
  it('a well-formed object', () => {
    const blurb = parseSessionBlurb(good);
    expect(blurb?.short).toContain('Zack');
    expect(blurb?.long).toContain('vault');
  });

  it('a fenced code block, which models emit constantly', () => {
    // Not a content error and not worth burning a retry on — the answer inside
    // is exactly right.
    expect(parseSessionBlurb('```json\n' + good + '\n```')).not.toBeNull();
    expect(parseSessionBlurb('```\n' + good + '\n```')).not.toBeNull();
  });

  it('surrounding whitespace', () => {
    expect(parseSessionBlurb(`\n\n  ${good}  \n`)).not.toBeNull();
  });

  it('and trims the fields it returns', () => {
    const blurb = parseSessionBlurb(JSON.stringify({ short: '  a  ', long: '  b  ' }));
    expect(blurb).toEqual({ short: 'a', long: 'b' });
  });
});

describe('parseSessionBlurb — rejects, so the caller retries', () => {
  it.each([
    ['prose instead of JSON', 'Sure! Here is a description of the session.'],
    ['a preamble before the JSON', `Here you go:\n${good}`],
    ['an empty string', ''],
    ['a JSON array', '[{"short":"a","long":"b"}]'],
    ['a JSON string', '"just a sentence"'],
    ['null', 'null'],
    ['a missing field', '{"short":"only this one"}'],
    ['an empty field', '{"short":"","long":"b"}'],
    ['a whitespace-only field', '{"short":"   ","long":"b"}'],
    ['a non-string field', '{"short":42,"long":"b"}'],
    ['truncated output', '{"short":"it got cut off'],
  ])('%s', (_label, payload) => {
    expect(parseSessionBlurb(payload)).toBeNull();
  });

  it('a "short" that came back as a paragraph', () => {
    // The most common way the model ignores the brief, and the one a retry
    // reliably fixes. Accepting it would push a wall of text into a card that
    // clamps at two lines.
    const long = 'x'.repeat(400);
    expect(parseSessionBlurb(JSON.stringify({ short: long, long: 'fine' }))).toBeNull();
  });

  it('a "short" containing a line break', () => {
    expect(parseSessionBlurb(JSON.stringify({ short: 'one\ntwo', long: 'fine' }))).toBeNull();
  });

  it('a "long" past the column width', () => {
    // `blurbLong` is VarChar(2000); anything that would be truncated by Postgres
    // is rejected here rather than stored half-written.
    expect(parseSessionBlurb(JSON.stringify({ short: 'fine', long: 'y'.repeat(2500) }))).toBeNull();
  });
});
