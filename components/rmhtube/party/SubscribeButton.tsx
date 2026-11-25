/**
 * SubscribeButton — "Subscribe" / "Subscribed" for a host's watch parties (s13-07), on the party page and on each host
 * line of the upcoming list. Signed out, or on your own party, it renders nothing. A host never sees who subscribes and
 * no count is shown anywhere.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing } from 'lucide-react';
import { toast } from '@/lib/shared/app-toast';
import { Button } from '@/components/ui/button';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSetSubscribed, useTubeSubscriptions } from './useTubeSubscriptions';

export default function SubscribeButton({
  hostId,
  hostName,
  isSelf = false,
}: {
  hostId: string;
  hostName: string | null;
  isSelf?: boolean;
}) {
  const { t } = useTranslation('tube-subscriptions');
  const refusalText = useRefusalText();
  const { query, signedOut, hosts } = useTubeSubscriptions();
  const setSubscribed = useSetSubscribed();
  const [busy, setBusy] = useState(false);

  if (isSelf || signedOut || query.isPending) return null;
  const subscribed = hosts.some((h) => h.id === hostId);

  async function toggle() {
    setBusy(true);
    try {
      await setSubscribed({ id: hostId, name: hostName, handle: null }, !subscribed);
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ??
          t('error-toggle', {
            defaultValue: 'Could not update your subscription. Try again.',
          }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="xs"
      variant={subscribed ? 'default' : 'ghost'}
      aria-pressed={subscribed}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {subscribed ? <BellRing aria-hidden /> : <Bell aria-hidden />}
      {subscribed
        ? t('subscribed', {
            defaultValue: 'Subscribed',
          })
        : t('subscribe', {
            defaultValue: 'Subscribe',
          })}
      {hostName && (
        <span className="sr-only">
          {' '}
          <bdi>{hostName}</bdi>
        </span>
      )}
    </Button>
  );
}
