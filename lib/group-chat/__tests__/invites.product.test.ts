import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  codeFromBytes,
  expiryDate,
  invitePath,
  isInviteCode,
  isInviteLive,
  maskCode,
} from '@/lib/group-chat/invites';
import { createInviteBody } from '@/lib/group-chat/invites-schema';

const NOW =
  new Date(
    '2026-11-26T12:00:00Z',
  );
const live =
  {
    maxUses: 10,
    uses: 0,
    expiresAt:
      null,
    revokedAt:
      null,
  };

describe('code alphabet', () => {
  it('is base58: 58 distinct characters, none of 0 O I l', () => {
    expect(
      INVITE_ALPHABET,
    ).toHaveLength(
      58,
    );
    expect(
      new Set(
        INVITE_ALPHABET,
      )
        .size,
    ).toBe(
      58,
    );
    for (const c of '0OIl')
      expect(
        INVITE_ALPHABET,
      ).not.toContain(
        c,
      );
  });

  it('makes a code of exactly 10 characters, all from the alphabet', () => {
    const code =
      codeFromBytes(
        Uint8Array.from(
          {
            length: 32,
          },
          (
            _,
            i,
          ) =>
            i *
            7,
        ),
      );
    expect(
      code,
    ).toHaveLength(
      INVITE_CODE_LENGTH,
    );
    expect(
      [
        ...code!,
      ].every(
        (
          c,
        ) =>
          INVITE_ALPHABET.includes(
            c,
          ),
      ),
    ).toBe(
      true,
    );
    expect(
      isInviteCode(
        code!,
      ),
    ).toBe(
      true,
    );
  });

  it('skips biased bytes and gives up (null) when too few are usable', () => {
    expect(
      codeFromBytes(
        new Uint8Array(
          32,
        ).fill(
          255,
        ),
      ),
    ).toBeNull();
    expect(
      codeFromBytes(
        Uint8Array.from(
          [
            0,
            1,
            2,
          ],
        ),
      ),
    ).toBeNull();
  });

  it('only accepts well-shaped codes', () => {
    expect(
      isInviteCode(
        'abc',
      ),
    ).toBe(
      false,
    );
    expect(
      isInviteCode(
        '0000000000',
      ),
    ).toBe(
      false,
    );
    expect(
      isInviteCode(
        '123456789A',
      ),
    ).toBe(
      true,
    );
    expect(
      isInviteCode(
        '123456789AB',
      ),
    ).toBe(
      false,
    );
  });
});

describe('validity at the boundaries', () => {
  it('is live with room left, not expired and not revoked', () => {
    expect(
      isInviteLive(
        live,
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      isInviteLive(
        {
          ...live,
          maxUses:
            null,
          uses: 9999,
        },
        NOW,
      ),
    ).toBe(
      true,
    );
  });
  it('is dead exactly at its expiry, alive a millisecond before', () => {
    expect(
      isInviteLive(
        {
          ...live,
          expiresAt:
            new Date(
              NOW.getTime() +
                1,
            ),
        },
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      isInviteLive(
        {
          ...live,
          expiresAt:
            NOW,
        },
        NOW,
      ),
    ).toBe(
      false,
    );
  });
  it('is dead once uses reach maxUses, alive one before', () => {
    expect(
      isInviteLive(
        {
          ...live,
          uses: 9,
        },
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      isInviteLive(
        {
          ...live,
          uses: 10,
        },
        NOW,
      ),
    ).toBe(
      false,
    );
  });
  it('is dead when revoked', () => {
    expect(
      isInviteLive(
        {
          ...live,
          revokedAt:
            NOW,
        },
        NOW,
      ),
    ).toBe(
      false,
    );
  });
  it('computes expiry from the chosen days, null for never', () => {
    expect(
      expiryDate(
        7,
        NOW,
      )!.toISOString(),
    ).toBe(
      '2026-12-03T12:00:00.000Z',
    );
    expect(
      expiryDate(
        null,
        NOW,
      ),
    ).toBeNull();
  });
});

describe('masking and paths', () => {
  it('shows only the last 4 characters', () => {
    expect(
      maskCode(
        '123456789A',
      ),
    ).toBe(
      '••••••789A',
    );
    expect(
      maskCode(
        '123456789A',
      ),
    ).toHaveLength(
      10,
    );
    expect(
      maskCode(
        '123456789A',
      ).endsWith(
        '789A',
      ),
    ).toBe(
      true,
    );
    expect(
      maskCode(
        '123456789A',
      ),
    ).not.toContain(
      '1',
    );
  });
  it('builds the page path', () => {
    expect(
      invitePath(
        'abc',
      ),
    ).toBe(
      '/groups/join/abc',
    );
  });
});

describe('create body', () => {
  it('accepts only the offered expiries and use limits', () => {
    expect(
      createInviteBody.safeParse(
        {
          expiresInDays: 7,
          maxUses: 10,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      createInviteBody.safeParse(
        {
          expiresInDays:
            null,
          maxUses:
            null,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      createInviteBody.safeParse(
        {
          expiresInDays: 2,
          maxUses: 10,
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createInviteBody.safeParse(
        {
          expiresInDays: 7,
          maxUses: 1000,
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});
