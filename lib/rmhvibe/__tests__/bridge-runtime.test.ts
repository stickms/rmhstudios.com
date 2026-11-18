import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BRIDGE_RUNTIME_JS } from '../bridge-runtime';

/**
 * The runtime is an ES5 string that runs inside the sandboxed frame. The repo has no DOM
 * environment, so these tests run it against a small fake window/document whose `dispatch`
 * follows the capture-phase rules the picker depends on (stopPropagation reaches the
 * page's bubble listeners, stopImmediatePropagation the rest of the capture list).
 */

type Listener =
  {
    fn: (
      e: FakeEvent,
    ) => void;
    capture: boolean;
    passive:
      | boolean
      | undefined;
  };
type FakeEvent =
  {
    type: string;
    target: unknown;
    key?: string;
    defaultPrevented: boolean;
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
    [
      k: string
    ]: unknown;
  };

function listenerTable() {
  const table: Record<
    string,
    Listener[]
  > =
    {};
  return {
    table,
    add(
      type: string,
      fn: Listener['fn'],
      opts?:
        | boolean
        | {
            capture?: boolean;
            passive?: boolean;
          },
    ) {
      const o =
        typeof opts ===
        'object'
          ? opts
          : {
              capture:
                !!opts,
            };
      (table[
        type
      ] ??=
        []).push(
        {
          fn,
          capture:
            !!o.capture,
          passive:
            o.passive,
        },
      );
    },
    remove(
      type: string,
      fn: Listener['fn'],
      opts?:
        | boolean
        | {
            capture?: boolean;
          },
    ) {
      const capture =
        typeof opts ===
        'object'
          ? !!opts.capture
          : !!opts;
      const list =
        table[
          type
        ] ??
        [];
      const i =
        list.findIndex(
          (
            l,
          ) =>
            l.fn ===
              fn &&
            l.capture ===
              capture,
        );
      if (
        i >=
        0
      )
        list.splice(
          i,
          1,
        );
    },
  };
}

function makeEnv(
  extra: Record<
    string,
    unknown
  > = {},
) {
  const posted: Array<
    Record<
      string,
      unknown
    >
  > =
    [];
  const parent =
    {
      postMessage:
        (
          m: Record<
            string,
            unknown
          >,
        ) =>
          void posted.push(
            m,
          ),
    };
  const docL =
    listenerTable();
  const winL =
    listenerTable();
  const el =
    () => ({
      style:
        {
          cssText:
            '',
          setProperty() {},
        } as Record<
          string,
          unknown
        >,
      setAttribute() {},
      getAttribute:
        () =>
          null,
      parentNode:
        null as null | {
          removeChild(): void;
        },
      tagName:
        'DIV',
      nodeType: 1,
    });
  const body =
    {
      ...el(),
      appendChild(child: {
        parentNode: unknown;
      }) {
        child.parentNode =
          {
            removeChild() {},
          };
      },
    };
  const media =
    {
      paused: false,
      muted: false,
      pause() {
        this.paused = true;
      },
    };
  const document =
    {
      addEventListener:
        docL.add,
      removeEventListener:
        docL.remove,
      createElement:
        () =>
          el(),
      querySelectorAll:
        () => [
          media,
        ],
      body,
      documentElement:
        {
          ...el(),
          style:
            {
              setProperty() {},
            },
        },
    };
  const window: Record<
    string,
    unknown
  > =
    {
      parent,
      addEventListener:
        winL.add,
      removeEventListener:
        winL.remove,
      ...extra,
    };
  new Function(
    'window',
    'document',
    BRIDGE_RUNTIME_JS,
  )(
    window,
    document,
  );

  const hostSays =
    (
      event: string,
      data?: unknown,
    ) => {
      for (const l of winL
        .table
        .message ??
        [])
        l.fn(
          {
            source:
              parent,
            data: {
              __rmhvibe: 1,
              event,
              data,
            },
          } as unknown as FakeEvent,
        );
    };
  /** Fire an event at `target`: document capture listeners first, then the page's own. */
  const dispatch =
    (
      type: string,
      target: unknown = body,
      props: Record<
        string,
        unknown
      > = {},
    ) => {
      let stopped = false;
      let immediate = false;
      const e: FakeEvent =
        {
          type,
          target,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
          stopPropagation() {
            stopped = true;
          },
          stopImmediatePropagation() {
            stopped = true;
            immediate = true;
          },
          ...props,
        };
      for (const l of docL.table[
        type
      ]?.filter(
        (
          x,
        ) =>
          x.capture,
      ) ??
        []) {
        if (
          immediate
        )
          break;
        l.fn(
          e,
        );
      }
      if (
        !stopped
      )
        for (const l of docL.table[
          type
        ]?.filter(
          (
            x,
          ) =>
            !x.capture,
        ) ??
          [])
          l.fn(
            e,
          );
      return e;
    };
  return {
    window,
    document,
    posted,
    hostSays,
    dispatch,
    docL,
    winL,
    body,
    media,
  };
}

const PRESSES =
  [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'touchstart',
    'touchend',
    'click',
  ];

describe('bridge runtime: element picker', () => {
  beforeEach(
    () =>
      void vi.useFakeTimers(),
  );
  afterEach(
    () =>
      void vi.useRealTimers(),
  );

  it('swallows every press while picking, and only while picking', () => {
    const env =
      makeEnv();
    const pageSaw: string[] =
      [];
    for (const type of PRESSES)
      env.document.addEventListener(
        type,
        () =>
          void pageSaw.push(
            type,
          ),
        false,
      );

    env.dispatch(
      'pointerdown',
    );
    expect(
      pageSaw,
    ).toEqual(
      [
        'pointerdown',
      ],
    );

    pageSaw.length = 0;
    env.hostSays(
      'pick:start',
    );
    for (const type of PRESSES.filter(
      (
        t,
      ) =>
        t !==
        'click',
    ))
      env.dispatch(
        type,
      );
    expect(
      pageSaw,
    ).toEqual(
      [],
    );

    env.hostSays(
      'pick:stop',
    );
    env.dispatch(
      'pointerdown',
    );
    env.dispatch(
      'touchstart',
    );
    expect(
      pageSaw,
    ).toEqual(
      [
        'pointerdown',
        'touchstart',
      ],
    );
  });

  it('registers its listeners non-passive so touchstart can be cancelled', () => {
    const env =
      makeEnv();
    env.hostSays(
      'pick:start',
    );
    for (const type of PRESSES) {
      const mine =
        env.docL.table[
          type
        ]?.filter(
          (
            l,
          ) =>
            l.capture,
        ) ??
        [];
      expect(
        mine.length,
        type,
      ).toBeGreaterThan(
        0,
      );
      expect(
        mine.every(
          (
            l,
          ) =>
            l.passive ===
            false,
        ),
        type,
      ).toBe(
        true,
      );
    }
    const e =
      env.dispatch(
        'touchstart',
      );
    expect(
      e.defaultPrevented,
    ).toBe(
      true,
    );
    env.hostSays(
      'pick:stop',
    );
    expect(
      env
        .docL
        .table
        .touchstart
        ?.length ??
        0,
    ).toBe(
      0,
    );
  });

  it('reports the clicked element once and swallows the click', () => {
    const env =
      makeEnv();
    const pageSaw: string[] =
      [];
    env.document.addEventListener(
      'click',
      () =>
        void pageSaw.push(
          'click',
        ),
      false,
    );
    env.hostSays(
      'pick:start',
    );
    const target =
      {
        ...env.body,
        tagName:
          'BUTTON',
        outerHTML:
          '<button>x</button>',
        innerText:
          'x',
      };
    env.dispatch(
      'click',
      target,
    );
    expect(
      pageSaw,
    ).toEqual(
      [],
    );
    expect(
      env.posted.filter(
        (
          m,
        ) =>
          m.event ===
          'picked',
      ),
    ).toHaveLength(
      1,
    );
    // Picking ended with the click: the next press reaches the page.
    env.dispatch(
      'click',
      target,
    );
    expect(
      pageSaw,
    ).toEqual(
      [
        'click',
      ],
    );
  });

  it('Escape cancels picking and does not reach the page', () => {
    const env =
      makeEnv();
    const pageKeys: string[] =
      [];
    env.document.addEventListener(
      'keydown',
      () =>
        void pageKeys.push(
          'esc',
        ),
      false,
    );
    env.hostSays(
      'pick:start',
    );
    env.dispatch(
      'keydown',
      env.body,
      {
        key: 'Escape',
      },
    );
    expect(
      pageKeys,
    ).toEqual(
      [],
    );
    expect(
      env.posted.some(
        (
          m,
        ) =>
          m.event ===
          'pick:cancel',
      ),
    ).toBe(
      true,
    );
    env.dispatch(
      'keydown',
      env.body,
      {
        key: 'Escape',
      },
    );
    expect(
      pageKeys,
    ).toEqual(
      [
        'esc',
      ],
    );
  });
});

describe('bridge runtime: errors and retirement', () => {
  beforeEach(
    () =>
      void vi.useFakeTimers(),
  );
  afterEach(
    () =>
      void vi.useRealTimers(),
  );

  it('holds an error raised before the host attached and sends it on hello', () => {
    const env =
      makeEnv();
    const fire =
      (
        message: string,
      ) =>
        env.winL.table.error?.forEach(
          (
            l,
          ) =>
            l.fn(
              {
                message,
                filename:
                  'app.js',
              } as unknown as FakeEvent,
            ),
        );
    fire(
      'boom',
    );
    expect(
      env.posted.filter(
        (
          m,
        ) =>
          m.event ===
          'error',
      ),
    ).toEqual(
      [],
    );
    env.hostSays(
      'hello',
      {
        host: 'viewer',
      },
    );
    expect(
      env.posted.filter(
        (
          m,
        ) =>
          m.event ===
          'error',
      ),
    ).toHaveLength(
      1,
    );
    fire(
      'later',
    );
    expect(
      env.posted.filter(
        (
          m,
        ) =>
          m.event ===
          'error',
      ),
    ).toHaveLength(
      2,
    );
  });

  it('pauses media on a retire signal, not on a plain hidden, and leaves AudioContext alone', () => {
    class FakeCtx {}
    const env =
      makeEnv(
        {
          AudioContext:
            FakeCtx,
        },
      );
    // The page's constructor is not replaced: a subclass of it must keep working.
    expect(
      env
        .window
        .AudioContext,
    ).toBe(
      FakeCtx,
    );

    env.hostSays(
      'visibility',
      {
        hidden: true,
      },
    );
    expect(
      env
        .media
        .paused,
    ).toBe(
      false,
    );

    env.hostSays(
      'visibility',
      {
        hidden: true,
        suspend: true,
      },
    );
    expect(
      env
        .media
        .paused,
    ).toBe(
      true,
    );
    expect(
      env
        .media
        .muted,
    ).toBe(
      true,
    );
  });
});
