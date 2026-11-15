/**
 * No hand-rolled Web Storage + JSON (redesign audit A4).
 *
 * Reading JSON out of `localStorage`/`sessionStorage` goes through
 * `lib/core/persist` (`readJson` / `writeJson` / `persisted`): it is SSR-safe,
 * never throws (private mode, blocked storage, quota, corrupt JSON), and takes a
 * `validate` so the caller never casts. A source file that calls
 * `localStorage.getItem(` / `sessionStorage.getItem(` AND `JSON.parse(` is the
 * old per-file try/catch copy, so it fails here.
 *
 * The allowlist is one-directional: entries come out, they do not go in. A
 * listed file that no longer matches fails too, so the list cannot go stale.
 */
import {
  globSync,
  readFileSync,
} from 'node:fs';
import {
  describe,
  expect,
  it,
} from 'vitest';

/** path -> why it may keep the raw pair. */
const ALLOW: Record<
  string,
  string
> =
  {
    'lib/prepaint/access.ts':
      'Pre-paint step: bundled into one inline script, so it cannot import a module (twin of lib/access/prefs).',
    'lib/prepaint/generated.ts':
      'Generated output of the pre-paint steps.',
    'lib/rmhvibe/vibe-bundle.server.ts':
      'Emits a Web Storage shim as a string for sandboxed iframes; not storage access of its own.',
    'features/void-breaker/ui/VoidBreakerGame.tsx':
      'Island under construction (B1); migrates with it.',
    'features/void-breaker/engine/metaProgression.ts':
      'Island under construction (B1); migrates with it.',
    'features/void-breaker/engine/saveSystem.ts':
      'Island under construction (B1); migrates with it.',
    'features/nightrail/ui/NightrailGame.tsx':
      'Island under construction (B1); migrates with it.',
  };

const GET =
  /\b(?:local|session)Storage\s*\.\s*getItem\s*\(/;
const PARSE =
  /\bJSON\.parse\s*\(/;

function offenders(): string[] {
  const files =
    globSync(
      '{app,components,lib,hooks,stores,features}/**/*.{ts,tsx}',
      {
        exclude:
          (
            f,
          ) =>
            /node_modules|__tests__|\.test\.|routeTree\.gen|^lib\/core\//.test(
              String(
                f,
              ),
            ),
      },
    );
  return files
    .map(
      String,
    )
    .filter(
      (
        f,
      ) => {
        const src =
          readFileSync(
            f,
            'utf8',
          );
        return (
          GET.test(
            src,
          ) &&
          PARSE.test(
            src,
          )
        );
      },
    )
    .sort();
}

describe('persist ratchet', () => {
  const found =
    offenders();

  it('only allowlisted files pair a raw storage read with JSON.parse', () => {
    const fresh =
      found.filter(
        (
          f,
        ) =>
          !(
            f in
            ALLOW
          ),
      );
    expect(
      fresh,
      `Use readJson/writeJson/persisted from '@/lib/core/persist' instead of getItem + JSON.parse:\n  ${fresh.join('\n  ')}`,
    ).toEqual(
      [],
    );
  });

  it('has no stale allowlist entries', () => {
    const stale =
      Object.keys(
        ALLOW,
      ).filter(
        (
          f,
        ) =>
          !found.includes(
            f,
          ),
      );
    expect(
      stale,
      `Delete these from ALLOW (they no longer match): ${stale.join(', ')}`,
    ).toEqual(
      [],
    );
  });
});
