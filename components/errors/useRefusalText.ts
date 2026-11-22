/**
 * s10-20 — a refusal in the reader's language.
 *
 * `useRefusalText()` returns a function that renders what a failed request says. A server refusal carries a taxonomy
 * `code` (`lib/errors/codes.ts`) beside its English `error`; the code becomes a sentence through the literal `switch`
 * in `./refusal-sentence.ts`, which this hook loads on demand when it mounts (see that file for why it is not a
 * static import). Until it has arrived, which is before any request a member makes can have failed, a refusal reads
 * as the server's own English, as it did before the taxonomy.
 *
 * `refusalText(error)` falls back, in order, to the server's own `error` text and then to a generic line, so it never
 * returns nothing. `refusalText.maybe(error)` stops before the generic line and returns `undefined`, a drop-in for
 * `serverError(error)` where the caller has a fallback of its own (`refusalText.maybe(e) ?? <the caller's own t() line>`).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { serverError } from '@/lib/http';

export interface RefusalText {
  /** The refusal as a sentence: the code's text, else the server's text, else a generic line. */
  (error: unknown): string;
  /** As above but `undefined` where there is nothing to say, for callers with their own fallback. */
  maybe(error: unknown): string | undefined;
}

export type Translate = (key: string, options: Record<string, unknown>) => string;

/** `codedSentence` from `./refusal-sentence`: a coded refusal's sentence, `undefined` for one with no code. */
export type CodedSentence = (
  t: Translate,
  formatDateTime: (date: Date) => string,
  error: unknown,
) => string | undefined;

let loaded: CodedSentence | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const current = () => loaded;
const onServer = () => null;

/** Load the taxonomy's sentences once per page. A failed load is retried by the next caller. */
export function preloadRefusalSentences(): Promise<void> {
  loading ??= import('./refusal-sentence')
    .then((m) => {
      loaded = m.codedSentence;
      for (const listener of listeners) listener();
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

/**
 * The refusal as a sentence, or `undefined` when there is nothing to say: the code's text from the `errors`
 * namespace (through `coded`, the loaded sentences by default), else the server's own `error`. Pure given `coded`,
 * so the product suite can run it with a fake `t`.
 */
export function refusalSentence(
  t: Translate,
  formatDateTime: (date: Date) => string,
  error: unknown,
  coded: CodedSentence | null = loaded,
): string | undefined {
  return coded?.(t, formatDateTime, error) ?? serverError(error);
}

/** The line for a failure that carries no code and no server text. */
export function genericRefusal(t: Translate): string {
  return t('generic', { ns: 'errors', defaultValue: 'Something went wrong' });
}

export function useRefusalText(): RefusalText {
  const { t } = useTranslation('errors');
  const fmt = useLocaleFormat();
  // A component that renders a refusal while it paints (not only in a handler) renders it again once the sentences
  // arrive, so it never keeps the English. An external store, not state: the hook adds no `useState` to its callers.
  const coded = useSyncExternalStore(subscribe, current, onServer);
  useEffect(() => {
    if (!loaded) void preloadRefusalSentences();
  }, []);
  return useMemo(() => {
    const translate = t as Translate;
    const maybe = (error: unknown): string | undefined =>
      refusalSentence(translate, fmt.dateTime, error, coded ?? loaded);
    const text = (error: unknown): string => maybe(error) ?? genericRefusal(translate);
    return Object.assign(text, { maybe });
  }, [t, fmt, coded]);
}
