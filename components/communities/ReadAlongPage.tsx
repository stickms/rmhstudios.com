/**
 * s11-09 — a community's read-along page: the book, the parts with their dates and threads, the readers, and the
 * viewer's own place. Rows on rules, no boxes, no reply or like count. The page arrives from the route loader; a join,
 * a mark or a moderator's action re-runs the loader (`router.invalidate`), so what shows is always the server's copy.
 *
 * Member names are wrapped in `<bdi>` and book titles and part labels carry `dir="auto"` (member-written text).
 */
import { lazy, useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useSession } from '@/components/Providers';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSanctionRefusal } from '@/components/communities/useSanctionRefusal';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import {
  joinReadAlongApi,
  leaveReadAlongApi,
  readAlongProgressApi,
  updateReadAlongApi,
} from '@/lib/communities/read-along.contract';
import type { PartDTO, PauseReason, PersonDTO, ReadAlongPageDTO } from '@/lib/communities/read-along';

const EditParts = lazy(() => import('@/components/communities/ReadAlongStart').then((m) => ({ default: m.EditParts })));

const personName = (p: PersonDTO) => p.name ?? p.handle ?? p.id;

export function ReadAlongPage({ data }: { data: ReadAlongPageDTO }) {
  const { t } = useTranslation('read-alongs');
  const fmt = useLocaleFormat();
  const router = useRouter();
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const sanctionText = useSanctionRefusal();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const params = { slug: data.communitySlug, id: data.id };
  const fail = (err: unknown) =>
    toast.error(
      sanctionText(err) ||
        refusalText.maybe(err) ||
        t('action-failed', { defaultValue: 'Could not do that. Try again.' }),
    );
  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) toast.success(done);
      await router.invalidate();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const weekdayName = new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 7 + data.weekday)),
  );
  const openedParts = data.parts.filter((p) => p.opened);
  const current = openedParts[openedParts.length - 1] ?? data.parts[0];
  const ended = data.status === 'cancelled' || data.status === 'done';

  const statusLine = () => {
    switch (data.status) {
      case 'paused':
        return t('status-paused', { defaultValue: 'Paused' });
      case 'cancelled':
        return t('status-cancelled', { defaultValue: 'Cancelled. The threads already posted stay.' });
      case 'done':
        return t('status-done', { defaultValue: 'Finished' });
      default:
        return t('status-active', { defaultValue: 'Running' });
    }
  };

  const pauseText = (reason: PauseReason | null) => {
    switch (reason) {
      case 'author_not_moderator':
        return t('paused-author', {
          defaultValue: 'The moderator who started it is no longer a moderator here. Resume it to post as you.',
        });
      case 'author_sanctioned':
        return t('paused-sanctioned', { defaultValue: 'The moderator who started it cannot post here right now.' });
      case 'held_by_automod':
        return t('paused-automod', { defaultValue: 'AutoMod would have held the next part, so it was not posted.' });
      case 'gate_refused':
        return t('paused-refused', {
          defaultValue: 'The community rules refused the next part, so it was not posted.',
        });
      case 'community_gone':
        return t('paused-community', { defaultValue: 'The community is not available.' });
      case 'publish_failed':
        return t('paused-failed', { defaultValue: 'Posting the next part failed several times.' });
      default:
        return t('paused-manual', { defaultValue: 'Paused by a moderator.' });
    }
  };

  const libraryPage = (part: PartDTO | undefined) => ({ page: part ? part.startPage : 1 });

  const join = () =>
    run(() => api(joinReadAlongApi, { params, body: {} }), t('joined', { defaultValue: 'You joined this read-along' }));
  const leave = async () => {
    const ok = await confirm({
      title: t('leave-confirm', { defaultValue: 'Leave this read-along?' }),
      description: t('leave-confirm-hint', { defaultValue: 'Your progress is removed. You can join again later.' }),
      confirmLabel: t('leave', { defaultValue: 'Leave' }),
      danger: true,
    });
    if (ok) await run(() => api(leaveReadAlongApi, { params }));
  };
  const setNotify = (notify: boolean) => run(() => api(joinReadAlongApi, { params, body: { notify } }));
  const mark = (part: number) => run(() => api(readAlongProgressApi, { params, body: { part } }));

  const cancel = async () => {
    const ok = await confirm({
      title: t('cancel-confirm', { defaultValue: 'Cancel this read-along?' }),
      description: t('cancel-confirm-hint', {
        defaultValue: 'No more parts are posted. Threads already posted stay. The cancellation is logged.',
      }),
      confirmLabel: t('cancel', { defaultValue: 'Cancel read-along' }),
      danger: true,
    });
    if (ok) await run(() => api(updateReadAlongApi, { params, body: { action: 'cancel' } }));
  };
  const resume = () =>
    run(
      () => api(updateReadAlongApi, { params, body: { action: 'resume' } }),
      t('resumed', { defaultValue: 'The read-along is running again' }),
    );

  return (
    <div className="flex flex-col px-4 py-4">
      <Link to="/c/$slug" params={{ slug: data.communitySlug }} className="t-meta underline">
        <bdi>{data.communityName}</bdi>
      </Link>
      <h1 className="t-title mt-2 break-words" dir="auto">
        {data.bookTitle}
      </h1>
      <p className="t-body mt-1 text-site-text-muted">
        {t('schedule', {
          weekday: weekdayName,
          time: data.time,
          zone: data.timeZone,
          defaultValue: 'A part opens every {{weekday}} at {{time}} ({{zone}})',
        })}
      </p>
      <p className="t-meta mt-1">
        {statusLine()}
        {data.startedBy && (
          <>
            {' · '}
            {t('started-by', { defaultValue: 'Started by' })} <bdi>{personName(data.startedBy)}</bdi>
          </>
        )}
      </p>

      {data.canManage && data.status === 'paused' && (
        <div className="mt-3 flex flex-col gap-2 border-y border-site-border py-3" role="status">
          <p className="t-body">{pauseText(data.pausedReason)}</p>
          <div>
            <Button variant="primary" size="sm" onClick={() => void resume()} disabled={busy}>
              {t('resume', { defaultValue: 'Resume' })}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to="/library/$slug"
          params={{ slug: data.docSlug }}
          search={libraryPage(current)}
          className="t-body underline"
        >
          {t('open-library', { defaultValue: 'Open in the library' })}
        </Link>
        {!signedIn ? null : data.me ? (
          <Button variant="ghost" size="sm" onClick={() => void leave()} disabled={busy}>
            {t('leave', { defaultValue: 'Leave' })}
          </Button>
        ) : (
          data.canJoin && (
            <Button variant="primary" size="sm" onClick={() => void join()} disabled={busy}>
              {t('join', { defaultValue: 'Join' })}
            </Button>
          )
        )}
      </div>

      {signedIn && !data.me && !data.canJoin && !ended && (
        <p className="t-meta mt-2">
          {t('cannot-join', {
            defaultValue: 'You can join once you are a member of this community and not timed out.',
          })}
        </p>
      )}

      {!signedIn && (
        <SignedOutPrompt
          title={t('signed-out-title', { defaultValue: 'Sign in to join' })}
          description={t('signed-out-hint', {
            defaultValue: 'Members of the community can join and mark the parts they have finished.',
          })}
          callbackURL={`/c/${data.communitySlug}/read/${data.id}`}
        />
      )}

      {data.me && (
        <div className="mt-3 flex items-center gap-3">
          <Switch
            id="read-along-notify"
            checked={data.me.notify}
            onCheckedChange={(v) => void setNotify(v)}
            disabled={busy}
            aria-labelledby="read-along-notify-label"
          />
          <Label id="read-along-notify-label" htmlFor="read-along-notify">
            {t('notify', { defaultValue: 'Tell me when a part opens' })}
          </Label>
        </div>
      )}

      <h2 className="t-heading mt-8">{t('parts-heading', { defaultValue: 'Parts' })}</h2>
      <ol className="mt-2 flex flex-col">
        {data.parts.map((part) => {
          const done = data.me ? data.me.lastPartDone >= part.position : false;
          return (
            <li key={part.id} className="flex flex-col gap-1.5 border-b border-site-border py-3">
              <p className="t-body font-medium break-words" dir="auto">
                {part.label}
              </p>
              <p className="t-meta">
                {t('pages', { start: part.startPage, end: part.endPage, defaultValue: 'Pages {{start}} to {{end}}' })}
                {' · '}
                {part.opened
                  ? t('opened-on', { date: fmt.dateTime(part.opensAt), defaultValue: 'Opened {{date}}' })
                  : ended
                    ? t('not-opened', { defaultValue: 'Not opened' })
                    : t('opens-on', { date: fmt.dateTime(part.opensAt), defaultValue: 'Opens {{date}}' })}
              </p>
              {part.opened && (
                <div className="flex flex-wrap items-center gap-3">
                  {part.postId && (
                    <Link to="/thread/$rootId" params={{ rootId: part.postId }} className="t-body underline">
                      {t('open-thread', { defaultValue: 'Open the discussion' })}
                    </Link>
                  )}
                  <Link
                    to="/library/$slug"
                    params={{ slug: data.docSlug }}
                    search={libraryPage(part)}
                    className="t-body underline"
                  >
                    {t('open-library-part', { defaultValue: 'Read this part' })}
                  </Link>
                  {data.me && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={done}
                      onClick={() => void mark(done ? part.position - 1 : part.position)}
                      disabled={busy}
                    >
                      {done
                        ? t('finished-undo', { defaultValue: 'Finished. Undo' })
                        : t('finished', { defaultValue: "I've finished this part" })}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {data.canManage && !ended && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.editable && (
            <Button variant="default" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              {t('edit-parts', { defaultValue: 'Edit the parts' })}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void cancel()} disabled={busy}>
            {t('cancel', { defaultValue: 'Cancel read-along' })}
          </Button>
        </div>
      )}

      <h2 className="t-heading mt-8">
        {t('readers-heading', { count: data.readerCount, defaultValue: 'Readers ({{count}})' })}
      </h2>
      {data.readers === null ? (
        <p className="t-meta mt-2">
          {t('readers-members-only', { defaultValue: 'Members of the community can see who is reading.' })}
        </p>
      ) : data.readers.length === 0 ? (
        <EmptyState
          title={t('readers-empty', { defaultValue: 'No readers yet' })}
          description={t('readers-empty-hint', { defaultValue: 'Join to be the first.' })}
        />
      ) : (
        <ul className="mt-2 flex flex-col">
          {data.readers.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-site-border py-2">
              <span className="t-body min-w-0 break-words">
                <bdi>{personName(r)}</bdi>
              </span>
              <span className="t-meta shrink-0">
                {r.lastPartDone > 0
                  ? t('through-part', { n: r.lastPartDone, defaultValue: 'Finished part {{n}}' })
                  : t('not-started', { defaultValue: 'Not started' })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ArrivalSuspense fallback={null}>
          <EditParts
            data={data}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              void router.invalidate();
            }}
          />
        </ArrivalSuspense>
      )}
    </div>
  );
}
