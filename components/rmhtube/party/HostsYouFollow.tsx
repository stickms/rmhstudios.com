/**
 * HostsYouFollow — the RMHTube landing's list of hosts the member subscribes to (s13-07), names as they are now, each
 * with an unsubscribe action. Signed out it renders nothing. Nobody else can see this list and it shows no count.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/shared/app-toast';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import type { TubeHostDTO } from '@/lib/rmhtube/subscriptions.contract';
import { useSetSubscribed, useTubeSubscriptions } from './useTubeSubscriptions';

export default function HostsYouFollow() {
  const { t } = useTranslation('tube-subscriptions');
  const refusalText = useRefusalText();
  const { query, signedOut, hosts } = useTubeSubscriptions();
  const setSubscribed = useSetSubscribed();
  const arrive = useArrival(query.isSuccess);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (signedOut) return null;

  async function unsubscribe(host: TubeHostDTO) {
    setBusyId(host.id);
    try {
      await setSubscribed(host, false);
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ??
          t('error-toggle', {
            defaultValue: 'Could not update your subscription. Try again.',
          }),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-app app-glass p-6">
      <h2 className="mb-2 text-xl font-semibold">
        {t('hosts-title', {
          defaultValue: 'Hosts you follow',
        })}
      </h2>
      {query.isPending && (
        <p className="py-4 text-sm text-app-text-muted" role="status">
          {t('hosts-loading', {
            defaultValue: 'Loading hosts',
          })}
        </p>
      )}
      {query.isError && (
        <p className="py-4 text-sm text-app-text-muted" role="alert">
          {t('hosts-error', {
            defaultValue: 'Could not load your subscriptions.',
          })}{' '}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            {t('hosts-retry', {
              defaultValue: 'Try again',
            })}
          </button>
        </p>
      )}
      {query.isSuccess && hosts.length === 0 && (
        <p className="py-4 text-sm text-app-text-muted">
          {t('hosts-empty', {
            defaultValue: 'Subscribe to a host from a party page and you will hear when they schedule the next one.',
          })}
        </p>
      )}
      {query.isSuccess && hosts.length > 0 && (
        <ul className={arrive}>
          {hosts.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 border-b border-app-border py-3 last:border-b-0"
            >
              <p className="min-w-0 truncate text-sm font-semibold text-app-text">
                <bdi>{h.name ?? h.handle ?? ''}</bdi>
              </p>
              <Button type="button" size="xs" disabled={busyId === h.id} onClick={() => void unsubscribe(h)}>
                {t('unsubscribe', {
                  defaultValue: 'Unsubscribe',
                })}
                <span className="sr-only">
                  {' '}
                  <bdi>{h.name ?? h.handle ?? ''}</bdi>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
