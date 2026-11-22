import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * The hook is run with effects executed inline and the DOM reduced to two event
 * targets: with tracking off it attaches nothing and sends nothing; with it on,
 * hiding the tab flushes once.
 */
const h =
  vi.hoisted(
    () => ({
      trackTime: false,
      cleanups:
        [] as Array<
          () => void
        >,
      calls:
        [] as unknown[],
    }),
  );

vi.mock(
  'react',
  () => ({
    useRef:
      <
        T,
      >(
        v: T,
      ) => ({
        current:
          v,
      }),
    useCallback:
      <
        T,
      >(
        f: T,
      ) =>
        f,
    useEffect:
      (
        fn: () =>
          | void
          | (() => void),
      ) => {
        const c =
          fn();
        if (
          c
        )
          h.cleanups.push(
            c,
          );
      },
  }),
);
vi.mock(
  '@tanstack/react-query',
  () => ({
    useQuery:
      () => ({
        data: {
          trackTime:
            h.trackTime,
          weeklyMinutesTarget:
            null,
          docSeconds: 0,
        },
      }),
    useQueryClient:
      () => ({
        invalidateQueries:
          vi.fn(
            async () => {},
          ),
      }),
  }),
);
vi.mock(
  '@/lib/contract/client',
  () => ({
    apiQuery:
      () => ({
        queryKey:
          [
            'x',
          ],
        queryFn:
          async () => ({}),
      }),
    api: vi.fn(
      async (
        _c: unknown,
        input: unknown,
      ) => {
        h.calls.push(
          input,
        );
        return {
          recorded: 1,
        };
      },
    ),
  }),
);

import { useReadingClock } from '../useReadingClock';

class Target extends EventTarget {
  visibilityState =
    'visible';
  counts =
    new Map<
      string,
      number
    >();
  override addEventListener(
    type: string,
    l: EventListenerOrEventListenerObject | null,
    o?: unknown,
  ) {
    this.counts.set(
      type,
      (this.counts.get(
        type,
      ) ??
        0) +
        1,
    );
    super.addEventListener(
      type,
      l,
      o as AddEventListenerOptions,
    );
  }
}
let doc: Target;
let win: Target;

beforeEach(
  () => {
    h.cleanups =
      [];
    h.calls =
      [];
    doc =
      new Target();
    win =
      new Target();
    vi.stubGlobal(
      'document',
      doc,
    );
    vi.stubGlobal(
      'window',
      win,
    );
    vi.spyOn(
      Date,
      'now',
    );
  },
);

const useMounted =
  (
    enabled = true,
  ) =>
    useReadingClock(
      {
        kind: 'blog',
        docKey:
          'hello',
        enabled,
      },
    );

describe('useReadingClock', () => {
  it('with tracking off attaches no listener and sends nothing', () => {
    h.trackTime = false;
    const clock =
      useMounted();
    expect(
      clock.tracking,
    ).toBe(
      false,
    );
    expect(
      doc
        .counts
        .size,
    ).toBe(
      0,
    );
    expect(
      win
        .counts
        .size,
    ).toBe(
      0,
    );
    clock.touch();
    doc.visibilityState =
      'hidden';
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    win.dispatchEvent(
      new Event(
        'pagehide',
      ),
    );
    expect(
      h.calls,
    ).toHaveLength(
      0,
    );
  });

  it('signed out never tracks even if the pref says so', () => {
    h.trackTime = true;
    const clock =
      useMounted(
        false,
      );
    expect(
      clock.tracking,
    ).toBe(
      false,
    );
    expect(
      doc
        .counts
        .size,
    ).toBe(
      0,
    );
  });

  it('with tracking on, hiding the tab flushes once, with keepalive', () => {
    h.trackTime = true;
    let now = 1_000_000;
    vi.mocked(
      Date.now,
    ).mockImplementation(
      () =>
        now,
    );
    const clock =
      useMounted();
    expect(
      clock.tracking,
    ).toBe(
      true,
    );
    expect(
      doc.counts.get(
        'scroll',
      ),
    ).toBe(
      1,
    );
    expect(
      doc.counts.get(
        'visibilitychange',
      ),
    ).toBe(
      1,
    );
    now += 40_000;
    doc.dispatchEvent(
      new Event(
        'scroll',
      ),
    );
    now += 20_000;
    doc.visibilityState =
      'hidden';
    doc.dispatchEvent(
      new Event(
        'visibilitychange',
      ),
    );
    win.dispatchEvent(
      new Event(
        'pagehide',
      ),
    ); // nothing left to send
    expect(
      h.calls,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .calls[0],
    ).toMatchObject(
      {
        body: {
          kind: 'blog',
          key: 'hello',
          seconds: 60,
        },
        keepalive: true,
      },
    );
  });

  it('flushes from the activity handler once more than five minutes have accumulated', () => {
    h.trackTime = true;
    let now = 0;
    vi.mocked(
      Date.now,
    ).mockImplementation(
      () =>
        now,
    );
    useMounted();
    for (
      let i = 0;
      i <
      6;
      i++
    ) {
      now += 60_000;
      doc.dispatchEvent(
        new Event(
          'keydown',
        ),
      );
    }
    expect(
      h.calls,
    ).toHaveLength(
      1,
    );
    expect(
      (
        h
          .calls[0] as {
          body: {
            seconds: number;
          };
        }
      )
        .body
        .seconds,
    ).toBe(
      360,
    );
  });
});
