/**
 * Removed after a report (sprint 15, feature 16) — the member's own list of items a report took down, in the Account
 * status section of `/settings/security`, where every "Account status" link lands. Each row is the item's kind, its
 * own title when it still exists, the date and where a second look stands; a removal that can be undone offers
 * "Ask for a second look", once, within 14 days. Never the report, its reason, the reporter or the moderator: the
 * server does not send them.
 *
 * Signed out, this renders nothing (the page it sits on is signed-in only).
 */
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { listMyRemovalsApi, requestRemovalReviewApi, type MyRemoval } from '@/lib/moderation/removal-reviews.contract';
import { REMOVAL_REVIEW_NOTE_MAX, restoreLeavesItemOff } from '@/lib/moderation/removal-reviews';
import { reportKindLabel } from '@/components/feed/report-kind-label';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { relativeTimeShort } from '@/lib/utils';

const QUERY_KEY = ['account', 'removals'] as const;

export function RemovalsPanel() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const refusalText = useRefusalText();
  const { t } = useTranslation('removal-appeals');
  const q = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!session?.user,
    retry: false,
    queryFn: () => api(listMyRemovalsApi),
  });

  if (!session?.user) return null;

  const ask = async (id: string, note: string): Promise<boolean> => {
    try {
      await api(requestRemovalReviewApi, { params: { id }, body: note ? { note } : {} });
      toast.success(t('asked-toast', { defaultValue: 'Asked. A moderator will look again.' }));
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
      return true;
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('ask-failed', { defaultValue: 'Could not send your request.' }));
      // A refusal means the list on screen is out of date (already asked, or closed): show what is true now.
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      return false;
    }
  };

  return (
    <RemovalsView
      items={q.data?.items}
      loading={q.isPending}
      failed={q.isError}
      onRetry={() => void q.refetch()}
      onAsk={ask}
    />
  );
}

/** The panel without its data fetching, so it renders on its own (the markup test reads it). */
export function RemovalsView({
  items,
  loading,
  failed,
  onRetry,
  onAsk,
}: {
  items: readonly MyRemoval[] | undefined;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  onAsk: (id: string, note: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('removal-appeals');
  const arrival = useArrival(!loading);
  const isNew = useArrivingKeys((items ?? []).map((r) => r.id));
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SettingsSection
      title={t('title', { defaultValue: 'Removed after a report' })}
      description={t('description', {
        defaultValue:
          'Things of yours a moderator took down after a report. You never see who reported or who decided.',
      })}
    >
      {loading ? (
        <div className="space-y-3" role="status" aria-label={t('loading', { defaultValue: 'Loading your removals' })}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : failed ? (
        <EmptyState
          className={arrival}
          title={t('error', { defaultValue: 'Could not load your removals.' })}
          action={
            onRetry ? (
              <Button variant="default" onClick={onRetry}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            ) : undefined
          }
        />
      ) : !items || items.length === 0 ? (
        <p className={`t-body text-site-text-muted ${arrival ?? ''}`}>
          {t('empty', { defaultValue: 'Nothing of yours has been removed after a report.' })}
        </p>
      ) : (
        <ul className={`divide-y divide-site-border ${arrival ?? ''}`}>
          {items.map((r) => (
            <RemovalRow
              key={r.id}
              removal={r}
              arriving={isNew(r.id)}
              open={openId === r.id}
              onOpen={() => setOpenId(r.id)}
              onClose={() => setOpenId(null)}
              onAsk={onAsk}
            />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function RemovalRow({
  removal: r,
  arriving,
  open,
  onOpen,
  onClose,
  onAsk,
}: {
  removal: MyRemoval;
  arriving: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAsk: (id: string, note: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('removal-appeals');
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const kind = reportKindLabel(t, r.kind);
  const state = stateText(t, r);

  const submit = async () => {
    setBusy(true);
    const done = await onAsk(r.id, note.trim());
    setBusy(false);
    if (done) {
      setNote('');
      onClose();
    }
  };

  return (
    <li className={`space-y-2 py-3 ${arriving ? ARRIVE : ''}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="t-body break-words text-site-text">
            {r.title ? (
              <>
                {kind}
                {': '}
                <bdi>{r.title}</bdi>
              </>
            ) : (
              kind
            )}
          </p>
          <p className="t-meta">
            {t('removed-when', { defaultValue: 'Removed' })}{' '}
            <RelativeTime date={r.removedAt} format={relativeTimeShort} />
          </p>
        </div>
        {state ? <p className="t-label text-site-text">{state}</p> : null}
        {r.canAsk && !open && (
          <Button
            variant="default"
            size="sm"
            aria-label={t('ask-label', { kind, defaultValue: 'Ask for a second look: {{kind}}' })}
            onClick={onOpen}
          >
            {t('ask', { defaultValue: 'Ask for a second look' })}
          </Button>
        )}
      </div>
      {r.canAsk && open && (
        <div className="space-y-2">
          <label htmlFor={noteId} className="t-label">
            {t('note-label', { defaultValue: 'Tell the moderator why (optional)' })}
          </label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={REMOVAL_REVIEW_NOTE_MAX}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="default" disabled={busy} onClick={() => void submit()}>
              {busy ? t('sending', { defaultValue: 'Sending…' }) : t('send', { defaultValue: 'Send request' })}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Where the removal stands, in a short line. A removal that cannot be undone says so instead of offering a request. */
function stateText(t: ReturnType<typeof useTranslation>['t'], r: MyRemoval): string {
  if (r.state === 'restored') {
    return restoreLeavesItemOff(r.kind)
      ? t('state-restored', { defaultValue: 'Restored. You can publish it again.' })
      : t('state-restored-back', { defaultValue: 'Restored. It is back where it was.' });
  }
  if (r.state === 'upheld') return t('state-upheld', { defaultValue: 'A moderator looked again. It stays removed.' });
  if (r.state === 'asked') return t('state-asked', { defaultValue: 'A moderator will look again.' });
  if (!r.reversible) {
    return t('state-final', { defaultValue: 'This was deleted and cannot be restored.' });
  }
  if (!r.canAsk) return t('state-closed', { defaultValue: 'The time to ask for a second look has passed.' });
  return '';
}
