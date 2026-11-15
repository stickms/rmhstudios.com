/**
 * Predictive prefetch guards (lib/foresight-prefetch.ts).
 *
 * Same reason as viewport-prefetch.test.ts: a guard that stops working costs
 * bandwidth on metered connections, or fires a GET at a path that must never be
 * fetched speculatively (`/logout`, `/checkout`, `/api`), and nothing in the UI
 * shows it. Vitest runs in `node`, so the DOM and the library are stubbed.
 */
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  MAX_REGISTERED,
  startForesightPrefetch,
  type ForesightManagerLike,
  type ForesightRouter,
} from '@/lib/foresight-prefetch';

class FakeAnchor {
  isConnected = true;
  constructor(
    private readonly attrs: Record<
      string,
      string
    >,
  ) {}
  hasAttribute(
    name: string,
  ) {
    return (
      name in
      this
        .attrs
    );
  }
  getAttribute(
    name: string,
  ) {
    return (
      this
        .attrs[
        name
      ] ??
      null
    );
  }
}

function anchor(
  href: string,
  extra: Record<
    string,
    string
  > = {},
) {
  return new FakeAnchor(
    {
      href,
      ...extra,
    },
  );
}

function stubDom(
  anchors: FakeAnchor[],
) {
  const listeners =
    new Map<
      string,
      () => void
    >();
  vi.stubGlobal(
    'document',
    {
      readyState:
        'complete',
      querySelectorAll:
        () =>
          anchors,
    },
  );
  vi.stubGlobal(
    'window',
    {
      location:
        {
          pathname:
            '/',
        },
      requestIdleCallback:
        (
          fn: () => void,
        ) =>
          fn(),
      addEventListener:
        (
          type: string,
          fn: () => void,
        ) =>
          listeners.set(
            type,
            fn,
          ),
      removeEventListener:
        (
          type: string,
        ) =>
          listeners.delete(
            type,
          ),
    },
  );
  return {
    listeners,
  };
}

function stubManager() {
  const callbacks =
    new Map<
      unknown,
      () => void | Promise<void>
    >();
  const unregistered: unknown[] =
    [];
  const manager: ForesightManagerLike =
    {
      register:
        ({
          element,
          callback,
        }) => {
          callbacks.set(
            element,
            callback,
          );
          return {
            unregister:
              () => {
                unregistered.push(
                  element,
                );
                callbacks.delete(
                  element,
                );
              },
          };
        },
    };
  return {
    manager,
    callbacks,
    unregistered,
    load: () =>
      Promise.resolve(
        manager,
      ),
  };
}

function stubRouter() {
  const preloaded: string[] =
    [];
  let onResolved:
    | (() => void)
    | null =
    null;
  const router =
    {
      preloadRoute:
        (opts: {
          to: string;
        }) => {
          preloaded.push(
            opts.to,
          );
          return Promise.resolve(
            undefined,
          );
        },
      subscribe:
        (
          event: string,
          listener: () => void,
        ) => {
          if (
            event ===
            'onResolved'
          )
            onResolved =
              listener;
          return () => {
            onResolved =
              null;
          };
        },
    } as unknown as ForesightRouter;
  return {
    router,
    preloaded,
    navigate:
      () =>
        onResolved?.(),
  };
}

const flush =
  () =>
    new Promise(
      (
        resolve,
      ) =>
        setImmediate(
          resolve,
        ),
    );

afterEach(
  () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  },
);

describe('startForesightPrefetch', () => {
  it('does not load the library when Save-Data is on', async () => {
    vi.stubGlobal(
      'navigator',
      {
        connection:
          {
            saveData: true,
          },
      },
    );
    stubDom(
      [
        anchor(
          '/a',
        ),
      ],
    );
    const load =
      vi.fn();
    startForesightPrefetch(
      stubRouter()
        .router,
      load,
    );
    await flush();
    expect(
      load,
    ).not.toHaveBeenCalled();
  });

  it('registers only links prefetchTarget accepts', async () => {
    vi.stubGlobal(
      'navigator',
      {},
    );
    const ok =
      anchor(
        '/wallet',
      );
    stubDom(
      [
        ok,
        anchor(
          '/logout',
        ),
        anchor(
          '/checkout',
        ),
        anchor(
          '/api/x',
        ),
        anchor(
          '/a?tab=1',
        ),
        anchor(
          '/b',
          {
            'data-no-prefetch':
              '',
          },
        ),
      ],
    );
    const {
      callbacks,
      load,
    } =
      stubManager();
    startForesightPrefetch(
      stubRouter()
        .router,
      load,
    );
    await flush();
    expect(
      [
        ...callbacks.keys(),
      ],
    ).toEqual(
      [
        ok,
      ],
    );
  });

  it('a prediction preloads the route through the router', async () => {
    vi.stubGlobal(
      'navigator',
      {},
    );
    const el =
      anchor(
        '/wallet',
      );
    stubDom(
      [
        el,
      ],
    );
    const {
      callbacks,
      load,
    } =
      stubManager();
    const {
      router,
      preloaded,
    } =
      stubRouter();
    startForesightPrefetch(
      router,
      load,
    );
    await flush();
    await callbacks.get(
      el,
    )?.();
    expect(
      preloaded,
    ).toEqual(
      [
        '/wallet',
      ],
    );
  });

  it(`tracks at most ${MAX_REGISTERED} links`, async () => {
    vi.stubGlobal(
      'navigator',
      {},
    );
    stubDom(
      Array.from(
        {
          length:
            MAX_REGISTERED +
            50,
        },
        (
          _,
          i,
        ) =>
          anchor(
            `/p${i}`,
          ),
      ),
    );
    const {
      callbacks,
      load,
    } =
      stubManager();
    startForesightPrefetch(
      stubRouter()
        .router,
      load,
    );
    await flush();
    expect(
      callbacks.size,
    ).toBe(
      MAX_REGISTERED,
    );
  });

  it('forgets links that left the page on the next scan', async () => {
    vi.useFakeTimers(
      {
        toFake:
          [
            'setTimeout',
            'clearTimeout',
            'Date',
          ],
      },
    );
    vi.stubGlobal(
      'navigator',
      {},
    );
    const gone =
      anchor(
        '/old',
      );
    stubDom(
      [
        gone,
      ],
    );
    const {
      unregistered,
      load,
    } =
      stubManager();
    const {
      router,
      navigate,
    } =
      stubRouter();
    startForesightPrefetch(
      router,
      load,
    );
    await flush();
    gone.isConnected = false;
    navigate();
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      unregistered,
    ).toEqual(
      [
        gone,
      ],
    );
  });

  it('stop() unregisters everything and removes its listeners', async () => {
    vi.stubGlobal(
      'navigator',
      {},
    );
    const {
      listeners,
    } =
      stubDom(
        [
          anchor(
            '/a',
          ),
          anchor(
            '/b',
          ),
        ],
      );
    const {
      unregistered,
      load,
    } =
      stubManager();
    const stop =
      startForesightPrefetch(
        stubRouter()
          .router,
        load,
      );
    await flush();
    expect(
      [
        ...listeners.keys(),
      ].sort(),
    ).toEqual(
      [
        'pointermove',
        'scroll',
      ],
    );
    stop();
    expect(
      unregistered,
    ).toHaveLength(
      2,
    );
    expect(
      listeners.size,
    ).toBe(
      0,
    );
  });
});
