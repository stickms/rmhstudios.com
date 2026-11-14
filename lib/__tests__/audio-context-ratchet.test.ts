/**
 * One AudioContext per page (redesign audit A4).
 *
 * Browsers cap the contexts a document may create, and a bare
 * `new AudioContext()` throws where Web Audio is blocked, taking the game's init
 * with it. Everything goes through `getAudioContext()` /
 * `resumeAudioContext()` in `lib/shared/platform.ts`, which memoises one context
 * and returns `null` when audio is unavailable.
 *
 * A source file that constructs a context itself, or resolves the constructor
 * (`window.AudioContext`, `webkitAudioContext`), fails here. The allowlist is
 * one-directional: entries come out, they do not go in, and a listed file that
 * no longer matches fails too.
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

/** path -> why it may touch the constructor. */
const ALLOW: Record<
  string,
  string
> =
  {
    'lib/shared/platform.ts':
      'The one place that constructs the shared context.',
    'features/balatro/engine/runtime.ts':
      'Wraps the constructor so every context the native engine (SDL/OpenAL) opens can be silenced on pause.',
    'features/void-breaker/engine/audio.ts':
      'Island under construction (B1); migrates with it.',
  };

// `new AudioContext(`, `new window.AudioContext(`, `window.AudioContext ||`, `webkitAudioContext`.
const BARE =
  /\bnew\s+(?:window\.|globalThis\.)?(?:webkit)?AudioContext\s*\(|\b(?:window|globalThis)\.(?:webkit)?AudioContext\b|\bwebkitAudioContext\b/;

function offenders(): string[] {
  const files =
    globSync(
      '{app,components,lib,hooks,stores,features}/**/*.{ts,tsx}',
      {
        exclude:
          (
            f,
          ) =>
            /node_modules|__tests__|\.test\./.test(
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
        // Comments that explain the rule are fine; strip them before matching.
        const code =
          readFileSync(
            f,
            'utf8',
          )
            .replace(
              /\/\*[\s\S]*?\*\//g,
              '',
            )
            .replace(
              /^\s*\/\/.*$/gm,
              '',
            );
        return BARE.test(
          code,
        );
      },
    )
    .sort();
}

describe('AudioContext ratchet', () => {
  const found =
    offenders();

  it('only allowlisted files touch the AudioContext constructor', () => {
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
      `Use getAudioContext() / resumeAudioContext() from '@/lib/shared/platform':\n  ${fresh.join('\n  ')}`,
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
