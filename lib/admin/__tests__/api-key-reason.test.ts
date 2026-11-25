/**
 * The reserved suspension reason (the deletion hold's own text) is refused with its own code, so the admin reads why
 * instead of "Invalid input". The route-level answer is held in `api-keys.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DELETION_REQUESTED } from '@/lib/account/deletion-hold';
import { apiKeyPatchBody, isReservedSuspendReason } from '@/lib/admin/api-keys-schema';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { readRefusal } from '@/lib/errors/refusal';

describe('API_KEY_REASON_RESERVED', () => {
  it('is a 400 with its English sentence and its errors key', () => {
    expect(ERROR_CODES.API_KEY_REASON_RESERVED).toEqual({
      http: 400,
      i18n: 'errors:apiKeyReasonReserved',
      text: 'That reason is reserved; write another one',
    });
    expect(refusalBody('API_KEY_REASON_RESERVED')).toEqual({
      error: 'That reason is reserved; write another one',
      code: 'API_KEY_REASON_RESERVED',
    });
  });

  it('is read back from the body the route writes', () => {
    expect(readRefusal(refusalBody('API_KEY_REASON_RESERVED'))?.code).toBe('API_KEY_REASON_RESERVED');
  });
});

describe('isReservedSuspendReason', () => {
  it('matches the hold’s text trimmed and in any case, and nothing else', () => {
    expect(isReservedSuspendReason(DELETION_REQUESTED)).toBe(true);
    expect(isReservedSuspendReason(`  ${DELETION_REQUESTED.toUpperCase()}  `)).toBe(true);
    expect(isReservedSuspendReason('scraping every profile')).toBe(false);
  });

  it('is no longer a zod refinement: the body parses and the route answers with the code', () => {
    expect(apiKeyPatchBody.safeParse({ suspend: { reason: DELETION_REQUESTED } }).success).toBe(true);
  });
});
