import { describe, expect, it } from 'vitest';
import {
  DELETED_BY_MODERATOR,
  DELETED_BY_SENDER,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_MAX_LENGTH,
  canEdit,
  editEligibility,
  editWindowRemainingMs,
  refusalStatus,
  unsendEligibility,
  validateEditedBody,
} from '@/lib/messages/edit-policy';
import {
  applyHides,
  conversationPreview,
  isVoiceMessage,
  toMessageView,
  type StoredMessage,
} from '@/lib/messages/message-view';

/**
 * H1 — edit, unsend and delete for direct messages.
 *
 * These cover the two things the feature is actually about: who may change what
 * and for how long (the policy), and what a viewer is allowed to see afterwards
 * (the tombstone rules). Both are pure, both are what the API route calls, and
 * both are the difference between "unsend" and "a way to erase evidence".
 */

const SENDER = 'user-sender';
const RECIPIENT = 'user-recipient';
const NOW = Date.UTC(2026, 7, 4, 12, 0, 0);

function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'msg-1',
    senderId: SENDER,
    content: 'hello there',
    read: false,
    createdAt: new Date(NOW - 60_000),
    gifUrl: null,
    imageUrls: [],
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    audioUrl: null,
    audioDurationMs: null,
    audioPeaks: [],
    reactions: [{ emoji: '👍', userId: RECIPIENT }],
    ...overrides,
  };
}

describe('edit window', () => {
  it('lets the sender edit inside the window', () => {
    expect(editEligibility(message(), SENDER, NOW)).toEqual({ ok: true });
    expect(canEdit(message(), SENDER, NOW)).toBe(true);
  });

  it('refuses anyone who is not the sender, no matter how fresh', () => {
    const result = editEligibility(message({ createdAt: new Date(NOW) }), RECIPIENT, NOW);
    expect(result).toEqual({ ok: false, reason: 'not-sender' });
    expect(refusalStatus('not-sender')).toBe(403);
  });

  it('refuses the sender once 15 minutes have passed', () => {
    const stale = message({ createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS - 1) });
    expect(editEligibility(stale, SENDER, NOW)).toEqual({ ok: false, reason: 'window-expired' });
  });

  it('treats the boundary itself as closed', () => {
    // Exactly at the window: remaining is 0, so the answer must be "no". An
    // inclusive boundary here would mean the server and a client whose clock is
    // a millisecond ahead disagree about whether the action exists.
    const boundary = message({ createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS) });
    expect(editWindowRemainingMs(boundary.createdAt, NOW)).toBe(0);
    expect(editEligibility(boundary, SENDER, NOW)).toEqual({ ok: false, reason: 'window-expired' });
  });

  it('reports the remaining time, clamped at zero', () => {
    expect(editWindowRemainingMs(new Date(NOW - 60_000), NOW)).toBe(
      MESSAGE_EDIT_WINDOW_MS - 60_000,
    );
    expect(editWindowRemainingMs(new Date(NOW - 10 * MESSAGE_EDIT_WINDOW_MS), NOW)).toBe(0);
  });

  it('refuses to edit a tombstone', () => {
    const gone = message({ deletedAt: new Date(NOW - 1_000) });
    expect(editEligibility(gone, SENDER, NOW)).toEqual({ ok: false, reason: 'deleted' });
    expect(refusalStatus('deleted')).toBe(409);
  });

  it('accepts an ISO string createdAt as well as a Date', () => {
    const iso = message({ createdAt: new Date(NOW - 1000).toISOString() });
    expect(canEdit(iso, SENDER, NOW)).toBe(true);
  });
});

describe('edited body validation', () => {
  it('rejects an edit that empties a text-only message', () => {
    expect(validateEditedBody({ content: '   ' }, { content: 'hello' })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('allows clearing the note on a voice message — the audio is still there', () => {
    expect(
      validateEditedBody(
        { content: '', audioUrl: '/api/messages/voice/c1_9.webm' },
        { content: 'my note' },
      ),
    ).toEqual({ ok: true });
  });

  it('allows clearing the text of a message that still has images', () => {
    expect(
      validateEditedBody({ content: '', imageUrls: ['/x.webp'] }, { content: 'caption' }),
    ).toEqual({ ok: true });
  });

  it('rejects an unchanged edit rather than burning a write', () => {
    expect(validateEditedBody({ content: '  hello  ' }, { content: 'hello' })).toEqual({
      ok: false,
      reason: 'unchanged',
    });
  });

  it('rejects text over the column width', () => {
    expect(
      validateEditedBody({ content: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) }, { content: 'hello' }),
    ).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('unsend', () => {
  it('is sender-only', () => {
    expect(unsendEligibility(message(), SENDER)).toEqual({ ok: true });
    expect(unsendEligibility(message(), RECIPIENT)).toEqual({ ok: false, reason: 'not-sender' });
  });

  it('has no time limit', () => {
    const ancient = message({ createdAt: new Date(NOW - 400 * 24 * 60 * 60_000) });
    expect(unsendEligibility(ancient, SENDER)).toEqual({ ok: true });
  });

  it('refuses to re-unsend an existing tombstone', () => {
    expect(unsendEligibility(message({ deletedAt: new Date(NOW) }), SENDER)).toEqual({
      ok: false,
      reason: 'deleted',
    });
  });
});

describe('tombstone rendering rules', () => {
  const unsent = message({
    content: 'my card number is 4111 1111 1111 1111',
    gifUrl: 'https://media.example/x.gif',
    imageUrls: ['/api/feed/image/a.webp'],
    audioUrl: '/api/messages/voice/c1_9.webm',
    audioDurationMs: 4200,
    audioPeaks: [0.2, 0.9],
    deletedAt: new Date(NOW),
    deletedBy: DELETED_BY_SENDER,
  });

  it('strips every trace of the content for a participant', () => {
    const view = toMessageView(unsent);
    expect(view.content).toBe('');
    expect(view.gifUrl).toBeNull();
    expect(view.imageUrls).toEqual([]);
    expect(view.audioUrl).toBeNull();
    expect(view.audioDurationMs).toBeNull();
    // The waveform alone still describes the rhythm of what was said.
    expect(view.audioPeaks).toEqual([]);
    expect(view.reactions).toEqual([]);
  });

  it('keeps the fact of the message — id, sender, timestamps, who deleted it', () => {
    const view = toMessageView(unsent);
    expect(view.id).toBe('msg-1');
    expect(view.senderId).toBe(SENDER);
    expect(view.deletedAt).toBe(new Date(NOW).toISOString());
    expect(view.deletedBy).toBe(DELETED_BY_SENDER);
    expect(view.createdAt).toBe(new Date(NOW - 60_000).toISOString());
  });

  it('keeps the content for a moderator, so a report survives the unsend', () => {
    const view = toMessageView(unsent, { forModerator: true });
    expect(view.content).toBe('my card number is 4111 1111 1111 1111');
    expect(view.audioUrl).toBe('/api/messages/voice/c1_9.webm');
    // Still flagged as deleted — the moderator sees the state, not a normal row.
    expect(view.deletedAt).toBe(new Date(NOW).toISOString());
  });

  it('defaults deletedBy to the sender when the column is empty (pre-backfill rows)', () => {
    const view = toMessageView(message({ deletedAt: new Date(NOW), deletedBy: null }));
    expect(view.deletedBy).toBe(DELETED_BY_SENDER);
  });

  it('leaves a live message completely alone', () => {
    const view = toMessageView(message({ editedAt: new Date(NOW) }));
    expect(view.content).toBe('hello there');
    expect(view.editedAt).toBe(new Date(NOW).toISOString());
    expect(view.deletedAt).toBeNull();
    expect(view.reactions).toHaveLength(1);
  });

  it('recognises a voice message before, and not after, an unsend', () => {
    expect(isVoiceMessage(toMessageView(message({ audioUrl: '/a.webm' })))).toBe(true);
    expect(isVoiceMessage(toMessageView(unsent))).toBe(false);
  });
});

describe('conversation-list preview', () => {
  it('is the tombstone kind for an unsent message, with no text', () => {
    expect(conversationPreview(message({ content: 'secret', deletedAt: new Date(NOW) }))).toEqual({
      kind: 'deleted',
      text: '',
    });
  });

  it('reports a voice note as voice, carrying the sender note if there is one', () => {
    expect(conversationPreview(message({ content: 'about tonight', audioUrl: '/a.webm' }))).toEqual(
      {
        kind: 'voice',
        text: 'about tonight',
      },
    );
  });

  it('falls back through image and gif when there is no text', () => {
    expect(conversationPreview(message({ content: '', imageUrls: ['/a.webp'] })).kind).toBe(
      'image',
    );
    expect(conversationPreview(message({ content: '', gifUrl: 'https://x/y.gif' })).kind).toBe(
      'gif',
    );
    expect(conversationPreview(message({ content: '   ' })).kind).toBe('empty');
  });

  it('never returns a translated sentence — only a kind and the raw text', () => {
    // The preview label ("Voice message", "This message was deleted") is a
    // translated string; returning one here would ship English to every locale.
    const preview = conversationPreview(message({ deletedAt: new Date(NOW) }));
    expect(Object.keys(preview).sort()).toEqual(['kind', 'text']);
  });
});

describe('delete for me', () => {
  it('removes only the viewer’s hidden rows', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(applyHides(rows, ['b'])).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('is a no-op when nothing is hidden (and returns the same array)', () => {
    const rows = [{ id: 'a' }];
    expect(applyHides(rows, [])).toBe(rows);
  });

  it('does not touch the shared row, so the other side is unaffected', () => {
    // A hide is a separate table keyed (messageId, userId); the message itself
    // still projects normally for anyone who has not hidden it.
    const row = message();
    expect(applyHides([row], ['msg-1'])).toEqual([]);
    expect(toMessageView(row).content).toBe('hello there');
  });
});

describe('moderator tombstones', () => {
  it('renders differently from a sender unsend', () => {
    const view = toMessageView(
      message({ deletedAt: new Date(NOW), deletedBy: DELETED_BY_MODERATOR }),
    );
    expect(view.deletedBy).toBe(DELETED_BY_MODERATOR);
    expect(view.content).toBe('');
  });
});
