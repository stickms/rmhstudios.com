import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// Its own file because the string extractor reads one namespace per file.
/**
 * "Let others send message requests" (s04-16): under DM privacy, on only when
 * privacy is `FOLLOWERS` or `NONE`. A request is one text message from someone
 * the privacy rule refuses; it waits in Requests with no notification.
 */
export function DmRequestsSwitch({
  dmPrivacy,
  checked,
  onChange,
}: {
  dmPrivacy: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation('message-requests');
  const available = dmPrivacy !== 'EVERYONE';
  return (
    <div className="mt-4 flex items-start justify-between gap-4 border-t border-site-border pt-4">
      <div className="min-w-0">
        <Label htmlFor="profile-dm-requests">
          {t('switch-label', { defaultValue: 'Let others send message requests' })}
        </Label>
        <p id="profile-dm-requests-hint" className="mt-1 text-xs text-site-text-muted">
          {available
            ? t('switch-hint', {
                defaultValue:
                  'Someone who cannot message you may send one text message. It waits in Requests, with no notification, until you accept or decline.',
              })
            : t('switch-hint-everyone', {
                defaultValue: 'Available when only people you follow, or nobody, can message you.',
              })}
        </p>
      </div>
      <Switch
        id="profile-dm-requests"
        checked={checked && available}
        disabled={!available}
        onCheckedChange={onChange}
        aria-describedby="profile-dm-requests-hint"
      />
    </div>
  );
}
