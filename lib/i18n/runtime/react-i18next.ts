/**
 * The site's React binding for its translation runtime: the part of
 * react-i18next 18 the site uses (`useTranslation`, `I18nextProvider`,
 * `initReactI18next`). `react-i18next` resolves here in every build; see
 * lib/i18n/runtime/i18next.ts for why and what is covered.
 *
 * It follows react-i18next 18:
 * - the instance comes from the `i18n` option, then the provider, then the one
 *   `initReactI18next` registered;
 * - `t` is the instance's `getFixedT(language, namespaces[0])`, renewed whenever
 *   one of the `react.bindI18n` events fires (the site binds
 *   `languageChanged loaded`), through `useSyncExternalStore`;
 * - with `useSuspense: false` (the site's setting) a namespace that is not loaded
 *   yet is requested from an effect and the component re-renders when it lands;
 *   the site never suspends, so the suspense path is not implemented.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { i18n as I18n } from 'i18next';

type Instance = I18n & { __revision?: Map<string, number> };

let globalI18n: Instance | undefined;
export const initReactI18next = {
  type: '3rdParty' as const,
  init(instance: Instance) {
    globalI18n = instance;
  },
};
export const getI18n = () => globalI18n;

export const I18nContext = createContext<{ i18n?: Instance; defaultNS?: string | string[] } | undefined>(undefined);

export function I18nextProvider({ i18n, defaultNS, children }: { i18n: I18n; defaultNS?: string | string[]; children?: ReactNode }) {
  const value = useMemo(() => ({ i18n: i18n as Instance, defaultNS }), [i18n, defaultNS]);
  return createElement(I18nContext.Provider, { value }, children);
}

const bindEvents = (i18n: Instance): string => (i18n.options?.react as { bindI18n?: string } | undefined)?.bindI18n ?? 'languageChanged';

/** How many bound events the instance has fired: the snapshot's revision (react-i18next's `revision`). */
function revision(i18n: Instance, events: string): number {
  let counts = i18n.__revision;
  if (!counts) {
    counts = new Map();
    Object.defineProperty(i18n, '__revision', { value: counts, enumerable: false });
  }
  let sum = 0;
  for (const event of events.split(' ')) {
    if (!event) continue;
    if (!counts.has(event)) {
      counts.set(event, 0);
      const c = counts;
      i18n.on(event, () => c.set(event, c.get(event)! + 1));
    }
    sum += counts.get(event)!;
  }
  return sum;
}

const notReadyT = ((k: unknown, o?: unknown) => {
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object' && typeof (o as { defaultValue?: unknown }).defaultValue === 'string') return (o as { defaultValue: string }).defaultValue;
  if (typeof k === 'function') return '';
  if (Array.isArray(k)) {
    const last = k[k.length - 1];
    return typeof last === 'function' ? '' : last;
  }
  return k;
}) as unknown as I18n['t'];
/** Stands in for a missing instance so the hooks below run unconditionally. */
const NO_INSTANCE = {
  isInitialized: false,
  languages: [],
  options: {},
  on() {},
  off() {},
  hasLoadedNamespace: () => false,
  loadNamespaces: () => Promise.resolve(),
  getFixedT: () => notReadyT,
} as unknown as Instance;

const languageKey = (i: Instance) => `${i.language}|${i.resolvedLanguage}|${i.languages?.join(',')}`;

interface Snapshot {
  t: I18n['t'];
  ready: boolean;
  i18n: Instance;
  lng: string;
  ns: string[];
  rev: number;
}

export function useTranslation(ns?: string | string[], props: { i18n?: I18n; lng?: string } = {}) {
  const ctx = useContext(I18nContext);
  // No instance anywhere (a component rendered on its own, as some tests do): react-i18next
  // answers each call's default value, else its key, and reports not ready.
  const i18n = (props.i18n as Instance | undefined) || ctx?.i18n || globalI18n || NO_INSTANCE;
  const nsOrDefault = ns || ctx?.defaultNS || (i18n.options?.defaultNS as string | string[] | undefined);
  const unstable = typeof nsOrDefault === 'string' ? [nsOrDefault] : nsOrDefault || ['translation'];
  const nsKey = JSON.stringify(unstable);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, as react-i18next does
  const namespaces = useMemo(() => unstable, [nsKey]);
  const events = bindEvents(i18n);

  const subscribe = useCallback(
    (cb: () => void) => {
      i18n.on(events, cb);
      return () => i18n.off(events, cb);
    },
    [i18n, events],
  );
  const last = useRef<Snapshot | undefined>(undefined);
  const getSnapshot = useCallback((): Snapshot => {
    const ready =
      !!i18n.isInitialized &&
      namespaces.every((n) => !i18n.languages?.length || i18n.hasLoadedNamespace(n, { lng: props.lng }));
    const lng = (props.lng || i18n.language) as string;
    const rev = revision(i18n, events);
    const prev = last.current;
    if (prev && prev.i18n === i18n && prev.ready === ready && prev.lng === lng && prev.ns === namespaces && prev.rev === rev) {
      return prev;
    }
    const next: Snapshot = { t: i18n.getFixedT(lng, namespaces[0]) as I18n['t'], ready, i18n, lng, ns: namespaces, rev };
    last.current = next;
    return next;
  }, [i18n, namespaces, events, props.lng]);
  const { t, ready } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [loads, setLoads] = useState(0);
  useEffect(() => {
    if (ready) return;
    const reload = () => setLoads((c) => c + 1);
    void i18n.loadNamespaces(namespaces, () => {
      if (i18n.isInitialized) reload();
      else i18n.on('initialized', function once() {
        setTimeout(() => i18n.off('initialized', once), 0);
        reload();
      });
    });
  }, [i18n, namespaces, ready, loads]);

  const lang = languageKey(i18n);
  const wrapper = useRef<{ original: Instance; lang: string; proxy: Instance } | null>(null);
  if (wrapper.current?.original !== i18n || wrapper.current.lang !== lang) {
    wrapper.current = {
      original: i18n,
      lang,
      proxy: new Proxy(i18n, { get: (target, prop) => (prop === '__original' ? target : Reflect.get(target, prop)) }),
    };
  }
  const proxy = wrapper.current.proxy;
  return useMemo(() => {
    const arr = [t, proxy, ready] as unknown as [I18n['t'], I18n, boolean] & { t: I18n['t']; i18n: I18n; ready: boolean };
    arr.t = t;
    arr.i18n = proxy;
    arr.ready = ready;
    return arr;
  }, [t, proxy, ready]);
}
