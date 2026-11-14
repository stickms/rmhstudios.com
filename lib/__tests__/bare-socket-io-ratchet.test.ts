/**
 * No browser code calls socket.io's `io()` directly (redesign audit A4).
 *
 * Every browser socket goes through `createRealtimeClient`
 * (`lib/shared/realtime/client.ts`): the fast-recovery wake signals, the honest
 * `connecting` / `reconnecting` status, per-attempt credentials, the protocol
 * version stamp (E2) and the opt-in outbox. A bare `io()` gets none of that —
 * it reconnects on socket.io's 1s-to-10s backoff, reports nothing the UI can
 * tell apart, and leaks its own `visibilitychange` listener. Seven game clients
 * used to hand-roll it; this keeps the count at zero.
 *
 * Type-only imports (`import type { Socket } from 'socket.io-client'`, or an
 * inline `type Socket` specifier) are fine: they erase at build time.
 *
 * A dynamic `import('socket.io-client')` loads the same `io()` and counts too;
 * `typeof import('socket.io-client')` in a type position does not.
 *
 * Tests are not scanned (they mock the module or drive a real hub with it).
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

/** The one module allowed to call `io()`. */
const WRAPPER =
  'lib/shared/realtime/client.ts';

/**
 * Dynamic importers that predate this ratchet. Entries come out; they never go in.
 *
 * - The Lights Out Discord Activity races a socket against a 3s timer and falls
 *   back to HTTP polling when Discord's proxy will not carry the upgrade. That
 *   design (and its own retry policy) is what the wrapper would have to absorb
 *   before this can move onto it.
 */
const DYNAMIC_BASELINE =
  [
    'components/lights-out/LightsOutDiscordActivity.tsx',
  ];

const DYNAMIC_IMPORT =
  /(?<!typeof\s+)\bimport\(\s*['"]socket\.io-client['"]\s*\)/;

const IMPORT =
  /import\s+(type\s+)?([^'";]*?)\s*from\s*['"]socket\.io-client['"]/g;

/** True when an import clause binds anything that exists at runtime. */
function bindsValue(
  clause: string,
): boolean {
  // `* as sio`, `io`, or `io, { type Socket }` bind a value outright.
  const named =
    /\{([^}]*)\}/.exec(
      clause,
    );
  const outsideBraces =
    clause
      .replace(
        /\{[^}]*\}/,
        '',
      )
      .replace(
        /,/g,
        '',
      )
      .trim();
  if (
    outsideBraces
  )
    return true;
  if (
    !named
  )
    return false;
  return named[1]
    .split(
      ',',
    )
    .map(
      (
        spec,
      ) =>
        spec.trim(),
    )
    .filter(
      Boolean,
    )
    .some(
      (
        spec,
      ) =>
        !/^type\s/.test(
          spec,
        ),
    );
}

function offenders(): string[] {
  const files =
    globSync(
      '{app,components,lib,features,stores,hooks}/**/*.{ts,tsx}',
      {
        exclude:
          (
            f,
          ) =>
            /node_modules|\.test\.|routeTree\.gen/.test(
              String(
                f,
              ),
            ),
      },
    );
  const bad: string[] =
    [];
  for (const file of files.map(
    String,
  )) {
    if (
      file ===
      WRAPPER
    )
      continue;
    const source =
      readFileSync(
        file,
        'utf8',
      );
    if (
      DYNAMIC_IMPORT.test(
        source,
      ) &&
      !DYNAMIC_BASELINE.includes(
        file,
      )
    ) {
      bad.push(
        file,
      );
      continue;
    }
    for (const match of source.matchAll(
      IMPORT,
    )) {
      const [
        ,
        typeOnly,
        clause,
      ] =
        match;
      if (
        !typeOnly &&
        bindsValue(
          clause,
        )
      ) {
        bad.push(
          file,
        );
        break;
      }
    }
  }
  return bad.sort();
}

describe('bare socket.io ratchet', () => {
  it('only the shared realtime client imports a value from socket.io-client', () => {
    expect(
      offenders(),
      `These files import a value from 'socket.io-client'. Open the socket with createRealtimeClient from '@/lib/shared/realtime/client' instead (see lib/rmhtype/socket.ts for the shape); use 'import type { Socket }' for types.`,
    ).toEqual(
      [],
    );
  });

  it('the dynamic-import baseline only lists files that still need it', () => {
    for (const file of DYNAMIC_BASELINE) {
      expect(
        DYNAMIC_IMPORT.test(
          readFileSync(
            file,
            'utf8',
          ),
        ),
        `${file} no longer imports socket.io-client dynamically: remove it from DYNAMIC_BASELINE`,
      ).toBe(
        true,
      );
    }
  });

  it('tells a dynamic value import from a type query', () => {
    expect(
      DYNAMIC_IMPORT.test(
        "import('socket.io-client').then(({ io }) => io(url))",
      ),
    ).toBe(
      true,
    );
    expect(
      DYNAMIC_IMPORT.test(
        'const { io } = await import("socket.io-client");',
      ),
    ).toBe(
      true,
    );
    expect(
      DYNAMIC_IMPORT.test(
        "useRef<ReturnType<typeof import('socket.io-client').io> | null>",
      ),
    ).toBe(
      false,
    );
  });

  it('recognises value and type-only imports', () => {
    expect(
      bindsValue(
        '{ io }',
      ),
    ).toBe(
      true,
    );
    expect(
      bindsValue(
        '{ io, type Socket }',
      ),
    ).toBe(
      true,
    );
    expect(
      bindsValue(
        '{ io as connect }',
      ),
    ).toBe(
      true,
    );
    expect(
      bindsValue(
        '* as sio',
      ),
    ).toBe(
      true,
    );
    expect(
      bindsValue(
        'io',
      ),
    ).toBe(
      true,
    );
    expect(
      bindsValue(
        '{ type Socket }',
      ),
    ).toBe(
      false,
    );
    expect(
      bindsValue(
        '{ type Socket, type ManagerOptions }',
      ),
    ).toBe(
      false,
    );
  });
});
