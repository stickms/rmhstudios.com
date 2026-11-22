import { describe, expect, it } from 'vitest';
import {
  NOTE_EDIT_WINDOW_MS,
  NOTE_MAX_LENGTH,
  NOTES_PER_MEMBER_MAX,
  editWindowEnds,
  parseIdList,
  selectPreview,
  withinEditWindow,
} from '@/lib/communities/member-notes';
import { MOD_ACTIONS_BY_GROUP, groupOfAction, isModAction } from '@/lib/communities/modlog';

describe('limits', () => {
  it('match the specification', () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
    expect(NOTES_PER_MEMBER_MAX).toBe(50);
    expect(NOTE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('edit window', () => {
  const t0 = new Date('2026-11-21T10:00:00Z');
  it('is open up to and including 15 minutes and closed a millisecond later', () => {
    expect(withinEditWindow(t0, new Date(t0.getTime()))).toBe(true);
    expect(withinEditWindow(t0, new Date(t0.getTime() + NOTE_EDIT_WINDOW_MS))).toBe(true);
    expect(withinEditWindow(t0, new Date(t0.getTime() + NOTE_EDIT_WINDOW_MS + 1))).toBe(false);
  });
  it('closes 15 minutes after writing', () => {
    expect(editWindowEnds(t0).toISOString()).toBe('2026-11-21T10:15:00.000Z');
  });
});

describe('preview selection', () => {
  const mk = (id: string, minute: number, deleted = false) => ({
    id,
    createdAt: new Date(Date.UTC(2026, 10, 21, 10, minute)),
    deletedAt: deleted ? new Date() : null,
  });
  it('takes the latest two live notes, newest first', () => {
    const out = selectPreview([mk('a', 1), mk('c', 3), mk('b', 2), mk('d', 4)]);
    expect(out.map((n) => n.id)).toEqual(['d', 'c']);
  });
  it('never includes a deleted note, even the newest', () => {
    const out = selectPreview([mk('a', 1), mk('b', 2), mk('gone', 9, true)]);
    expect(out.map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('returns fewer when there are fewer, and none for none', () => {
    expect(selectPreview([mk('a', 1)]).map((n) => n.id)).toEqual(['a']);
    expect(selectPreview([])).toEqual([]);
  });
});

describe('id list', () => {
  it('splits, trims, drops blanks and duplicates', () => {
    expect(parseIdList(' a, b ,,a,c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('mod log', () => {
  it('note_deleted is a members-group action', () => {
    expect(isModAction('note_deleted')).toBe(true);
    expect((MOD_ACTIONS_BY_GROUP.members as readonly string[]).includes('note_deleted')).toBe(true);
    expect(groupOfAction('note_deleted')).toBe('members');
  });
});
