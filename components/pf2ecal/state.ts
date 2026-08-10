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

import { useCallback, useEffect, useState } from 'react';
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
};

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
