/** s06-01 — the UI reads a ban or timeout refusal from its machine `code` and `endsAt`, never the server's English. */
import { describe, expect, it } from 'vitest';
import { HttpError } from '@/lib/http';
import { sanctionRefusal } from '../useSanctionRefusal';

describe('sanctionRefusal', () => {
  it('reads the code and end off a parsed body', () => {
    expect(
      sanctionRefusal({
        error: 'You are banned…',
        code: 'community_banned',
        endsAt: '2026-12-01T14:30:00.000Z',
      }),
    ).toEqual({
      code: 'community_banned',
      endsAt: new Date('2026-12-01T14:30:00.000Z'),
    });
    expect(
      sanctionRefusal({
        code: 'community_timed_out',
        endsAt: null,
      }),
    ).toEqual({
      code: 'community_timed_out',
      endsAt: null,
    });
  });

  it('reads an HttpError body', () => {
    const err = new HttpError(403, 'English text', undefined, {
      body: {
        code: 'community_timed_out',
        endsAt: '2026-12-01T14:30:00.000Z',
      },
    });
    expect(sanctionRefusal(err)?.code).toBe('community_timed_out');
  });

  it('is null for any other refusal, and drops an unreadable date', () => {
    expect(
      sanctionRefusal({
        code: 'flair_required',
        error: 'Choose a flair',
      }),
    ).toBeNull();
    expect(sanctionRefusal(null)).toBeNull();
    expect(sanctionRefusal(new Error('x'))).toBeNull();
    expect(
      sanctionRefusal({
        code: 'community_banned',
        endsAt: 'not a date',
      }),
    ).toEqual({
      code: 'community_banned',
      endsAt: null,
    });
  });
});
