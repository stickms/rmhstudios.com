import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PREPAINT_BODY_SHA256,
  PREPAINT_SHA256,
} from '../../prepaint/generated';
import {
  prepaintHeadScripts,
  PREPAINT_BODY_SCRIPT,
} from '../../prepaint/config';
import {
  buildCspPolicy,
  CSP_REPORT_PATH,
  isValidNonce,
  REPORTING_ENDPOINTS,
} from '../policy.server';
import { generateNonce } from '../nonce.server';

const NONCE =
  'dGVzdC1ub25jZS0xMjM0NQ==';
const directive =
  (
    policy: string,
    name: string,
  ) =>
    policy
      .split(
        '; ',
      )
      .find(
        (
          d,
        ) =>
          d.startsWith(
            `${name} `,
          ),
      ) ??
    '';

describe('buildCspPolicy', () => {
  const policy =
    buildCspPolicy(
      {
        nonce:
          NONCE,
      },
    );
  const script =
    directive(
      policy,
      'script-src',
    );

  it('carries the per-request nonce and strict-dynamic', () => {
    expect(
      script,
    ).toContain(
      `'nonce-${NONCE}'`,
    );
    expect(
      script,
    ).toContain(
      "'strict-dynamic'",
    );
  });

  it('carries the static hashes of the generated pre-paint scripts', () => {
    expect(
      script,
    ).toContain(
      `'sha256-${PREPAINT_SHA256}'`,
    );
    expect(
      script,
    ).toContain(
      `'sha256-${PREPAINT_BODY_SHA256}'`,
    );
  });

  it('allows neither unsafe-eval nor unsafe-inline in script-src', () => {
    expect(
      policy,
    ).not.toContain(
      "'unsafe-eval'",
    );
    expect(
      script,
    ).not.toContain(
      'unsafe-inline',
    );
  });

  it('keeps the CSP2 fallback hosts and wasm', () => {
    expect(
      script,
    ).toContain(
      "'self'",
    );
    expect(
      script,
    ).toContain(
      "'wasm-unsafe-eval'",
    );
    expect(
      script,
    ).toContain(
      'https://pagead2.googlesyndication.com',
    );
  });

  it('reports violations', () => {
    expect(
      policy,
    ).toContain(
      `report-uri ${CSP_REPORT_PATH}`,
    );
    expect(
      policy,
    ).toContain(
      'report-to csp',
    );
    expect(
      REPORTING_ENDPOINTS,
    ).toBe(
      `csp="${CSP_REPORT_PATH}"`,
    );
  });

  it('omits nonce and strict-dynamic when there is no (valid) nonce, never injecting', () => {
    for (const bad of [
      undefined,
      null,
      '',
      "x'; script-src *",
      'short',
    ]) {
      const s =
        directive(
          buildCspPolicy(
            {
              nonce:
                bad as
                  | string
                  | undefined,
            },
          ),
          'script-src',
        );
      expect(
        s,
      ).not.toContain(
        'nonce-',
      );
      expect(
        s,
      ).not.toContain(
        'strict-dynamic',
      );
      expect(
        s,
      ).toContain(
        `'sha256-${PREPAINT_SHA256}'`,
      );
    }
  });

  it('mints valid, unique nonces', () => {
    const a =
      generateNonce();
    expect(
      isValidNonce(
        a,
      ),
    ).toBe(
      true,
    );
    expect(
      generateNonce(),
    ).not.toBe(
      a,
    );
  });

  it('matches the enforced Apache policy outside script-src (so the switch blocks nothing new)', () => {
    const conf =
      readFileSync(
        join(
          __dirname,
          '../../../deploy/apache/rmhstudios.conf',
        ),
        'utf8',
      );
    const apache =
      conf.match(
        /Content-Security-Policy "([^"]+)"/,
      )?.[1] ??
      '';
    const strip =
      (
        p: string,
      ) =>
        p
          .split(
            '; ',
          )
          .filter(
            (
              d,
            ) =>
              !/^(script-src|report-uri|report-to) /.test(
                d,
              ),
          )
          .join(
            '; ',
          );
    expect(
      strip(
        policy,
      ),
    ).toBe(
      strip(
        apache,
      ),
    );
  });
});

describe('every inline executable script is nonced or hashed', () => {
  it('the head scripts are the hashed code plus a non-executed JSON data block', () => {
    const [
      data,
      code,
    ] =
      prepaintHeadScripts(
        {},
      );
    expect(
      data.type,
    ).toBe(
      'application/json',
    );
    expect(
      code.children,
    ).toBeTruthy();
    // The router adds `nonce` to every head script; the hash is the static backstop.
    expect(
      buildCspPolicy(
        {
          nonce:
            NONCE,
        },
      ),
    ).toContain(
      `'sha256-${PREPAINT_SHA256}'`,
    );
    expect(
      PREPAINT_BODY_SCRIPT,
    ).toBeTruthy();
  });

  it('__root.tsx puts the nonce on its one inline <script>', () => {
    const src =
      readFileSync(
        join(
          __dirname,
          '../../../app/routes/__root.tsx',
        ),
        'utf8',
      );
    const tags =
      [
        ...src.matchAll(
          /<script\b[^>]*?(?:\/>|>)/gs,
        ),
      ].map(
        (
          m,
        ) =>
          m[0],
      );
    expect(
      tags.length,
    ).toBeGreaterThan(
      0,
    );
    for (const tag of tags)
      expect(
        tag,
      ).toMatch(
        /nonce=\{nonce\}/,
      );
    expect(
      src,
    ).toContain(
      'useRouter().options.ssr?.nonce',
    );
  });

  it('the router is given the nonce (ssr.nonce) in getRouter()', () => {
    const src =
      readFileSync(
        join(
          __dirname,
          '../../../app/router.tsx',
        ),
        'utf8',
      );
    expect(
      src,
    ).toMatch(
      /ssr:\s*\{\s*nonce\s*\}/,
    );
  });

  it('no other app/ or components/ source renders an inline <script> element', () => {
    const offenders: string[] =
      [];
    const walk =
      (
        dir: string,
      ) => {
        for (const name of readdirSync(
          dir,
        )) {
          const p =
            join(
              dir,
              name,
            );
          if (
            statSync(
              p,
            ).isDirectory()
          )
            walk(
              p,
            );
          else if (
            /\.tsx$/.test(
              name,
            ) &&
            !/\.test\.tsx$/.test(
              name,
            ) &&
            !p.endsWith(
              '__root.tsx',
            )
          ) {
            const code =
              readFileSync(
                p,
                'utf8',
              )
                .split(
                  '\n',
                )
                .filter(
                  (
                    l,
                  ) =>
                    !/^\s*(\/\/|\*|\{?\/\*)/.test(
                      l,
                    ),
                );
            if (
              code.some(
                (
                  l,
                ) =>
                  /<script[\s>]/.test(
                    l,
                  ),
              )
            )
              offenders.push(
                p,
              );
          }
        }
      };
    const root =
      join(
        __dirname,
        '../../..',
      );
    walk(
      join(
        root,
        'app',
      ),
    );
    walk(
      join(
        root,
        'components',
      ),
    );
    expect(
      offenders,
    ).toEqual(
      [],
    );
  });
});
