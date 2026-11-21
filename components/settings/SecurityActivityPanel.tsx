/**
 * "Recent activity" on /settings/security: the member's own security log, newest first, 30 a page.
 * Each row is an icon, a sentence, a time (exact time on hover, `<time datetime>`), "This device" on the
 * current session's events, and a "Not you?" line under the events someone else could have caused.
 * The filter is the shared `Tabs`; the log downloads as CSV.
 */

import { useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AtSign,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  Merge,
  ShieldAlert,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api, apiUrl } from '@/lib/contract/client';
import {
  exportSecurityActivityApi,
  getSecurityActivityApi,
  type SecurityActivityItem,
} from '@/lib/auth/security-log.contract';
import { isUnfamiliarEvent, type SecurityEventKind, type SecurityFilter } from '@/lib/auth/security-log';
import { PROVIDER_NAMES, isSignInProviderId } from '@/lib/auth/providers';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useLiveNow } from '@/components/ui/RelativeTime';
import { cn } from '@/lib/utils';

const ICONS: Record<SecurityEventKind, LucideIcon> = {
  sign_in: LogIn,
  sign_in_new_device: ShieldAlert,
  sign_out: LogOut,
  session_revoked: LogOut,
  other_sessions_revoked: LogOut,
  method_connected: LogIn,
  method_removed: LogOut,
  account_merged: Merge,
  passkey_added: KeyRound,
  passkey_removed: KeyRound,
  password_changed: KeyRound,
  password_reset_requested: KeyRound,
  password_reset_completed: KeyRound,
  email_changed: AtSign,
  handle_changed: UserRound,
  deletion_scheduled: Trash2,
  deletion_cancelled: Trash2,
};

function providerLabel(id: string | undefined): string {
  if (!id) return '';
  return isSignInProviderId(id) ? PROVIDER_NAMES[id] : id;
}

/** The sentence for one event. Every string is a literal key so the extractor finds it. */
function sentence(t: TFunction, item: SecurityActivityItem): string {
  const device = item.device ?? '';
  const provider = providerLabel(item.detail?.providerId);
  const providers = (item.detail?.providerIds ?? []).map(providerLabel).join(', ');
  switch (item.kind) {
    case 'sign_in':
      return device
        ? t('event-sign-in-device', { device, defaultValue: 'Signed in on {{device}}' })
        : t('event-sign-in', { defaultValue: 'Signed in' });
    case 'sign_in_new_device':
      return device
        ? t('event-sign-in-new-device-device', {
            device,
            defaultValue: 'Signed in from a new device: {{device}}',
          })
        : t('event-sign-in-new-device', { defaultValue: 'Signed in from a new device' });
    case 'sign_out':
      return device
        ? t('event-sign-out-device', { device, defaultValue: 'Signed out on {{device}}' })
        : t('event-sign-out', { defaultValue: 'Signed out' });
    case 'session_revoked':
      return device
        ? t('event-session-revoked-device', { device, defaultValue: 'Session ended on {{device}}' })
        : t('event-session-revoked', { defaultValue: 'Session ended' });
    case 'other_sessions_revoked':
      return t('event-other-sessions-revoked', { defaultValue: 'Signed out of other devices' });
    case 'method_connected':
      return provider
        ? t('event-method-connected-provider', {
            provider,
            defaultValue: '{{provider}} connected as a sign-in method',
          })
        : t('event-method-connected', { defaultValue: 'Sign-in method connected' });
    case 'method_removed':
      return provider
        ? t('event-method-removed-provider', {
            provider,
            defaultValue: '{{provider}} removed as a sign-in method',
          })
        : t('event-method-removed', { defaultValue: 'Sign-in method removed' });
    case 'account_merged':
      return providers
        ? t('event-account-merged-providers', {
            providers,
            defaultValue: 'Another account was merged in: {{providers}}',
          })
        : t('event-account-merged', { defaultValue: 'Another account was merged in' });
    case 'passkey_added':
      return t('event-passkey-added', { defaultValue: 'Passkey added' });
    case 'passkey_removed':
      return t('event-passkey-removed', { defaultValue: 'Passkey removed' });
    case 'password_changed':
      return t('event-password-changed', { defaultValue: 'Password changed' });
    case 'password_reset_requested':
      return t('event-password-reset-requested', { defaultValue: 'Password reset requested' });
    case 'password_reset_completed':
      return t('event-password-reset-completed', {
        defaultValue: 'Password reset. Every device was signed out and coin transfers are paused for 72 hours',
      });
    case 'email_changed':
      return t('event-email-changed', { defaultValue: 'Email change requested' });
    case 'handle_changed':
      return item.detail?.oldHandle && item.detail.newHandle
        ? t('event-handle-changed-names', {
            oldHandle: item.detail.oldHandle,
            newHandle: item.detail.newHandle,
            defaultValue: 'Handle changed from @{{oldHandle}} to @{{newHandle}}',
          })
        : t('event-handle-changed', { defaultValue: 'Handle changed' });
    case 'deletion_scheduled':
      return t('event-deletion-scheduled', { defaultValue: 'Account deletion scheduled' });
    case 'deletion_cancelled':
      return t('event-deletion-cancelled', { defaultValue: 'Account deletion cancelled' });
  }
}

/**
 * The "Not you?" line is one translatable string with `<sessions>` and `<methods>` markers, so a
 * language can reorder the sentence; the markers become links to the two panels.
 */
function notYouLine(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(sessions|methods)>(.*?)<\/\1>/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={m.index} className="underline" href={m[1] === 'sessions' ? '#sessions' : '#sign-in-methods'}>
        {m[2]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function ActivityTime({ iso }: { iso: string }) {
  const now = useLiveNow();
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={new Date(ms).toLocaleString()}
      className="t-meta text-site-text-muted"
    >
      {now === null ? iso.slice(0, 10) : formatDistanceToNow(ms, { addSuffix: true })}
    </time>
  );
}

export function SecurityActivityPanel() {
  const { t } = useTranslation('security-activity');
  const { data: session } = useSession();
  const [filter, setFilter] = useState<SecurityFilter>('all');

  const query = useInfiniteQuery({
    queryKey: [getSecurityActivityApi.path, filter],
    enabled: !!session?.user,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api(getSecurityActivityApi, {
        query: { filter, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const loading = query.isPending && !query.isError;
  const arrival = useArrival(!loading);
  const arrived = useArrivingKeys(items.map((i) => i.id));

  const tabs = [
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
    { id: 'sign-ins', label: t('filter-sign-ins', { defaultValue: 'Sign-ins' }) },
    { id: 'methods', label: t('filter-methods', { defaultValue: 'How you sign in' }) },
    { id: 'account', label: t('filter-account', { defaultValue: 'Account' }) },
  ];

  return (
    <SettingsSection
      id="recent-activity"
      title={t('title', { defaultValue: 'Recent activity' })}
      description={t('description', {
        defaultValue:
          'Sign-ins, sessions ended and changes to how you sign in, kept for a year. Devices are named by browser and system only.',
      })}
      action={
        <Button variant="default" size="sm" asChild>
          <a href={apiUrl(exportSecurityActivityApi)} download>
            <Download aria-hidden />
            {t('download', { defaultValue: 'Download CSV' })}
          </a>
        </Button>
      }
    >
      <Tabs
        tabs={tabs}
        value={filter}
        onChange={(id) => setFilter(id as SecurityFilter)}
        aria-label={t('filter-label', { defaultValue: 'Filter activity' })}
      />

      {loading ? (
        <div className="mt-2" role="status" aria-label={t('loading', { defaultValue: 'Loading activity' })}>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 border-b border-site-border py-3">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title={t('error-title', { defaultValue: 'Could not load activity.' })}
          description={t('error-description', { defaultValue: 'Check your connection and try again.' })}
          action={
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No activity yet.' })}
          description={t('empty-description', {
            defaultValue: 'Sign-ins and changes to your account will appear here.',
          })}
        />
      ) : (
        <ul className={cn('mt-2', arrival)}>
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const unfamiliar = isUnfamiliarEvent(item.kind, item.thisDevice);
            return (
              <li key={item.id} className={cn('border-b border-site-border py-3', arrived(item.id) && ARRIVE)}>
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-site-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="t-body text-site-text">
                      {sentence(t, item)}
                      {item.thisDevice ? (
                        <span className="t-label ms-2">{t('this-device', { defaultValue: 'This device' })}</span>
                      ) : null}
                    </p>
                    <p className="t-meta text-site-text-muted">
                      <ActivityTime iso={item.createdAt} />
                      {item.sameNetwork !== null && !item.thisDevice ? (
                        <>
                          {' · '}
                          {item.sameNetwork
                            ? t('same-network', { defaultValue: 'Same network as this device' })
                            : t('different-network', { defaultValue: 'Different network from this device' })}
                        </>
                      ) : null}
                    </p>
                    {unfamiliar ? (
                      <p className="t-body mt-1 text-site-text-muted">
                        {notYouLine(
                          t('not-you', {
                            defaultValue:
                              'Not you? <sessions>Sign out your devices</sessions> or <methods>review your sign-in methods</methods>.',
                          }),
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage ? (
        <div className="pt-3">
          <Button variant="default" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t('load-more', { defaultValue: 'Show more' })}
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
