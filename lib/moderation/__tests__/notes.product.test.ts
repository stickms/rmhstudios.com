import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_EDITS,
  MAX_PINNED_NOTES,
  NOTE_EDIT_WINDOW_MS,
  canPinAnother,
  editRefusal,
  editWindowEnds,
  splitNoteText,
} from '@/lib/moderation/notes';

const created = new Date('2026-11-20T10:00:00Z');
const base = {
  authorId: 'a',
  viewerId: 'a',
  createdAt: created,
  deletedAt: null,
  editCount: 0,
};
const at = (ms: number) => new Date(created.getTime() + ms);

describe('edit window', () => {
  it('lets the author edit inside 24 hours, including the last instant', () => {
    expect(
      editRefusal({
        ...base,
        now: at(1000),
      }),
    ).toBeNull();
    expect(
      editRefusal({
        ...base,
        now: at(NOTE_EDIT_WINDOW_MS),
      }),
    ).toBeNull();
  });

  it('closes after 24 hours', () => {
    expect(
      editRefusal({
        ...base,
        now: at(NOTE_EDIT_WINDOW_MS + 1),
      }),
    ).toBe('window-closed');
  });

  it('is the author only, and nobody once the author is erased', () => {
    expect(
      editRefusal({
        ...base,
        viewerId: 'b',
        now: at(1000),
      }),
    ).toBe('not-author');
    expect(
      editRefusal({
        ...base,
        authorId: null,
        now: at(1000),
      }),
    ).toBe('not-author');
  });

  it('refuses a deleted note and a note edited too often', () => {
    expect(
      editRefusal({
        ...base,
        deletedAt: at(10),
        now: at(1000),
      }),
    ).toBe('deleted');
    expect(
      editRefusal({
        ...base,
        editCount: MAX_NOTE_EDITS,
        now: at(1000),
      }),
    ).toBe('too-many-edits');
    expect(
      editRefusal({
        ...base,
        editCount: MAX_NOTE_EDITS - 1,
        now: at(1000),
      }),
    ).toBeNull();
  });

  it('reports when the window ends', () => {
    expect(editWindowEnds(created).toISOString()).toBe('2026-11-21T10:00:00.000Z');
  });
});

describe('pin limit', () => {
  it('allows three pinned notes and refuses the fourth', () => {
    expect(MAX_PINNED_NOTES).toBe(3);
    expect([0, 1, 2].map(canPinAnother)).toEqual([true, true, true]);
    expect(canPinAnother(3)).toBe(false);
  });
});

describe('splitNoteText', () => {
  it('returns plain text as one segment', () => {
    expect(splitNoteText('warned in DMs')).toEqual([
      {
        kind: 'text',
        text: 'warned in DMs',
      },
    ]);
  });

  it('detects http and https links and keeps trailing punctuation outside them', () => {
    expect(splitNoteText('see https://example.com/a?b=1, then (http://x.test/y).')).toEqual([
      {
        kind: 'text',
        text: 'see ',
      },
      {
        kind: 'link',
        text: 'https://example.com/a?b=1',
        href: 'https://example.com/a?b=1',
      },
      {
        kind: 'text',
        text: ', then (',
      },
      {
        kind: 'link',
        text: 'http://x.test/y',
        href: 'http://x.test/y',
      },
      {
        kind: 'text',
        text: ').',
      },
    ]);
  });

  it('never links other schemes', () => {
    const segments = splitNoteText('javascript:alert(1) and data:text/html,<b>x</b> and ftp://x');
    expect(segments.every((s) => s.kind === 'text')).toBe(true);
  });

  it('keeps every character of the input', () => {
    const text = 'a https://e.com/x b\nhttps://f.org.';
    expect(
      splitNoteText(text)
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});
