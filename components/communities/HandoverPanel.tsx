/** s04-17 — the owner's "Ownership" section in the mod tools: offer the community to a moderator, see or cancel the offer. */
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { errorField } from '@/lib/http';
import { cancelHandoverApi, getHandoverApi, offerHandoverApi } from '@/lib/communities/handover.contract';
import { handoverDaysLeft, type HandoverUserDTO } from '@/lib/communities/handover';

const who = (u: HandoverUserDTO): string => (u.handle ? `@${u.handle}` : (u.name ?? ''));

export function HandoverPanel({ slug }: { slug: string }) {
  const { t } = useTranslation('community-handover');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const selectId = useId();
  const [toId, setToId] = useState('');
  const [busy, setBusy] = useState(false);
  const options = apiQuery(getHandoverApi, { params: { slug } });
  const query = useQuery({ ...options, retry: false });
  const data = query.data;
  const arrival = useArrival(!!data);

  const refresh = () => queryClient.invalidateQueries({ queryKey: options.queryKey });

  const failure = (e: unknown) => {
    const code = errorField<string>(e, 'code');
    if (code === 'pending-exists') {
      toast.error(t('error-pending', { defaultValue: 'There is already a pending offer.' }));
    } else if (code === 'not-moderator' || code === 'recipient-banned' || code === 'blocked') {
      toast.error(t('error-recipient', { defaultValue: "That member can't be offered ownership." }));
    } else {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    }
    void refresh();
  };

  const offer = async () => {
    const candidate = data?.candidates.find((c) => c.id === toId);
    if (!candidate) return;
    const ok = await confirm({
      title: t('confirm-title', {
        name: who(candidate),
        defaultValue: 'Offer ownership to {{name}}?',
      }),
      description: t('confirm-body', {
        defaultValue: 'You will become a moderator if they accept.',
      }),
      confirmLabel: t('offer', { defaultValue: 'Offer ownership' }),
      cancelLabel: t('cancel-dialog', { defaultValue: 'Keep ownership' }),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(offerHandoverApi, { params: { slug }, body: { toId } });
      setToId('');
      toast.success(t('offered', { defaultValue: 'Offer sent.' }));
      await refresh();
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api(cancelHandoverApi, { params: { slug } });
      toast.success(t('cancelled', { defaultValue: 'Offer cancelled.' }));
      await refresh();
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t border-site-border pt-4">
      <h3 className="t-heading">{t('heading', { defaultValue: 'Ownership' })}</h3>
      {query.isError ? (
        <p role="alert" className="t-body text-site-danger">
          {t('error-load', { defaultValue: "Couldn't load the ownership settings." })}
        </p>
      ) : !data ? (
        <Skeleton className="h-9 w-64" />
      ) : data.viewer !== 'owner' ? null : (
        <div className={arrival}>
          {data.offer?.state === 'pending' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-border pb-3">
              <p className="t-body">
                {t('pending', {
                  name: who(data.offer.to),
                  count: handoverDaysLeft(new Date(data.offer.expiresAt), new Date()),
                  defaultValue_one: 'Offered to {{name}}, expires in {{count}} day',
                  defaultValue_other: 'Offered to {{name}}, expires in {{count}} days',
                })}
              </p>
              <Button variant="default" disabled={busy} onClick={() => void cancel()}>
                {t('cancel', { defaultValue: 'Cancel offer' })}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="t-body text-site-text-muted">
                {data.offer?.state === 'expired'
                  ? t('expired', {
                      name: who(data.offer.to),
                      defaultValue: 'The offer to {{name}} expired. You can offer it again.',
                    })
                  : t('intro', {
                      defaultValue:
                        'Hand the community to one of your moderators. They have to accept, and you become a moderator.',
                    })}
              </p>
              {data.candidates.length === 0 ? (
                <p className="t-body text-site-text-muted">
                  {t('no-moderators', {
                    defaultValue: 'Make someone a moderator first, then you can offer them ownership.',
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={selectId} className="t-label">
                      {t('moderator', { defaultValue: 'Moderator' })}
                    </label>
                    <Select id={selectId} value={toId} onChange={(e) => setToId(e.target.value)}>
                      <option value="">{t('choose', { defaultValue: 'Choose a moderator' })}</option>
                      {data.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {who(c)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="default" disabled={busy || !toId} onClick={() => void offer()}>
                    {t('offer', { defaultValue: 'Offer ownership' })}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
