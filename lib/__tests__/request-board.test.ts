import { describe, it, expect } from 'vitest';
import {
  REQUEST_STATUSES,
  OFFICIAL_NOTE_MIN,
  OFFICIAL_NOTE_MAX,
  isRequestStatus,
  isVotable,
  statusRequiresNote,
  validateStatusNote,
  STATUS_ERROR_MESSAGE,
} from '@/lib/requests/status';
import { requestCreateSchema, requestUpdateSchema } from '@/lib/requests/schema';

/**
 * F22 — the request board.
 *
 * The rule that makes this feature work socially, rather than becoming another
 * place hope goes to die, is that `DECLINED` and `SHIPPED` REQUIRE an official
 * reply. Postgres cannot express a conditional NOT NULL, so the invariant lives
 * in code — which means it needs a test, or the next refactor deletes it.
 */

describe('request status vocabulary', () => {
  it('matches the RequestStatus enum in the schema', () => {
    expect([...REQUEST_STATUSES]).toEqual([
      'OPEN',
      'PLANNED',
      'IN_PROGRESS',
      'SHIPPED',
      'DECLINED',
    ]);
  });

  it('rejects anything that is not a status', () => {
    expect(isRequestStatus('OPEN')).toBe(true);
    expect(isRequestStatus('open')).toBe(false);
    expect(isRequestStatus('WONTFIX')).toBe(false);
  });
});

describe('the official-reply invariant', () => {
  it('requires a note for exactly the two closing statuses', () => {
    expect(statusRequiresNote('SHIPPED')).toBe(true);
    expect(statusRequiresNote('DECLINED')).toBe(true);
    expect(statusRequiresNote('OPEN')).toBe(false);
    expect(statusRequiresNote('PLANNED')).toBe(false);
    expect(statusRequiresNote('IN_PROGRESS')).toBe(false);
  });

  it('refuses DECLINED with no note', () => {
    expect(validateStatusNote('DECLINED', null)).toBe('NOTE_REQUIRED');
    expect(validateStatusNote('DECLINED', undefined)).toBe('NOTE_REQUIRED');
    expect(validateStatusNote('DECLINED', '')).toBe('NOTE_REQUIRED');
  });

  it('refuses SHIPPED with no note', () => {
    expect(validateStatusNote('SHIPPED', null)).toBe('NOTE_REQUIRED');
  });

  it('treats a whitespace-only note as no note', () => {
    // "   " would satisfy a naive `note != null` check and render as an empty
    // reply — the exact failure this rule exists to prevent.
    expect(validateStatusNote('DECLINED', '     ')).toBe('NOTE_REQUIRED');
    expect(validateStatusNote('DECLINED', '\n\t ')).toBe('NOTE_REQUIRED');
  });

  it('refuses a note too thin to be a reply', () => {
    expect(validateStatusNote('DECLINED', 'no')).toBe('NOTE_TOO_SHORT');
    expect(validateStatusNote('DECLINED', 'a'.repeat(OFFICIAL_NOTE_MIN - 1))).toBe(
      'NOTE_TOO_SHORT',
    );
  });

  it('accepts a real reply', () => {
    expect(validateStatusNote('DECLINED', 'Out of scope for this year; see the roadmap.')).toBe(
      null,
    );
    expect(validateStatusNote('SHIPPED', 'Landed in the 2026-08 release.')).toBe(null);
  });

  it('allows the open statuses with or without a note', () => {
    for (const status of ['OPEN', 'PLANNED', 'IN_PROGRESS'] as const) {
      expect(validateStatusNote(status, null)).toBe(null);
      expect(validateStatusNote(status, 'We are looking at this.')).toBe(null);
    }
  });

  it('caps the note length on every status', () => {
    const tooLong = 'x'.repeat(OFFICIAL_NOTE_MAX + 1);
    expect(validateStatusNote('OPEN', tooLong)).toBe('NOTE_TOO_LONG');
    expect(validateStatusNote('SHIPPED', tooLong)).toBe('NOTE_TOO_LONG');
  });

  it('has a message for every failure mode', () => {
    for (const code of ['NOTE_REQUIRED', 'NOTE_TOO_SHORT', 'NOTE_TOO_LONG'] as const) {
      expect(STATUS_ERROR_MESSAGE[code]).toBeTruthy();
    }
  });
});

describe('votability', () => {
  it('keeps open requests votable', () => {
    for (const status of ['OPEN', 'PLANNED', 'IN_PROGRESS'] as const) {
      expect(isVotable({ status, mergedIntoId: null })).toBe(true);
    }
  });

  it('closes voting once a request is resolved', () => {
    expect(isVotable({ status: 'SHIPPED', mergedIntoId: null })).toBe(false);
    expect(isVotable({ status: 'DECLINED', mergedIntoId: null })).toBe(false);
  });

  it('never accepts a vote on a duplicate — votes follow the merge target', () => {
    expect(isVotable({ status: 'OPEN', mergedIntoId: 'req_other' })).toBe(false);
  });
});

describe('wire schemas', () => {
  it('rejects a title or body that says nothing', () => {
    expect(requestCreateSchema.safeParse({ title: 'hi', body: 'please' }).success).toBe(false);
    expect(
      requestCreateSchema.safeParse({
        title: 'Add ranked-choice polls',
        body: 'Plurality gives the wrong answer for "which game next season".',
      }).success,
    ).toBe(true);
  });

  it('refuses an update that changes nothing', () => {
    expect(requestUpdateSchema.safeParse({}).success).toBe(false);
    expect(requestUpdateSchema.safeParse({ status: 'PLANNED' }).success).toBe(true);
    expect(requestUpdateSchema.safeParse({ officialNote: null }).success).toBe(true);
  });

  it('refuses an unknown status', () => {
    expect(requestUpdateSchema.safeParse({ status: 'WONTFIX' }).success).toBe(false);
  });
});
