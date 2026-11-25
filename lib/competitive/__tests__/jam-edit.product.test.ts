import { describe, expect, it } from 'vitest';
import {
  JAM_EDIT_FIELDS,
  datesInOrder,
  editableFields,
  validateJamEdit,
  type JamState,
} from '@/lib/competitive/jam-edit';

// s14-14: what an admin may change in a game jam, by phase; the shared date-order rule; deadlines only move later
// once the jam has started.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-10T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const jam = (over: Partial<JamState> = {}): JamState => ({
  title: 'Space jam',
  description: 'Build something small',
  theme: 'Secret',
  startsAt: at(3),
  submitEndsAt: at(6),
  ratingEndsAt: at(9),
  themeVoting: false,
  themeVoteOpensAt: null,
  ...over,
});
const upcoming = jam();
const open = jam({ startsAt: at(-1), submitEndsAt: at(2), ratingEndsAt: at(5) });
const rating = jam({ startsAt: at(-3), submitEndsAt: at(-1), ratingEndsAt: at(2) });
const done = jam({ startsAt: at(-6), submitEndsAt: at(-4), ratingEndsAt: at(-1) });
const modes = (j: JamState) =>
  Object.fromEntries(JAM_EDIT_FIELDS.map((f) => [f, editableFields(j, NOW)[f].mode])) as Record<string, string>;

describe('editableFields', () => {
  it('lets everything but the vote time change before the start of a plain jam', () => {
    expect(modes(upcoming)).toEqual({
      title: 'free',
      description: 'free',
      theme: 'free',
      startsAt: 'free',
      submitEndsAt: 'free',
      ratingEndsAt: 'free',
      themeVoteOpensAt: 'locked',
    });
  });

  it('after the start allows the description and later deadlines only', () => {
    expect(modes(open)).toEqual({
      title: 'locked',
      description: 'free',
      theme: 'locked',
      startsAt: 'locked',
      submitEndsAt: 'later',
      ratingEndsAt: 'later',
      themeVoteOpensAt: 'locked',
    });
  });

  it('after submissions close allows the description and the rating deadline', () => {
    expect(modes(rating)).toMatchObject({ description: 'free', submitEndsAt: 'locked', ratingEndsAt: 'later' });
  });

  it('after rating closes locks everything', () => {
    for (const f of JAM_EDIT_FIELDS) expect(editableFields(done, NOW)[f]).toEqual({ mode: 'locked', reason: 'ended' });
  });

  it('locks a voting jam theme, and its vote time once the vote has opened', () => {
    const beforeVote = jam({ themeVoting: true, themeVoteOpensAt: at(1) });
    expect(editableFields(beforeVote, NOW).theme).toEqual({ mode: 'locked', reason: 'voting-theme' });
    expect(editableFields(beforeVote, NOW).themeVoteOpensAt.mode).toBe('free');
    const voteOpen = jam({ themeVoting: true, themeVoteOpensAt: at(-1) });
    expect(editableFields(voteOpen, NOW).themeVoteOpensAt).toEqual({ mode: 'locked', reason: 'vote-opened' });
    const unset = jam({ themeVoting: true, themeVoteOpensAt: null });
    expect(editableFields(unset, NOW).themeVoteOpensAt.mode).toBe('locked');
  });

  it('flips at the exact start instant', () => {
    const edge = jam({ startsAt: NOW });
    expect(editableFields(edge, NOW).title.mode).toBe('locked');
    expect(editableFields(edge, new Date(NOW.getTime() - 1)).title.mode).toBe('free');
  });
});

describe('datesInOrder', () => {
  it('is strict: start < submissions close < rating close', () => {
    expect(datesInOrder(at(1), at(2), at(3))).toBe(true);
    expect(datesInOrder(at(2), at(2), at(3))).toBe(false);
    expect(datesInOrder(at(1), at(3), at(3))).toBe(false);
    expect(datesInOrder(at(3), at(2), at(1))).toBe(false);
  });
});

describe('validateJamEdit', () => {
  it('returns the changed fields and the columns to write, ignoring repeated values', () => {
    const r = validateJamEdit(
      upcoming,
      { title: 'Ocean jam', description: upcoming.description, startsAt: at(3) },
      NOW,
    );
    expect(r).toEqual({ ok: true, changed: ['title'], data: { title: 'Ocean jam' } });
  });

  it('keeps the date order against the values that stay', () => {
    expect(validateJamEdit(upcoming, { startsAt: at(7) }, NOW)).toEqual({ ok: false, code: 'JAM_DATES_ORDER' });
    expect(validateJamEdit(upcoming, { submitEndsAt: at(10) }, NOW)).toEqual({ ok: false, code: 'JAM_DATES_ORDER' });
    expect(validateJamEdit(upcoming, { startsAt: at(7), submitEndsAt: at(8) }, NOW).ok).toBe(true);
  });

  it('refuses a locked field with its name', () => {
    expect(validateJamEdit(open, { title: 'New' }, NOW)).toEqual({
      ok: false,
      code: 'JAM_EDIT_LOCKED',
      field: 'title',
    });
    expect(validateJamEdit(open, { startsAt: at(-2) }, NOW)).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
    expect(validateJamEdit(done, { description: 'Late' }, NOW)).toMatchObject({ code: 'JAM_EDIT_LOCKED' });
  });

  it('after the start extends a deadline and refuses a shorter one', () => {
    expect(validateJamEdit(open, { submitEndsAt: at(3) }, NOW)).toMatchObject({ ok: true, changed: ['submitEndsAt'] });
    expect(validateJamEdit(open, { submitEndsAt: at(1) }, NOW)).toEqual({
      ok: false,
      code: 'JAM_DEADLINE_SHORTER',
      field: 'submitEndsAt',
    });
    expect(validateJamEdit(rating, { ratingEndsAt: at(1) }, NOW)).toMatchObject({ code: 'JAM_DEADLINE_SHORTER' });
  });

  it('an extension still has to keep the order', () => {
    expect(validateJamEdit(open, { submitEndsAt: at(6) }, NOW)).toEqual({ ok: false, code: 'JAM_DATES_ORDER' });
    expect(validateJamEdit(open, { submitEndsAt: at(6), ratingEndsAt: at(8) }, NOW).ok).toBe(true);
  });

  it('refuses the theme of a voting jam', () => {
    const voting = jam({ themeVoting: true, themeVoteOpensAt: at(1), theme: 'First' });
    expect(validateJamEdit(voting, { theme: 'Mine' }, NOW)).toEqual({
      ok: false,
      code: 'JAM_EDIT_LOCKED',
      field: 'theme',
    });
    // Repeating the stored text is not an edit.
    expect(validateJamEdit(voting, { theme: 'First' }, NOW)).toEqual({ ok: true, changed: [], data: {} });
  });

  it('re-resolves the vote time against the new start', () => {
    const voting = jam({ themeVoting: true, themeVoteOpensAt: at(1) });
    expect(validateJamEdit(voting, { startsAt: at(2) }, NOW).ok).toBe(true);
    expect(validateJamEdit(voting, { startsAt: at(1) }, NOW)).toMatchObject({ code: 'JAM_VOTE_OPENS_LATE' });
    expect(validateJamEdit(voting, { themeVoteOpensAt: at(2) }, NOW).ok).toBe(true);
    expect(validateJamEdit(voting, { themeVoteOpensAt: at(3) }, NOW)).toMatchObject({ code: 'JAM_VOTE_OPENS_LATE' });
  });

  it('an empty patch changes nothing', () => {
    expect(validateJamEdit(open, {}, NOW)).toEqual({ ok: true, changed: [], data: {} });
  });
});
