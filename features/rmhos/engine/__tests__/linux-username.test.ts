import {
  describe,
  expect,
  it,
} from 'vitest';
import { toLinuxUsername } from '../linux-username';

describe('toLinuxUsername', () => {
  it.each<
    [
      (
        | string
        | null
        | undefined
      ),
      string,
    ]
  >(
    [
      [
        'alice',
        'alice',
      ],
      [
        'Alice_99',
        'alice_99',
      ],
      [
        'Élan.Vital',
        'u_lan_vital',
      ],
      [
        '9lives',
        'u9lives',
      ],
      [
        '-dash',
        'u-dash',
      ],
      [
        'root',
        'rmh',
      ],
      [
        'nobody',
        'rmh',
      ],
      [
        '',
        'rmh',
      ],
      [
        null,
        'rmh',
      ],
      [
        undefined,
        'rmh',
      ],
      [
        'a'.repeat(
          60,
        ),
        'a'.repeat(
          31,
        ),
      ],
    ],
  )(
    '%s -> %s',
    (
      raw,
      out,
    ) =>
      expect(
        toLinuxUsername(
          raw,
        ),
      ).toBe(
        out,
      ),
  );

  it('always matches the useradd pattern', () =>
    [
      'x y',
      '日本',
      '__',
      'A-B',
    ].forEach(
      (
        s,
      ) =>
        expect(
          toLinuxUsername(
            s,
          ),
        ).toMatch(
          /^[a-z][a-z0-9_-]{0,30}$/,
        ),
    ));
});
