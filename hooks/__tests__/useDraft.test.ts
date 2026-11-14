/**
 * `useDraft` must not lose a draft typed just before the editor unmounts (navigation, closing a sheet).
 *
 * React runs unmount cleanups in declaration order, so the autosave effect's cleanup (which clears the debounce
 * timer) runs BEFORE the unmount flush. The flush used to test that timer — always null by then — so anything typed
 * within the 800ms debounce of leaving was silently dropped. These cases pin the fix: the owed write is flushed, an
 * idle editor writes nothing on unmount, and `clear()` cancels the owed write.
 *
 * The suite runs in `node`, so React is replaced by a minimal multi-render hook runtime (slots by call order,
 * effects re-run on dep change with cleanups first, unmount cleanups in declaration order) and `idb` by an in-memory
 * store — enough to drive the hook's real logic.
 */
// @vitest-environment node
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

type Slot =
  {
    [
      k: string
    ]: unknown;
  };
const rt =
  vi.hoisted(
    () => ({
      slots:
        [] as Slot[],
      idx: 0,
      queue:
        [] as Array<{
          i: number;
          fn: () =>
            | void
            | (() => void);
          deps?: unknown[];
        }>,
    }),
  );

vi.mock(
  'react',
  () => {
    const same =
      (
        a?: unknown[],
        b?: unknown[],
      ) =>
        !!a &&
        !!b &&
        a.length ===
          b.length &&
        a.every(
          (
            v,
            i,
          ) =>
            Object.is(
              v,
              b[
                i
              ],
            ),
        );
    return {
      useRef:
        <
          T,
        >(
          v: T,
        ) => {
          const i =
            rt.idx++;
          rt.slots[
            i
          ] ??=
            {
              current:
                v,
            };
          return rt
            .slots[
            i
          ];
        },
      useState:
        <
          T,
        >(
          v: T,
        ) => {
          const i =
            rt.idx++;
          rt.slots[
            i
          ] ??=
            {
              v,
            };
          const slot =
            rt
              .slots[
              i
            ];
          return [
            slot.v,
            (
              n:
                | T
                | ((
                    p: T,
                  ) => T),
            ) => {
              slot.v =
                typeof n ===
                'function'
                  ? (
                      n as (
                        p: T,
                      ) => T
                    )(
                      slot.v as T,
                    )
                  : n;
            },
          ];
        },
      useCallback:
        <
          T,
        >(
          fn: T,
          deps: unknown[],
        ) => {
          const i =
            rt.idx++;
          const s =
            rt
              .slots[
              i
            ];
          if (
            s &&
            same(
              s.deps as unknown[],
              deps,
            )
          )
            return s.fn as T;
          rt.slots[
            i
          ] =
            {
              fn,
              deps,
            };
          return fn;
        },
      useEffect:
        (
          fn: () =>
            | void
            | (() => void),
          deps?: unknown[],
        ) => {
          const i =
            rt.idx++;
          const s =
            rt
              .slots[
              i
            ];
          if (
            !s ||
            !deps ||
            !same(
              s.deps as unknown[],
              deps,
            )
          )
            rt.queue.push(
              {
                i,
                fn,
                deps,
              },
            );
        },
    };
  },
);

const db =
  vi.hoisted(
    () => ({
      rows: new Map<
        string,
        {
          value: unknown;
        }
      >(),
      put: [] as Array<{
        key: string;
        value: unknown;
      }>,
    }),
  );
vi.mock(
  'idb',
  () => ({
    openDB:
      async () => ({
        get: async (
          _s: string,
          key: string,
        ) =>
          db.rows.get(
            key,
          ),
        put: async (
          _s: string,
          row: {
            key: string;
            value: unknown;
          },
        ) => {
          db.put.push(
            row,
          );
          db.rows.set(
            row.key,
            row,
          );
        },
        delete:
          async (
            _s: string,
            key: string,
          ) => {
            db.rows.delete(
              key,
            );
          },
      }),
  }),
);

const {
  useDraft,
} =
  await import('../useDraft');
/** The hook as a plain function: the mocked React above is the "render". */
const runDraft =
  useDraft<string>;
type Props =
  Parameters<
    typeof runDraft
  >[0];

function render(
  props: Props,
) {
  rt.idx = 0;
  const result =
    runDraft(
      props,
    );
  const queued =
    rt.queue.splice(
      0,
    );
  // Cleanups of every changed effect first, then the setups (React's commit order).
  for (const q of queued)
    (
      rt
        .slots[
        q
          .i
      ]
        ?.cleanup as
        | (() => void)
        | undefined
    )?.();
  for (const q of queued)
    rt.slots[
      q.i
    ] =
      {
        deps: q.deps,
        cleanup:
          q.fn() ??
          undefined,
      };
  return result;
}
function unmount() {
  for (const s of rt.slots)
    if (
      s &&
      'cleanup' in
        s
    )
      (
        s.cleanup as
          | (() => void)
          | undefined
      )?.();
}
const settle =
  async () => {
    for (
      let i = 0;
      i <
      10;
      i++
    )
      await Promise.resolve();
  };

const base: Props =
  {
    surface:
      'comment',
    entityId:
      'p1',
    userId:
      'u1',
    value:
      '',
  };

beforeEach(
  () => {
    vi.useFakeTimers();
    rt.slots =
      [];
    rt.queue =
      [];
    db.rows.clear();
    db.put =
      [];
  },
);
afterEach(
  () =>
    vi.useRealTimers(),
);

async function mountReady() {
  render(
    base,
  );
  await settle(); // the load pass resolves: ready
  const r =
    render(
      base,
    );
  expect(
    r.ready,
  ).toBe(
    true,
  );
  return r;
}

describe('useDraft unmount flush', () => {
  it('saves a draft typed within the debounce of unmounting', async () => {
    await mountReady();
    render(
      {
        ...base,
        value:
          'half a sentence',
      },
    );
    vi.advanceTimersByTime(
      300,
    ); // well inside the 800ms debounce
    unmount();
    await settle();
    expect(
      db.put.map(
        (
          r,
        ) =>
          r.value,
      ),
    ).toEqual(
      [
        'half a sentence',
      ],
    );
  });

  it('writes nothing extra on unmount once the debounced write has landed', async () => {
    await mountReady();
    render(
      {
        ...base,
        value:
          'done typing',
      },
    );
    vi.advanceTimersByTime(
      1000,
    );
    await settle();
    expect(
      db.put,
    ).toHaveLength(
      1,
    );
    unmount();
    await settle();
    expect(
      db.put,
    ).toHaveLength(
      1,
    );
  });

  it('clear() cancels the owed write, so unmount does not resurrect the draft', async () => {
    await mountReady();
    const r =
      render(
        {
          ...base,
          value:
            'sent',
        },
      );
    r.clear();
    unmount();
    await settle();
    expect(
      db.put,
    ).toHaveLength(
      0,
    );
  });
});
