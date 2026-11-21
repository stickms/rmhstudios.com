/** s04-17 — the banner above a community's content for the moderator who was offered ownership of it. */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { getHandoverApi, respondHandoverApi } from '@/lib/communities/handover.contract';

export function HandoverBanner({ slug, name }: { slug: string; name: string }) {
  const { t } = useTranslation('community-handover');
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const options = apiQuery(getHandoverApi, { params: { slug } });
  const query = useQuery({ ...options, retry: false });
  const offer = query.data?.viewer === 'recipient' ? query.data.offer : null;
  const arrival = useArrival(!!offer);
  if (!offer) return null;

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await api(respondHandoverApi, { params: { slug }, body: { action } });
      if (action === 'accept') {
        toast.success(t('accepted', { name, defaultValue: 'You now own {{name}}.' }));
        // Roles changed: reload so the page reads the new role.
        window.location.reload();
        return;
      }
      toast.success(t('declined', { defaultValue: 'Offer declined.' }));
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    } catch {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    } finally {
      setBusy(false);
    }
  };

  const from = offer.from.name ?? (offer.from.handle ? `@${offer.from.handle}` : '');
  return (
    <div
      role="region"
      aria-label={t('banner-label', { defaultValue: 'Ownership offer' })}
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-site-border px-3 py-3 ${arrival ?? ''}`}
    >
      <p className="t-body">
        {t('banner', {
          from,
          name,
          defaultValue: '{{from}} offered you ownership of {{name}}',
        })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void respond('accept')}
          aria-label={t('accept-named', { name, defaultValue: 'Accept ownership of {{name}}' })}
        >
          {t('accept', { defaultValue: 'Accept' })}
        </Button>
        <Button
          variant="default"
          disabled={busy}
          onClick={() => void respond('decline')}
          aria-label={t('decline-named', { name, defaultValue: 'Decline ownership of {{name}}' })}
        >
          {t('decline', { defaultValue: 'Decline' })}
        </Button>
      </div>
    </div>
  );
}
