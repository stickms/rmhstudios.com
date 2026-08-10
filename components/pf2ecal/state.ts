'use client';

/**
 * Data and mutations for `/pf2ecal`.
 *
 * The board is a single query. Everything that writes goes through
 * `useCalendarMutation`, which applies the change to the cached board
 * immediately, sends the request, and rolls back on failure — so on a slow
 * connection the UI answers the tap in the same frame and the network catches
 * up behind it. Three things make that safe rather than merely fast:
 *
 * 1. **Cancel in-flight refetches before writing the cache.** A GET that
 *    started before the optimistic write would otherwise land after it and
 *    overwrite the user's own change with the pre-change server state — the
 *    classic "my RSVP flickered back" bug.
 * 2. **Snapshot, and restore on error.** The rollback is the previous cache
 *    value, not an inverse operation, so it is correct even when several
 *    mutations overlapped.
 * 3. **Only invalidate once the last mutation settles.** `isMutating()` is
 *    checked in `onSettled`; refetching while another write is still in flight
 *    reintroduces exactly the race in (1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AnnouncementDTO,
  Availability,
  CalendarStateDTO,
  SessionBlurbDTO,
  SessionDTO,
  SettingsDTO,
} from '@/lib/pf2ecal/types';
import { resolveLocalTimeZone } from '@/lib/pf2ecal/zoned-time';

export const CALENDAR_KEY = ['pf2ecal', 'board'] as const;

/**
 * A failure carrying a machine-readable CODE, not a finished sentence.
 *
 * `request` runs outside React and cannot call `useTranslation`, so the code
 * travels and `useErrorMessage` turns it into words. `serverMessage` is the
 * exception: when the API sends specific prose ("The end time must come after
 * the start time.") that is more useful than any generic code, so it wins.
 */
export type CalendarErrorCode = 'server' | 'signed-out' | 'rate-limited' | 'generic';

export class CalendarRequestError extends Error {
  constructor(
    readonly code: CalendarErrorCode,
    readonly serverMessage?: string,
  ) {
    super(serverMessage ?? code);
    this.name = 'CalendarRequestError';
  }
}

/**
 * Turn any thrown value into a sentence in the viewer's language.
 *
 * Every key below is a LITERAL `t()` call on purpose. `i18next-parser` reads
 * source, not runtime: a lookup table of codes passed to `t(row.key)` extracts
 * nothing, the keys never land in `locales/`, and the UI serves the English
 * `defaultValue` in all 16 languages with nothing failing to say so.
 */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation('r-pf2ecal');
  return (error: unknown) => {
    if (error instanceof CalendarRequestError) {
      if (error.serverMessage) return error.serverMessage;
      switch (error.code) {
        case 'server':
          return t('err-server', {
            defaultValue: 'The server had a problem. Your change was not saved.',
          });
        case 'signed-out':
          return t('err-signed-out', { defaultValue: 'Sign in to make changes.' });
        case 'rate-limited':
          return t('err-rate-limited', {
            defaultValue: 'Too many changes at once — give it a moment.',
          });
        default:
          return t('err-generic', { defaultValue: 'That did not save. Try again.' });
      }
    }
    return t('err-network', {
      defaultValue: 'Could not reach the server. Your change was not saved.',
    });
  };
}

/**
 * Classify a failed response.
 *
 * `defineHandler` returns `{ error }` for 4xx and a bare
 * `{ error: 'Internal Server Error' }` for 500 — deliberately, so a Prisma
 * message never reaches a client. That 500 text is useless to show, which is why
 * the status is checked before the body is read.
 */
async function readError(response: Response): Promise<CalendarRequestError> {
  if (response.status >= 500) return new CalendarRequestError('server');
  if (response.status === 401) return new CalendarRequestError('signed-out');
  if (response.status === 429) return new CalendarRequestError('rate-limited');
  let serverMessage: string | undefined;
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error) serverMessage = data.error;
  } catch {
    // Body was not JSON; the generic message is the best available.
  }
  return new CalendarRequestError('generic', serverMessage);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Read                                                                       */
/* -------------------------------------------------------------------------- */

export function useCalendarBoard() {
  return useQuery({
    queryKey: CALENDAR_KEY,
    queryFn: ({ signal }) => request<CalendarStateDTO>('/api/pf2ecal', { signal }),
    // The board is small and shared, and someone else moving a session is
    // exactly the update you came to the page for — so it revalidates on focus
    // (overriding the app-wide default) but stays fresh for half a minute so
    // switching tabs repeatedly does not hammer it.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // A calendar left open on a second monitor should not be lying by dinner.
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}

/** True while any write is in flight — used to defer refetches and show chrome. */
export function useCalendarBusy(): boolean {
  return useIsMutating({ mutationKey: CALENDAR_KEY }) > 0;
}

/* -------------------------------------------------------------------------- */
/* Cache helpers                                                              */
/* -------------------------------------------------------------------------- */

type Patch = (state: CalendarStateDTO) => CalendarStateDTO;

/** Replace one session in the board, keeping chronological order. */
export function replaceSession(session: SessionDTO): Patch {
  return (state) => {
    const without = state.sessions.filter((s) => s.id !== session.id);
    return {
      ...state,
      sessions: [...without, session].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
  };
}

export function removeSession(id: string): Patch {
  return (state) => ({ ...state, sessions: state.sessions.filter((s) => s.id !== id) });
}

export function replaceAnnouncement(announcement: AnnouncementDTO): Patch {
  return (state) => {
    const without = state.announcements.filter((a) => a.id !== announcement.id);
    return {
      ...state,
      announcements: [announcement, ...without].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    };
  };
}

/** Replace the board's settings block after a save. */
export function replaceSettings(settings: SettingsDTO): Patch {
  return (state) => ({ ...state, settings });
}

export function removeAnnouncement(id: string): Patch {
  return (state) => ({
    ...state,
    announcements: state.announcements.filter((a) => a.id !== id),
  });
}

/**
 * Apply the viewer's own answer to a session in the cache.
 *
 * Written as a cache patch rather than as a refetch because this is the
 * page's most-tapped control and the one most likely to be tapped on a phone
 * with two bars: the pill has to fill instantly or the user taps it again.
 */
export function applyOwnResponse(
  sessionId: string,
  viewerId: string,
  viewerName: string,
  status: Availability | null,
  note: string | null,
): Patch {
  return (state) => ({
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      const others = session.responses.filter((r) => r.userId !== viewerId);
      if (status === null) return { ...session, responses: others };
      const previous = session.responses.find((r) => r.userId === viewerId);
      return {
        ...session,
        responses: [
          {
            userId: viewerId,
            status,
            note,
            name: previous?.name ?? viewerName,
            image: previous?.image ?? null,
            updatedAt: new Date().toISOString(),
          },
          ...others,
        ],
      };
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

interface MutationConfig<TVars, TData> {
  /** Performs the request. */
  send: (vars: TVars) => Promise<TData>;
  /** Cache patch applied before the request goes out. */
  optimistic?: (vars: TVars) => Patch;
  /** Cache patch applied to the server's authoritative answer. */
  settle?: (data: TData, vars: TVars) => Patch;
  /** Shown as a toast on success. Omit for controls that speak for themselves. */
  successMessage?: string;
}

/**
 * The one write path. See the module note for why each step is here.
 *
 * Every mutation shares `CALENDAR_KEY` as its mutation key so `useCalendarBusy`
 * and the deferred-invalidation check in `onSettled` can see all of them.
 */
export function useCalendarMutation<TVars, TData>({
  send,
  optimistic,
  settle,
  successMessage,
}: MutationConfig<TVars, TData>) {
  const queryClient = useQueryClient();
  const describeError = useErrorMessage();

  return useMutation({
    mutationKey: CALENDAR_KEY,
    mutationFn: send,

    async onMutate(vars: TVars) {
      // (1) Stop any GET already on the wire from landing on top of the patch.
      await queryClient.cancelQueries({ queryKey: CALENDAR_KEY });
      // (2) Snapshot for rollback.
      const previous = queryClient.getQueryData<CalendarStateDTO>(CALENDAR_KEY);
      if (optimistic && previous) {
        queryClient.setQueryData<CalendarStateDTO>(CALENDAR_KEY, optimistic(vars)(previous));
      }
      return { previous };
    },

    onError(error: Error, _vars, context) {
      if (context?.previous) {
        queryClient.setQueryData<CalendarStateDTO>(CALENDAR_KEY, context.previous);
      }
      toast.error(describeError(error));
    },

    onSuccess(data: TData, vars: TVars) {
      if (settle) {
        const current = queryClient.getQueryData<CalendarStateDTO>(CALENDAR_KEY);
        if (current) {
          queryClient.setQueryData<CalendarStateDTO>(CALENDAR_KEY, settle(data, vars)(current));
        }
      }
      if (successMessage) toast.success(successMessage);
    },

    onSettled() {
      // (3) Only the last write standing gets to trigger the refetch.
      if (queryClient.isMutating({ mutationKey: CALENDAR_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
      }
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Request helpers used by the components                                     */
/* -------------------------------------------------------------------------- */

export const api = {
  createSession: (body: unknown) =>
    request<{ session: SessionDTO }>('/api/pf2ecal/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSession: (id: string, body: unknown) =>
    request<{ session: SessionDTO }>(`/api/pf2ecal/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/api/pf2ecal/sessions/${id}`, { method: 'DELETE' }),
  respond: (id: string, body: unknown) =>
    request<{ session: SessionDTO }>(`/api/pf2ecal/sessions/${id}/response`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  clearResponse: (id: string) =>
    request<{ session: SessionDTO }>(`/api/pf2ecal/sessions/${id}/response`, {
      method: 'DELETE',
    }),
  createAnnouncement: (body: unknown) =>
    request<{ announcement: AnnouncementDTO }>('/api/pf2ecal/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAnnouncement: (id: string, body: unknown) =>
    request<{ ok: true }>(`/api/pf2ecal/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAnnouncement: (id: string) =>
    request<{ deleted: boolean }>(`/api/pf2ecal/announcements/${id}`, { method: 'DELETE' }),
  saveSettings: (body: unknown) =>
    request<{ settings: SettingsDTO }>('/api/pf2ecal/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  testWebhook: (webhookUrl: string) =>
    request<{ ok: true }>('/api/pf2ecal/settings/test-webhook', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }),
  blurbs: (ids: string[], signal?: AbortSignal) =>
    request<{ blurbs: Record<string, SessionBlurbDTO>; configured: boolean }>(
      '/api/pf2ecal/sessions/blurbs',
      { method: 'POST', body: JSON.stringify({ ids }), signal },
    ),
};

/** Merge generated descriptions into the cached board. */
export function applyBlurbs(blurbs: Record<string, SessionBlurbDTO>): Patch {
  return (state) => ({
    ...state,
    sessions: state.sessions.map((session) =>
      blurbs[session.id] ? { ...session, blurb: blurbs[session.id] } : session,
    ),
  });
}

/** Seed the cache from the route loader so the first paint has real data. */
export function seedBoard(queryClient: QueryClient, state: CalendarStateDTO): void {
  queryClient.setQueryData<CalendarStateDTO>(CALENDAR_KEY, state);
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The viewer's timezone, resolved after mount.
 *
 * Deliberately NOT resolved during render: the server has no idea what zone the
 * viewer is in, so formatting with the real zone on the first client render
 * would mismatch every server-rendered time and React would throw the whole
 * tree away. Starting from the campaign zone and switching in an effect means
 * the first paint is consistent and the correct times arrive a frame later.
 */
export function useLocalTimeZone(): string {
  const [timeZone, setTimeZone] = useState<string>('America/New_York');
  useEffect(() => {
    setTimeZone(resolveLocalTimeZone());
  }, []);
  return timeZone;
}

/**
 * `navigator.onLine`, kept current.
 *
 * Used to tell the user their change is queued rather than lost when they are
 * offline — `fetch` fails immediately with a network error in that case, and
 * "That did not save" alone does not explain why.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** A stable "now", ticking once a minute — for relative labels and the today marker. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/* -------------------------------------------------------------------------- */
/* Rendering a long board                                                     */
/* -------------------------------------------------------------------------- */

/** How many session cards enter the DOM at a time. */
export const AGENDA_PAGE = 8;

/**
 * Render a long list a page at a time, growing as the end of it approaches.
 *
 * The board holds a rolling six months, so a weekly game is ~26 upcoming
 * sessions today and a busier table with one-offs is more. Every card carries an
 * availability picker, a roster summary, a `layout` animation and now a
 * generated description; mounting all of them to show the eight that fit on a
 * phone is work nobody asked for, and it is paid on every load.
 *
 * The sentinel is watched with a 600px root margin, so the next page is in the
 * DOM before the user reaches the bottom and the growth is never something they
 * wait for. Where `IntersectionObserver` does not exist the whole list renders
 * at once — degraded to exactly the behaviour this replaced, never to a list
 * with items missing from it.
 *
 * This is only half the story: revealing a card is not the same as paying to
 * paint it, and `.pf2e-cull` (`content-visibility: auto`) is what keeps the ones
 * that have scrolled away from costing layout. The two are complementary — this
 * bounds the DOM, that bounds the rendering.
 */
export function useProgressiveList<T>(
  items: T[],
  pageSize: number = AGENDA_PAGE,
): { visible: T[]; hidden: number; sentinelRef: (node: HTMLElement | null) => void } {
  const [limit, setLimit] = useState(pageSize);
  const [node, setNode] = useState<HTMLElement | null>(null);

  // A shorter list (someone deleted a session, or the filter changed) must pull
  // the limit back down, or "show 8 more" would already be exhausted.
  const total = items.length;
  useEffect(() => {
    setLimit((current) => Math.min(Math.max(pageSize, current), Math.max(pageSize, total)));
  }, [pageSize, total]);

  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver !== 'function') {
      setLimit(total);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => current + pageSize);
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, pageSize, total]);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  return { visible, hidden: Math.max(0, total - visible.length), sentinelRef: setNode };
}

/**
 * Fill in the AI descriptions for the sessions currently on screen.
 *
 * Only for what is rendered, and only for what is missing one: the endpoint
 * spends money per session, so asking about a card nobody has scrolled to would
 * be paying for something no one will read. As `useProgressiveList` reveals more
 * cards this runs again for the new ones.
 *
 * ## Failing safe is the point
 *
 * Every outcome except success is silent. There is no toast, no error row, and
 * nothing disappears from the page — a session with no description renders the
 * notes someone typed, which is what it did before this feature existed. The
 * three things that can go wrong are handled separately because they want
 * different answers:
 *
 * - **No AI configured.** The response says so once and this stops asking for
 *   the rest of the visit. Retrying a key that is not set is pure noise.
 * - **A request failed.** Retried with exponential backoff, up to three times
 *   across the visit, then left alone. The server retries the *model* — including
 *   when it answers in the wrong shape — so what is left here is the network.
 * - **The server answered without some ids.** Those sessions are remembered as
 *   attempted so the next reveal does not ask for them again in a loop. They
 *   will be picked up on a later page load, by which point DeepSeek may be back.
 */
export function useSessionBlurbs(visibleSessions: SessionDTO[], enabled: boolean): void {
  const queryClient = useQueryClient();
  // Refs, not state: none of this is rendered, and putting it in state would
  // re-run the effect that writes it.
  const attempted = useRef(new Set<string>());
  const failures = useRef(0);
  const stopped = useRef(false);
  const busy = useRef(false);

  const wanted = visibleSessions
    .filter((session) => !session.blurb && !attempted.current.has(session.id))
    .map((session) => session.id)
    .slice(0, 6)
    .join(',');

  useEffect(() => {
    if (!enabled || !wanted || stopped.current || busy.current) return;
    const ids = wanted.split(',');
    busy.current = true;
    const controller = new AbortController();
    let timer: number | undefined;

    const run = () => {
      api
        .blurbs(ids, controller.signal)
        .then((data) => {
          for (const id of ids) attempted.current.add(id);
          if (!data.configured) {
            stopped.current = true;
            return;
          }
          failures.current = 0;
          if (Object.keys(data.blurbs).length === 0) return;
          const current = queryClient.getQueryData<CalendarStateDTO>(CALENDAR_KEY);
          if (current) {
            queryClient.setQueryData<CalendarStateDTO>(
              CALENDAR_KEY,
              applyBlurbs(data.blurbs)(current),
            );
          }
        })
        .catch(() => {
          failures.current += 1;
          if (failures.current >= 3) {
            stopped.current = true;
            return;
          }
          // Back off and let the next render re-enter, rather than looping here
          // — by then the visible set may have changed and the retry should be
          // for whatever is on screen now.
          timer = window.setTimeout(
            () => {
              busy.current = false;
            },
            1000 * 2 ** failures.current,
          );
        })
        .finally(() => {
          if (timer === undefined) busy.current = false;
        });
    };

    run();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      busy.current = false;
    };
  }, [enabled, wanted, queryClient]);
}

/** Copy to clipboard with a toast, shared by the two subscribe controls. */
export function useCopy(): (value: string, label: string) => void {
  const { t } = useTranslation('r-pf2ecal');
  return useCallback(
    (value: string, label: string) => {
      void navigator.clipboard
        .writeText(value)
        .then(() => toast.success(t('copied', { defaultValue: '{{label}} copied', label })))
        .catch(() =>
          toast.error(
            t('copy-failed', {
              defaultValue: 'Could not copy — select the link and copy it manually.',
            }),
          ),
        );
    },
    [t],
  );
}
