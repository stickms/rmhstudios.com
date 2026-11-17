import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  checkAllowlist,
  hasFix,
  judge,
  parseAudit,
  type Advisory,
} from './audit-policy';

const advisory =
  (
    over: Partial<Advisory> = {},
  ): Advisory => ({
    ghsa: 'GHSA-aaaa-bbbb-cccc',
    module:
      'pkg',
    severity:
      'high',
    title:
      'ReDoS',
    vulnerable:
      '<=1.0.0',
    patched:
      '>=1.0.1',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
    paths:
      [
        '.>pkg',
      ],
    ...over,
  });
const kinds =
  (
    verdicts: ReturnType<
      typeof judge
    >,
  ) =>
    verdicts.map(
      (
        v,
      ) =>
        v.kind,
    );

describe('production dependency audit policy', () => {
  it('blocks a high or critical advisory that has a fix', () => {
    expect(
      kinds(
        judge(
          [
            advisory(),
            advisory(
              {
                severity:
                  'critical',
              },
            ),
          ],
          [],
          '2026-11-17',
        ),
      ),
    ).toEqual(
      [
        'block',
        'block',
      ],
    );
  });

  it('warns, without blocking, when no fixed version exists (the 2026-11-17 picomatch case)', () => {
    expect(
      hasFix(
        '<0.0.0',
      ),
    ).toBe(
      false,
    );
    expect(
      hasFix(
        '',
      ),
    ).toBe(
      false,
    );
    expect(
      kinds(
        judge(
          [
            advisory(
              {
                patched:
                  '<0.0.0',
              },
            ),
          ],
          [],
          '2026-11-17',
        ),
      ),
    ).toEqual(
      [
        'warn',
      ],
    );
  });

  it('ignores moderate and low', () => {
    expect(
      judge(
        [
          advisory(
            {
              severity:
                'moderate',
            },
          ),
          advisory(
            {
              severity:
                'low',
            },
          ),
        ],
        [],
        '2026-11-17',
      ),
    ).toEqual(
      [],
    );
  });

  it('honours an allowlist entry until it expires, then blocks again', () => {
    const allow =
      [
        {
          ghsa: 'GHSA-aaaa-bbbb-cccc',
          reason:
            'only reachable from build tooling',
          expires:
            '2026-12-01',
        },
      ];
    expect(
      kinds(
        judge(
          [
            advisory(),
          ],
          allow,
          '2026-12-01',
        ),
      ),
    ).toEqual(
      [
        'warn',
      ],
    );
    expect(
      kinds(
        judge(
          [
            advisory(),
          ],
          allow,
          '2026-12-02',
        ),
      ),
    ).toEqual(
      [
        'block',
      ],
    );
  });

  it('rejects an allowlist entry without a real reason or expiry', () => {
    expect(
      () =>
        checkAllowlist(
          [
            {
              ghsa: 'GHSA-aaaa-bbbb-cccc',
              reason:
                'fine',
              expires:
                '2026-12-01',
            },
          ],
        ),
    ).toThrow();
    expect(
      () =>
        checkAllowlist(
          [
            {
              ghsa: 'GHSA-aaaa-bbbb-cccc',
              reason:
                'only reachable from build tooling',
            },
          ],
        ),
    ).toThrow();
    expect(
      () =>
        checkAllowlist(
          {},
        ),
    ).toThrow();
  });

  it('reads the pnpm audit report, and refuses one without advisories', () => {
    const parsed =
      parseAudit(
        {
          advisories:
            {
              '1': {
                github_advisory_id:
                  'GHSA-fc5q-39xc-vjpf',
                module_name:
                  'picomatch',
                severity:
                  'high',
                title:
                  'picomatch vulnerable to ReDoS',
                vulnerable_versions:
                  '<=4.0.7',
                patched_versions:
                  '<0.0.0',
                url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
                findings:
                  [
                    {
                      version:
                        '4.0.7',
                      paths:
                        [
                          '.>@tanstack/react-start>picomatch',
                        ],
                    },
                  ],
              },
            },
        },
      );
    expect(
      parsed[0],
    ).toMatchObject(
      {
        ghsa: 'GHSA-fc5q-39xc-vjpf',
        patched:
          '<0.0.0',
        paths:
          [
            '.>@tanstack/react-start>picomatch',
          ],
      },
    );
    expect(
      () =>
        parseAudit(
          {
            error:
              'registry down',
          },
        ),
    ).toThrow();
  });
});
