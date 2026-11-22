/**
 * Refusals in the reader's language (sprint 10, feature 20): reading a failed request's body into a code and its
 * params, and rendering it through the `errors` namespace. Pure: the hook's `t` is a fake that shows the key it was
 * asked for and the English it would fall back to.
 */
import { describe, expect, it } from 'vitest';
import { codedSentence } from '@/components/errors/refusal-sentence';
import { genericRefusal, refusalSentence as render, type Translate } from '@/components/errors/useRefusalText';

/** The hook's renderer with the taxonomy's sentences loaded, as they are once the page has hydrated. */
const refusalSentence = (t: Translate, fmt: (d: Date) => string, error: unknown) =>
  render(t, fmt, error, codedSentence);
import { readRefusal } from '@/lib/errors/refusal';
import { HttpError } from '@/lib/http';

/** `ns:key|English` with `{{params}}` filled in, as i18next would when the catalogue has no entry. */
const fakeT: Translate = (key, options) => {
  const { ns, defaultValue, ...params } = options as { ns?: string; defaultValue?: string } & Record<string, unknown>;
  const english = String(defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(params[name] ?? ''),
  );
  return `${ns ?? ''}:${key}|${english}`;
};
const iso = (date: Date) => `<${date.toISOString()}>`;

function refused(status: number, body: unknown, message?: string): HttpError {
  return new HttpError(status, message ?? (body as { error?: string } | null)?.error, undefined, { body });
}

describe('readRefusal', () => {
  it('reads a taxonomy code beside its English', () => {
    const error = refused(409, { error: 'This event is full', code: 'EVENT_FULL' });
    expect(readRefusal(error)).toEqual({ code: 'EVENT_FULL', params: {} });
  });

  it('reads a parsed body as well as an HttpError', () => {
    expect(readRefusal({ error: 'Build not found', code: 'BUILD_NOT_FOUND' })?.code).toBe('BUILD_NOT_FOUND');
  });

  it('keeps numeric params and refuses params of the wrong type', () => {
    expect(readRefusal({ error: 'A group can have 5 admins', code: 'GROUP_ADMIN_LIMIT', max: 5 })?.params).toEqual({
      max: 5,
    });
    expect(
      readRefusal({ error: 'A group can have 5 admins', code: 'GROUP_ADMIN_LIMIT', max: { evil: 1 } })?.params,
    ).toEqual({});
    expect(
      readRefusal({ error: 'A group can have 5 admins', code: 'GROUP_ADMIN_LIMIT', max: 'x'.repeat(200) })?.params,
    ).toEqual({});
  });

  it('drops an endsAt that is not a date', () => {
    expect(readRefusal({ code: 'community_banned', endsAt: 'soon' })?.params).toEqual({});
    expect(readRefusal({ code: 'community_banned', endsAt: '2027-01-02T03:04:05.000Z' })?.params).toEqual({
      endsAt: '2027-01-02T03:04:05.000Z',
    });
  });

  it('accepts the sanction codes under their older wire spelling', () => {
    expect(readRefusal(refused(403, { error: 'You are banned', code: 'community_banned', endsAt: null }))?.code).toBe(
      'COMMUNITY_BANNED',
    );
    expect(readRefusal({ error: 'x', code: 'community_timed_out' })?.code).toBe('COMMUNITY_TIMED_OUT');
  });

  it('ignores a code another layer owns when its English is not the code’s own', () => {
    // A tournament answers `code: 'NOT_FOUND'` over its own sentence; that must not become the taxonomy's NOT_FOUND.
    expect(readRefusal({ error: 'Tournament not found', code: 'NOT_FOUND' })).toBeNull();
    expect(readRefusal({ error: 'Not enough coins for the entry fee', code: 'INSUFFICIENT_COINS' })).toBeNull();
  });

  it('reads the taxonomy code a body carries in `refusal` beside its own `code`', () => {
    const body = { error: 'Tournament is full', code: 'FULL', refusal: 'TOURNAMENT_FULL' };
    expect(readRefusal(body)).toEqual({ code: 'TOURNAMENT_FULL', params: {} });
  });

  it('has nothing to read in an unknown code, a bare error, no body or something that is not an error', () => {
    expect(readRefusal({ error: 'x', code: 'NOPE' })).toBeNull();
    expect(readRefusal({ error: 'Plain' })).toBeNull();
    expect(readRefusal(new HttpError(500))).toBeNull();
    expect(readRefusal(new Error('boom'))).toBeNull();
    expect(readRefusal(null)).toBeNull();
    expect(readRefusal('EVENT_FULL')).toBeNull();
  });
});

describe('refusalSentence', () => {
  it('renders a known code from its errors key, with the English as the default', () => {
    const error = refused(409, { error: 'This event is full', code: 'EVENT_FULL' });
    expect(refusalSentence(fakeT, iso, error)).toBe('errors:eventFull|This event is full');
  });

  it('interpolates a count or a limit into the sentence', () => {
    const error = refused(409, { error: 'A group can have 5 admins', code: 'GROUP_ADMIN_LIMIT', max: 5 });
    expect(refusalSentence(fakeT, iso, error)).toBe('errors:groupAdminLimit|A group can have 5 admins');
  });

  it('formats endsAt through the reader’s formatter, not as the server’s ISO text', () => {
    const error = refused(403, {
      error: 'You are banned from this community until 2 Jan 2027, 03:04 UTC.',
      code: 'community_banned',
      endsAt: '2027-01-02T03:04:05.000Z',
    });
    expect(refusalSentence(fakeT, iso, error)).toBe(
      'community-bans:refusal-ban-until|You are banned from this community until <2027-01-02T03:04:05.000Z>.',
    );
  });

  it('reads an open-ended ban without a date', () => {
    const error = refused(403, { error: 'banned', code: 'community_banned', endsAt: null });
    expect(refusalSentence(fakeT, iso, error)).toBe(
      'community-bans:refusal-ban-open|You are banned from this community until a moderator lifts it.',
    );
  });

  it('falls back to the server text for an unknown code or no code', () => {
    expect(refusalSentence(fakeT, iso, refused(400, { error: 'Pick a better name', code: 'SOMETHING_NEW' }))).toBe(
      'Pick a better name',
    );
    expect(refusalSentence(fakeT, iso, refused(400, { error: 'Pick a better name' }))).toBe('Pick a better name');
  });

  it('has nothing to say for a failure with no body, so the caller’s own fallback or the generic line applies', () => {
    expect(refusalSentence(fakeT, iso, new HttpError(500))).toBeUndefined();
    expect(refusalSentence(fakeT, iso, new Error('network'))).toBeUndefined();
    expect(genericRefusal(fakeT)).toBe('errors:generic|Something went wrong');
  });
});
