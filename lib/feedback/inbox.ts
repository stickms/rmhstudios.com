/** Feedback inbox, pure parts: statuses, outcomes, the context a member can send, and the keyset cursor. Client-safe. */
import {
  CONTEXT_CAPS,
  stripQuery,
  type FeedbackContext,
} from '@/lib/feedback-schema';

export { stripQuery };

export const FEEDBACK_STATUSES =
  [
    'new',
    'in_progress',
    'closed',
  ] as const;
export type FeedbackStatus =
  (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_OUTCOMES =
  [
    'fixed',
    'wont_fix',
    'duplicate',
    'not_reproducible',
    'answered',
  ] as const;
export type FeedbackOutcome =
  (typeof FEEDBACK_OUTCOMES)[number];

export const NOTE_MAX = 1000;
export const REPLY_MAX = 1000;
export const INBOX_PAGE_SIZE = 25;
/** The text search looks at no more than this many of the newest rows. */
export const SEARCH_WINDOW = 5000;

/** The items the form lists, each with its own checkbox, in the order they are shown. */
export const CONTEXT_ITEMS =
  [
    'path',
    'viewport',
    'edition',
    'locale',
    'build',
    'errors',
  ] as const;
export type ContextItem =
  (typeof CONTEXT_ITEMS)[number];

/** The slice of `window` the collector reads; a test passes a fake. */
export interface ContextEnv {
  location: {
    pathname: string;
  };
  innerWidth: number;
  innerHeight: number;
  document: {
    documentElement: {
      lang: string;
      className: string;
    };
  };
}

/** `Day`, `Night`, or the id of a bought theme, read from the `style-*` class on the root. */
export function editionOf(
  className: string,
): string {
  const style =
    /(?:^|\s)style-([a-z0-9-]+)/.exec(
      className,
    )?.[1];
  if (
    !style ||
    style ===
      'default'
  )
    return 'Day';
  if (
    style ===
    'graphite'
  )
    return 'Night';
  return style.slice(
    0,
    CONTEXT_CAPS.edition,
  );
}

/** Everything that could be sent, collected once on submit. Messages only for errors, never stacks. */
export function collectContext(
  env: ContextEnv,
  recentErrors: readonly string[],
): Required<
  Omit<
    FeedbackContext,
    'where'
  >
> {
  const root =
    env
      .document
      .documentElement;
  return {
    path:
      stripQuery(
        env
          .location
          .pathname ||
          '/',
      ).slice(
        0,
        CONTEXT_CAPS.path,
      ) ||
      '/',
    viewport: `${Math.round(env.innerWidth)}x${Math.round(env.innerHeight)}`,
    edition:
      editionOf(
        root.className,
      ),
    locale:
      (
        root.lang ||
        'en'
      ).slice(
        0,
        CONTEXT_CAPS.locale,
      ),
    build:
      'current',
    errors:
      recentErrors
        .slice(
          -CONTEXT_CAPS.errors,
        )
        .map(
          (
            m,
          ) =>
            m.slice(
              0,
              CONTEXT_CAPS.errorMessage,
            ),
        ),
  };
}

/** Only the ticked items. An empty error list is not an item worth sending. */
export function pickContext(
  all: ReturnType<
    typeof collectContext
  >,
  ticked: ReadonlySet<ContextItem>,
): FeedbackContext {
  const out: FeedbackContext =
    {};
  if (
    ticked.has(
      'path',
    )
  )
    out.path =
      all.path;
  if (
    ticked.has(
      'viewport',
    )
  )
    out.viewport =
      all.viewport;
  if (
    ticked.has(
      'edition',
    )
  )
    out.edition =
      all.edition;
  if (
    ticked.has(
      'locale',
    )
  )
    out.locale =
      all.locale;
  if (
    ticked.has(
      'build',
    )
  )
    out.build =
      all.build;
  if (
    ticked.has(
      'errors',
    ) &&
    all
      .errors
      .length >
      0
  )
    out.errors =
      all.errors;
  return out;
}

/** The first non-empty line of a message, cut to `max` characters. */
export function firstLine(
  message: string,
  max = 120,
): string {
  const line =
    message
      .split(
        /\r?\n/,
      )
      .find(
        (
          l,
        ) =>
          l.trim() !==
          '',
      ) ??
    '';
  const t =
    line.trim();
  return t.length >
    max
    ? `${t.slice(0, max - 1)}…`
    : t;
}

/** A status change is valid when a closed row has an outcome and any other row has none. Returns an error id or null. */
export function statusChangeError(
  status: FeedbackStatus,
  outcome:
    | FeedbackOutcome
    | undefined,
):
  | 'outcome-required'
  | 'outcome-only-when-closed'
  | null {
  if (
    status ===
    'closed'
  )
    return outcome
      ? null
      : 'outcome-required';
  return outcome
    ? 'outcome-only-when-closed'
    : null;
}

/** Keyset cursor over (createdAt desc, id desc): `<epoch ms>_<id>`. */
export function encodeCursor(row: {
  createdAt: Date;
  id: string;
}): string {
  return `${row.createdAt.getTime()}_${row.id}`;
}

export function decodeCursor(
  cursor: string,
): {
  createdAt: Date;
  id: string;
} | null {
  const m =
    /^(\d{1,15})_([A-Za-z0-9_-]{1,40})$/.exec(
      cursor,
    );
  if (
    !m
  )
    return null;
  const d =
    new Date(
      Number(
        m[1],
      ),
    );
  return Number.isNaN(
    d.getTime(),
  )
    ? null
    : {
        createdAt:
          d,
        id: m[2]!,
      };
}

/** Escape LIKE wildcards so a member's search text is matched literally. */
export function likePattern(
  q: string,
): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
