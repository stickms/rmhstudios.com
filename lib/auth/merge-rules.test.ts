/**
 * Auth (docs/testing.md criterion): these rules decide whether one account's
 * sign-in methods may be moved into another. A regression is an account
 * takeover, so every refusal is pinned.
 */
import { describe, expect, it } from 'vitest';
import {
  MERGE_INTENT_TTL_MS,
  checkMergeConfirm,
  isFreshSession,
  mergeEligibility,
  movableProviderIds,
  parseMergeIntent,
  type MergeIntent,
} from './merge-rules';
import { FRESH_SESSION_MS } from './providers';

const NOW = 1_800_000_000_000;
const intent: MergeIntent = {
  fromUserId: 'user_b',
  createdAt: NOW - 60_000,
  expiresAt: NOW - 60_000 + MERGE_INTENT_TTL_MS,
};

describe('mergeEligibility', () => {
  it('offers the merge to an empty account that signs in with a provider', () => {
    expect(
      mergeEligibility(
        [
          {
            providerId: 'steam',
          },
        ],
        [],
      ),
    ).toEqual({
      eligible: true,
      methods: ['steam'],
    });
  });

  it('never moves a password: an email-only account is not offered the merge', () => {
    expect(
      mergeEligibility(
        [
          {
            providerId: 'credential',
          },
        ],
        [],
      ),
    ).toEqual({
      eligible: false,
      reason: 'no_movable_method',
    });
    expect(
      movableProviderIds([
        {
          providerId: 'credential',
        },
        {
          providerId: 'discord',
        },
      ]),
    ).toEqual(['discord']);
  });

  it('refuses an account with history', () => {
    expect(
      mergeEligibility(
        [
          {
            providerId: 'steam',
          },
        ],
        ['rmhark'],
      ),
    ).toEqual({
      eligible: false,
      reason: 'has_history',
    });
  });

  it('fails closed when the history check did not finish', () => {
    expect(
      mergeEligibility(
        [
          {
            providerId: 'steam',
          },
        ],
        null,
      ),
    ).toEqual({
      eligible: false,
      reason: 'history_unknown',
    });
  });
});

describe('checkMergeConfirm', () => {
  const base = {
    intent,
    targetUserId: 'user_a',
    targetSessionCreatedAt: NOW - 30_000,
    now: NOW,
  };

  it('accepts a sign-in to another account made after the merge started', () => {
    expect(checkMergeConfirm(base)).toEqual({
      ok: true,
    });
  });

  it('refuses without an intent in this browser', () => {
    expect(
      checkMergeConfirm({
        ...base,
        intent: null,
      }),
    ).toEqual({
      ok: false,
      error: 'no_intent',
    });
  });

  it('refuses an expired intent', () => {
    expect(
      checkMergeConfirm({
        ...base,
        now: intent.expiresAt,
      }),
    ).toEqual({
      ok: false,
      error: 'expired',
    });
  });

  it('refuses merging an account into itself', () => {
    expect(
      checkMergeConfirm({
        ...base,
        targetUserId: 'user_b',
      }),
    ).toEqual({
      ok: false,
      error: 'same_account',
    });
  });

  it('refuses a session that already existed when the merge started', () => {
    expect(
      checkMergeConfirm({
        ...base,
        targetSessionCreatedAt: intent.createdAt - 1,
      }),
    ).toEqual({
      ok: false,
      error: 'stale_sign_in',
    });
  });

  it('refuses a sign-in older than the recent-sign-in window', () => {
    const late = intent.createdAt + 1;
    expect(
      checkMergeConfirm({
        intent: {
          ...intent,
          expiresAt: late + FRESH_SESSION_MS + 10,
        },
        targetUserId: 'user_a',
        targetSessionCreatedAt: late,
        now: late + FRESH_SESSION_MS + 1,
      }),
    ).toEqual({
      ok: false,
      error: 'stale_sign_in',
    });
  });
});

describe('parseMergeIntent', () => {
  it('reads back what was stored', () => {
    expect(parseMergeIntent(JSON.stringify(intent))).toEqual(intent);
  });

  it.each([
    ['not JSON', 'nope'],
    [
      'an empty id',
      JSON.stringify({
        ...intent,
        fromUserId: '',
      }),
    ],
    [
      'a missing expiry',
      JSON.stringify({
        fromUserId: 'b',
        createdAt: 1,
      }),
    ],
    [
      'a string timestamp',
      JSON.stringify({
        ...intent,
        createdAt: '1',
      }),
    ],
  ])('refuses %s', (_label, value) => {
    expect(parseMergeIntent(value)).toBeNull();
  });
});

describe('isFreshSession', () => {
  it('is fresh up to the window and stale after it', () => {
    expect(isFreshSession(NOW - FRESH_SESSION_MS, NOW)).toBe(true);
    expect(isFreshSession(NOW - FRESH_SESSION_MS - 1, NOW)).toBe(false);
  });
});
