import { describe, expect, it } from 'vitest';
import {
  canEditDraft,
  diffDraftEdit,
  draftEditError,
  formFromRow,
  isoToLocalInput,
  isPastTime,
  localInputToIso,
  type DraftEditRow,
} from '../draft-edit';

const when = new Date(2031, 4, 6, 9, 30).toISOString();
const row: DraftEditRow = {
  id: 'd1',
  content: 'hello',
  audience: 'PUBLIC',
  scheduledAt: when,
  contentWarning: null,
  imageUrls: ['u1', 'u2'],
  imageAlts: ['one', ''],
};

describe('diffDraftEdit', () => {
  it('sends nothing for an unchanged form', () => {
    expect(diffDraftEdit(row, formFromRow(row))).toEqual({});
  });

  it('sends only the text when only the text changed', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), content: 'hello there' })).toEqual({ content: 'hello there' });
  });

  it('sends the new time as a UTC instant', () => {
    const later = new Date(2031, 4, 6, 11, 30);
    const patch = diffDraftEdit(row, { ...formFromRow(row), time: isoToLocalInput(later.toISOString()) });
    expect(patch).toEqual({ scheduledAt: later.toISOString() });
  });

  it('clears the time with null ("Keep as draft")', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), time: '' })).toEqual({ scheduledAt: null });
  });

  it('sets a time on a plain draft', () => {
    const draft = { ...row, scheduledAt: null };
    const patch = diffDraftEdit(draft, { ...formFromRow(draft), time: '2031-06-01T08:00' });
    expect(patch).toEqual({ scheduledAt: localInputToIso('2031-06-01T08:00') });
  });

  it('sends the audience', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), audience: 'PRIVATE' })).toEqual({ audience: 'PRIVATE' });
  });

  it('sends a warning reason, and clears it with null plus isSensitive false', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), contentWarning: ' spoilers ' })).toEqual({
      contentWarning: 'spoilers',
    });
    const warned = { ...row, contentWarning: 'spoilers' };
    expect(diffDraftEdit(warned, { ...formFromRow(warned), contentWarning: '' })).toEqual({
      contentWarning: null,
      isSensitive: false,
    });
  });

  it('leaves an invalid warning out', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), contentWarning: 'x'.repeat(200) })).toEqual({});
  });

  it('sends the whole description list when one description changed', () => {
    const form = formFromRow(row);
    expect(diffDraftEdit(row, { ...form, imageAlts: ['one', 'a cat'] })).toEqual({ imageAlts: ['one', 'a cat'] });
  });

  it('does not send descriptions that only differ by surrounding space', () => {
    expect(diffDraftEdit(row, { ...formFromRow(row), imageAlts: [' one ', ''] })).toEqual({});
  });
});

describe('time helpers', () => {
  it('round-trips an instant through the local input (to the minute)', () => {
    expect(localInputToIso(isoToLocalInput(when))).toBe(when);
  });
  it('knows a past time', () => {
    expect(isPastTime('2020-01-01T00:00')).toBe(true);
    expect(isPastTime('2099-01-01T00:00')).toBe(false);
    expect(isPastTime('')).toBe(false);
  });
});

describe('canEditDraft', () => {
  it('refuses a capsule only', () => {
    expect(canEditDraft({ isCapsule: true })).toBe(false);
    expect(canEditDraft({ isCapsule: false })).toBe(true);
    expect(canEditDraft({})).toBe(true);
  });
});

describe('draftEditError', () => {
  it('maps each code to its line', () => {
    expect(draftEditError({ status: 400, body: { error: 'wording may change', code: 'past' } })).toMatchObject({
      field: 'time',
      code: 'past',
    });
    expect(draftEditError({ status: 400, body: { error: 'x', code: 'ALT_REQUIRED', missing: [1] } })).toMatchObject({
      field: 'images',
      code: 'alt_required',
      missing: [1],
    });
    expect(draftEditError({ status: 409, body: { error: 'x', code: 'published' } })).toMatchObject({
      code: 'published',
    });
    expect(draftEditError({ status: 409, body: { error: 'x', code: 'capsule_sealed' } })).toMatchObject({
      code: 'capsule_sealed',
    });
    expect(draftEditError({ status: 404, body: { error: 'Not found' } })).toMatchObject({ code: 'not_found' });
  });
  it('shows a community refusal with its own message, and an unknown failure generically', () => {
    expect(
      draftEditError({ status: 403, body: { error: 'You are timed out here', code: 'community_timed_out' } }),
    ).toEqual({
      field: 'form',
      code: 'message',
      message: 'You are timed out here',
    });
    expect(draftEditError({})).toEqual({ field: 'form', code: 'unknown' });
  });
});
