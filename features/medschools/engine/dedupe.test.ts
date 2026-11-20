import { createHmac } from 'node:crypto';
import {
  describe,
  it,
  expect,
} from 'vitest';
import { dedupeHash } from './dedupe';

const secret =
  's'.repeat(
    16,
  );

describe('dedupeHash', () => {
  it('is a 64-char hex HMAC of source:id that hides the id', () => {
    const h =
      dedupeHash(
        secret,
        'ADMIT',
        '12345',
      );
    expect(
      h,
    ).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      h,
    ).toBe(
      createHmac(
        'sha256',
        secret,
      )
        .update(
          'ADMIT:12345',
        )
        .digest(
          'hex',
        ),
    );
    expect(
      h,
    ).not.toContain(
      '12345',
    );
  });
  it('differs by source and by secret', () => {
    expect(
      dedupeHash(
        secret,
        'SDN',
        '12345',
      ),
    ).not.toBe(
      dedupeHash(
        secret,
        'ADMIT',
        '12345',
      ),
    );
    expect(
      dedupeHash(
        't'.repeat(
          16,
        ),
        'ADMIT',
        '12345',
      ),
    ).not.toBe(
      dedupeHash(
        secret,
        'ADMIT',
        '12345',
      ),
    );
  });
  it('rejects short secrets', () => {
    const msg =
      'MEDSCHOOLS_DEDUPE_SECRET must be at least 16 characters';
    expect(
      () =>
        dedupeHash(
          '',
          'ADMIT',
          '1',
        ),
    ).toThrow(
      msg,
    );
    expect(
      () =>
        dedupeHash(
          'x'.repeat(
            15,
          ),
          'ADMIT',
          '1',
        ),
    ).toThrow(
      msg,
    );
  });
});
