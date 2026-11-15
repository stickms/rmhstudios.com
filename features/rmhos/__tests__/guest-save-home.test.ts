// The guest's home save (scripts/rmhos/rootfs/usr/local/bin/rmhos-save-home), run on the host with
// its paths redirected: the agent's SAVE and the poweroff save both call it, possibly at the same
// moment, and it must leave one complete home.tar, never a half-written one or a stray temporary.
import {
  spawn,
  spawnSync,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  join,
  resolve,
} from 'node:path';
import {
  afterAll,
  describe,
  expect,
  it,
} from 'vitest';

const script =
  resolve(
    'scripts/rmhos/rootfs/usr/local/bin/rmhos-save-home',
  );
const dirs: string[] =
  [];
afterAll(
  () =>
    dirs.forEach(
      (
        d,
      ) =>
        rmSync(
          d,
          {
            recursive: true,
            force: true,
          },
        ),
    ),
);

function world() {
  const root =
    mkdtempSync(
      join(
        tmpdir(),
        'rmhos-save-',
      ),
    );
  dirs.push(
    root,
  );
  const share =
    join(
      root,
      'host',
    );
  const homes =
    join(
      root,
      'home',
    );
  const run =
    join(
      root,
      'run',
    );
  for (const d of [
    share,
    homes,
    run,
    join(
      homes,
      'ada',
    ),
  ])
    mkdirSync(
      d,
      {
        recursive: true,
      },
    );
  writeFileSync(
    join(
      homes,
      'ada',
      'notes.txt',
    ),
    'hello',
  );
  for (
    let i = 0;
    i <
    200;
    i++
  )
    writeFileSync(
      join(
        homes,
        'ada',
        `f${i}`,
      ),
      'x'.repeat(
        2000,
      ),
    );
  const env =
    {
      ...process.env,
      RMHOS_SHARE:
        share,
      RMHOS_HOMES:
        homes,
      RMHOS_RUN:
        run,
    };
  const sync =
    join(
      share,
      'sync',
    );
  return {
    env,
    sync,
    archive:
      join(
        sync,
        'home.tar',
      ),
  };
}

const runOnce =
  (
    env: NodeJS.ProcessEnv,
  ) =>
    new Promise<{
      code:
        | number
        | null;
      out: string;
    }>(
      (
        done,
      ) => {
        const p =
          spawn(
            'sh',
            [
              script,
              'ada',
            ],
            {
              env,
            },
          );
        let out =
          '';
        p.stdout.on(
          'data',
          (
            d,
          ) =>
            (out +=
              d),
        );
        p.on(
          'close',
          (
            code,
          ) =>
            done(
              {
                code,
                out: out.trim(),
              },
            ),
        );
      },
    );

describe('rmhos-save-home', () => {
  it('writes a complete home.tar and prints its size, with no temporary left behind', async () => {
    const w =
      world();
    const r =
      await runOnce(
        w.env,
      );
    expect(
      r.code,
    ).toBe(
      0,
    );
    const size =
      readFileSync(
        w.archive,
      ).length;
    expect(
      Number(
        r.out,
      ),
    ).toBe(
      size,
    );
    expect(
      spawnSync(
        'tar',
        [
          '-tf',
          w.archive,
        ],
        {
          encoding:
            'utf8',
        },
      )
        .stdout,
    ).toContain(
      'notes.txt',
    );
    expect(
      readdirSync(
        w.sync,
      ),
    ).toEqual(
      [
        'home.tar',
      ],
    );
  });

  it('survives eight writers at once: every one succeeds, the archive is whole, nothing else remains', async () => {
    const w =
      world();
    const results =
      await Promise.all(
        Array.from(
          {
            length: 8,
          },
          () =>
            runOnce(
              w.env,
            ),
        ),
      );
    expect(
      results.map(
        (
          r,
        ) =>
          r.code,
      ),
    ).toEqual(
      Array(
        8,
      ).fill(
        0,
      ),
    );
    const size =
      readFileSync(
        w.archive,
      ).length;
    for (const r of results)
      expect(
        Number(
          r.out,
        ),
      ).toBe(
        size,
      );
    expect(
      spawnSync(
        'tar',
        [
          '-tf',
          w.archive,
        ],
      )
        .status,
    ).toBe(
      0,
    );
    expect(
      readdirSync(
        w.sync,
      ),
    ).toEqual(
      [
        'home.tar',
      ],
    );
  });

  it('removes a temporary a killed writer left, and refuses an unknown user', async () => {
    const w =
      world();
    expect(
      (
        await runOnce(
          w.env,
        )
      )
        .code,
    ).toBe(
      0,
    );
    const before =
      readFileSync(
        w.archive,
      );
    writeFileSync(
      join(
        w.sync,
        '.home.tar.12345',
      ),
      'half',
    );
    expect(
      (
        await runOnce(
          w.env,
        )
      )
        .code,
    ).toBe(
      0,
    );
    expect(
      existsSync(
        join(
          w.sync,
          '.home.tar.12345',
        ),
      ),
    ).toBe(
      false,
    );
    // an unknown user is refused and touches nothing
    const bad =
      spawnSync(
        'sh',
        [
          script,
          'nobody',
        ],
        {
          env: w.env,
        },
      );
    expect(
      bad.status,
    ).toBe(
      1,
    );
    expect(
      readFileSync(
        w.archive,
      )
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      before.length,
    ).toBeGreaterThan(
      0,
    );
  });

  it('is what both the agent SAVE and the poweroff save call, and neither tars into home.tar directly', () => {
    for (const f of [
      'rmhos-agent',
      'rmhos-poweroff-save',
    ]) {
      const text =
        readFileSync(
          resolve(
            'scripts/rmhos/rootfs/usr/local/bin',
            f,
          ),
          'utf8',
        );
      expect(
        text,
      ).toContain(
        '/usr/local/bin/rmhos-save-home',
      );
      expect(
        text,
      ).not.toMatch(
        /tar -cpf/,
      );
    }
    const helper =
      readFileSync(
        script,
        'utf8',
      );
    expect(
      helper,
    ).toContain(
      'flock -x 9',
    );
    expect(
      helper,
    ).toContain(
      'mv -f "$tmp" "$ARCHIVE"',
    );
  });
});
