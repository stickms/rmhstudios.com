// Every RMHOS_NET_* variable the hub or the session API reads must be passed to the hub by compose
// (hub variables), listed in .env.example and in the runbook's variable table. A tuning variable that
// is documented but never reaches the container does nothing, which is how three of them once shipped.
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { parse } from 'yaml';

const repo =
  join(
    __dirname,
    '..',
    '..',
    '..',
  );
const read =
  (
    p: string,
  ) =>
    readFileSync(
      join(
        repo,
        p,
      ),
      'utf8',
    );
const names =
  (
    text: string,
  ) =>
    new Set(
      [
        ...text.matchAll(
          /(?<![A-Z0-9_])((?:VITE_)?RMHOS_NET_[A-Z0-9_]+)/g,
        ),
      ].map(
        (
          m,
        ) =>
          m[1] as string,
      ),
    );

const hubSource =
  readdirSync(
    join(
      repo,
      'server/rmhos-net',
    ),
  )
    .filter(
      (
        f,
      ) =>
        f.endsWith(
          '.ts',
        ),
    )
    .map(
      (
        f,
      ) =>
        read(
          `server/rmhos-net/${f}`,
        ),
    )
    .join(
      '\n',
    );
const webSource =
  [
    'features/rmhos/api/rmhos.session.server.ts',
    'features/rmhos/engine/net-ticket.server.ts',
  ]
    .map(
      read,
    )
    .join(
      '\n',
    );
const hubNames =
  names(
    hubSource,
  );
const webNames =
  names(
    webSource,
  );
const compose =
  parse(
    read(
      'docker-compose.yml',
    ),
    {
      merge: true,
    },
  ) as {
    services: Record<
      string,
      {
        environment?: string[];
      }
    >;
  };
const composeKeys =
  new Set(
    (
      compose
        .services[
        'rmhos-net'
      ]
        ?.environment ??
      []
    ).map(
      (
        e,
      ) =>
        String(
          e,
        ).split(
          '=',
        )[0] as string,
    ),
  );
const envExample =
  names(
    read(
      '.env.example',
    ),
  );
const runbook =
  read(
    'docs/rmhos.md',
  );
const tableRows =
  new Set(
    [
      ...runbook.matchAll(
        /^\|\s*`((?:VITE_)?RMHOS_NET_[A-Z0-9_]+)`/gm,
      ),
    ].map(
      (
        m,
      ) =>
        m[1] as string,
    ),
  );

describe('RMHOS_NET_* variables', () => {
  it('finds the variables it is meant to guard', () => {
    for (const n of [
      'RMHOS_NET_MAX_STREAMS',
      'RMHOS_NET_DENY_FILE',
      'RMHOS_NET_TICKET_SECRET',
    ])
      expect(
        hubNames.has(
          n,
        ),
        n,
      ).toBe(
        true,
      );
    expect(
      webNames.has(
        'RMHOS_NET_ACCESS',
      ),
    ).toBe(
      true,
    );
  });

  it('are all passed to the hub by compose', () => {
    for (const n of hubNames)
      expect(
        composeKeys.has(
          n,
        ),
        `${n} missing from compose environment`,
      ).toBe(
        true,
      );
  });

  it('are all in .env.example', () => {
    for (const n of new Set(
      [
        ...hubNames,
        ...webNames,
      ],
    ))
      expect(
        envExample.has(
          n,
        ),
        `${n} missing from .env.example`,
      ).toBe(
        true,
      );
  });

  it('are all in the runbook table', () => {
    for (const n of new Set(
      [
        ...hubNames,
        ...webNames,
      ],
    ))
      expect(
        tableRows.has(
          n,
        ),
        `${n} missing from the docs/rmhos.md variable table`,
      ).toBe(
        true,
      );
  });

  it('passes nothing to the hub that the hub does not read', () => {
    for (const k of composeKeys)
      expect(
        hubNames.has(
          k,
        ),
        `${k} is passed but never read`,
      ).toBe(
        true,
      );
  });
});
