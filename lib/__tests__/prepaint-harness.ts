/**
 * Runs the GENERATED pre-paint code (lib/prepaint/generated.ts) in a fake DOM —
 * exactly as a browser would run the inline <script>, with no import of the
 * modules it was built from. Shared by fouc-contract and the appearance tests so
 * they all exercise the shipped bytes.
 */
import { runInNewContext } from 'node:vm';
import { buildPrepaintConfig, serializePrepaintConfig } from '../prepaint/config';
import { PREPAINT_BODY_CODE, PREPAINT_CODE } from '../prepaint/generated';
import type { PrepaintConfig } from '../prepaint/types';

export interface PrepaintRun {
  /** Initial localStorage contents. */
  storage?: Record<string, string>;
  path?: string;
  cookie?: string;
  /** The config block. Default: the real one for a plain site-tier request. */
  config?: PrepaintConfig;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  /** `prefers-color-scheme: dark` answer; omit for "no matchMedia". */
  prefersDark?: boolean;
  /** Fixed local date for the seasonal / bedtime steps. */
  now?: Date;
  /** Omit the config block from the document entirely. */
  noConfigBlock?: boolean;
  /** Make localStorage unusable (every access throws). */
  brokenStorage?: boolean;
}

export function runPrepaint(opts: PrepaintRun = {}) {
  const stored = new Map(Object.entries(opts.storage ?? {}));
  const setItemCalls: Array<[string, string]> = [];
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  const listeners: string[] = [];
  const meta: { content: string; name?: string; attrs: Map<string, string> } = {
    content: '',
    attrs: new Map(),
  };
  let metaCreated = false;
  const style = {
    backgroundColor: '',
    colorScheme: '',
    fontSize: '',
    setProperty: (k: string, v: string) => props.set(k, v),
  };
  const html = {
    lang: '',
    style,
    classList: {
      add: (v: string) => classes.add(v),
      contains: (v: string) => classes.has(v),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
  };
  const body = { style: { backgroundColor: '' } };
  const cfg = opts.config ?? buildPrepaintConfig();
  const block = opts.noConfigBlock ? null : { textContent: serializePrepaintConfig(cfg) };
  const FixedDate = opts.now
    ? class extends Date {
        constructor(...a: unknown[]) {
          if (a.length) super(...(a as []));
          else super(opts.now!.getTime());
        }
      }
    : Date;
  const sandbox = {
    Date: FixedDate,
    localStorage: opts.brokenStorage
      ? new Proxy(
          {},
          {
            get() {
              throw new Error('storage blocked');
            },
          },
        )
      : {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => {
            setItemCalls.push([key, value]);
            stored.set(key, value);
          },
          removeItem: (key: string) => stored.delete(key),
        },
    document: {
      documentElement: html,
      cookie: opts.cookie ?? '',
      body,
      head: {
        appendChild: (el: typeof meta) => {
          metaCreated = true;
          Object.assign(meta, el);
        },
      },
      getElementById: (id: string) => (id === 'rmh-prepaint' ? block : null),
      querySelector: () => (metaCreated ? meta : null),
      createElement: () => ({
        content: '',
        name: '',
        attrs: new Map(),
        setAttribute(k: string, v: string) {
          this.attrs.set(k, v);
        },
      }),
      addEventListener: (type: string) => listeners.push(type),
    },
    location: { pathname: opts.path ?? '/' },
    navigator: {
      userAgent: opts.userAgent ?? '',
      platform: opts.platform ?? '',
      maxTouchPoints: opts.maxTouchPoints ?? 0,
    },
    window: {} as Record<string, unknown>,
  };
  if (opts.prefersDark !== undefined) {
    sandbox.window.matchMedia = () => ({ matches: opts.prefersDark });
  }
  runInNewContext(PREPAINT_CODE, sandbox);
  return {
    classes,
    attrs,
    props,
    html,
    meta,
    metaCreated: () => metaCreated,
    stored,
    setItemCalls,
    listeners,
    window: sandbox.window,
    /** Run the <body>-top script against the same document. */
    runBody() {
      runInNewContext(PREPAINT_BODY_CODE, sandbox);
      return body;
    },
  };
}
