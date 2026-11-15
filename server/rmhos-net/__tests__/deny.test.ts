// A reload must never lift a block by accident (server/rmhos-net/deny.ts).
import {
  describe,
  expect,
  it,
} from 'vitest';
import { createDenyList } from '../deny';

function harness(
  initial: string,
) {
  const h =
    {
      file: initial as
        | string
        | null,
      mtime: 0,
      now: 1_000_000,
      timers:
        [] as {
          fn: () => void;
          ms: number;
        }[],
      events:
        [] as Record<
          string,
          unknown
        >[],
    };
  const deny =
    createDenyList(
      {
        RMHOS_NET_DENY_FILE:
          '/deny/users.txt',
      },
      () => {
        if (
          h.file ===
          null
        )
          throw Object.assign(
            new Error(
              'ENOENT: no such file',
            ),
            {
              code: 'ENOENT',
            },
          );
        return h.file;
      },
      {
        mtimeMs:
          () =>
            h.mtime,
        now: () =>
          h.now,
        later:
          (
            fn,
            ms,
          ) =>
            h.timers.push(
              {
                fn,
                ms,
              },
            ),
      },
    );
  deny.onEvent =
    (
      l,
    ) =>
      h.events.push(
        l,
      );
  return {
    h,
    deny,
  };
}

describe('deny-list reload safety', () => {
  it('retries once after 2 s when the file is empty and was just written, and keeps the list meanwhile', () => {
    const {
      h,
      deny,
    } =
      harness(
        'a\nb\n',
      );
    expect(
      deny.size,
    ).toBe(
      2,
    );
    h.file =
      '';
    h.mtime =
      h.now -
      500; // an editor truncated it a moment ago
    const late: string[][] =
      [];
    expect(
      deny.reload(
        (
          a,
        ) =>
          late.push(
            a,
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      deny.has(
        'a',
      ) &&
        deny.has(
          'b',
        ),
    ).toBe(
      true,
    );
    expect(
      h.timers.map(
        (
          t,
        ) =>
          t.ms,
      ),
    ).toEqual(
      [
        2000,
      ],
    );
    // the save finishes before the retry: the retry sees the full list again
    h.file =
      'a\nb\nc\n';
    h.timers[0]!.fn();
    expect(
      late,
    ).toEqual(
      [
        [
          'c',
        ],
      ],
    );
    expect(
      deny.has(
        'c',
      ),
    ).toBe(
      true,
    );
    expect(
      h.timers,
    ).toHaveLength(
      1,
    ); // retried once only
  });

  it('believes the retry: a file that is still shorter 2 s later does shrink the list', () => {
    const {
      h,
      deny,
    } =
      harness(
        'a\nb\nc\n',
      );
    h.file =
      'a\n';
    h.mtime =
      h.now -
      100;
    deny.reload();
    expect(
      deny.size,
    ).toBe(
      3,
    );
    h.timers[0]!.fn();
    expect(
      deny.size,
    ).toBe(
      1,
    );
    expect(
      h.events.some(
        (
          e,
        ) =>
          e.evt ===
            'rmhos-net.deny.removed' &&
          e.removed ===
            2,
      ),
    ).toBe(
      true,
    );
    expect(
      h.timers,
    ).toHaveLength(
      1,
    );
  });

  it('clears the list at once for an intentionally emptied file older than 2 s, and logs how many went', () => {
    const {
      h,
      deny,
    } =
      harness(
        'a\nb\nc\n',
      );
    h.file =
      '# nobody is cut off now\n';
    h.mtime =
      h.now -
      5000;
    expect(
      deny.reload(),
    ).toEqual(
      [],
    );
    expect(
      deny.size,
    ).toBe(
      0,
    );
    expect(
      deny.has(
        'a',
      ),
    ).toBe(
      false,
    );
    expect(
      h.timers,
    ).toHaveLength(
      0,
    );
    expect(
      h.events,
    ).toContainEqual(
      expect.objectContaining(
        {
          evt: 'rmhos-net.deny.removed',
          removed: 3,
          total: 0,
        },
      ),
    );
  });

  it('keeps the last list and logs a warning when the file is deleted', () => {
    const {
      h,
      deny,
    } =
      harness(
        'a\nb\n',
      );
    h.file =
      null;
    expect(
      deny.reload(),
    ).toEqual(
      [],
    );
    expect(
      deny.size,
    ).toBe(
      2,
    );
    expect(
      deny.has(
        'a',
      ),
    ).toBe(
      true,
    );
    expect(
      h.events,
    ).toContainEqual(
      expect.objectContaining(
        {
          evt: 'rmhos-net.deny.warn',
          reason:
            'file-missing',
          keeping: 2,
        },
      ),
    );
    expect(
      h.timers,
    ).toHaveLength(
      0,
    );
  });

  it('reports added ids immediately and does not retry when the list only grows', () => {
    const {
      h,
      deny,
    } =
      harness(
        'a\n',
      );
    h.file =
      'a\nb\n';
    h.mtime =
      h.now -
      10;
    expect(
      deny.reload(),
    ).toEqual(
      [
        'b',
      ],
    );
    expect(
      h.timers,
    ).toHaveLength(
      0,
    );
  });

  it('keeps env ids through every reload, and a missing file at start is an empty file list', () => {
    const deny =
      createDenyList(
        {
          RMHOS_NET_DENY_USERS:
            'e',
          RMHOS_NET_DENY_FILE:
            '/x',
        },
        () => {
          throw new Error(
            'ENOENT',
          );
        },
      );
    expect(
      deny.has(
        'e',
      ),
    ).toBe(
      true,
    );
    expect(
      deny.size,
    ).toBe(
      1,
    );
  });
});
