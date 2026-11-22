import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import type { AccountMuteDuration } from '@/lib/moderation/mute-expiry';

/**
 * How long to mute an account (s10-10): 24 hours, 7 days, 30 days (the muted-words durations) or until the member
 * unmutes. A small menu anchored where the post menu or the "Extend" button was; the server turns the choice into an
 * end time.
 */
export function MuteDurationChoices({
  open,
  onClose,
  anchorRef,
  onChoose,
  extend = false,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onChoose: (duration: AccountMuteDuration) => void;
  /** Extending an existing mute rather than starting one: only the panel's name changes. */
  extend?: boolean;
}) {
  const { t } = useTranslation('timed-mutes');
  const choose = (duration: AccountMuteDuration) => () => {
    onClose();
    onChoose(duration);
  };
  return (
    <AnchoredMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label={
        extend
          ? t('extend-menu', { defaultValue: 'Extend this mute' })
          : t('mute-menu', { defaultValue: 'Mute this account' })
      }
      className="w-64"
    >
      <MenuItem onSelect={choose('day')}>{t('mute-day', { defaultValue: 'Mute for 24 hours' })}</MenuItem>
      <MenuItem onSelect={choose('week')}>{t('mute-week', { defaultValue: 'Mute for 7 days' })}</MenuItem>
      <MenuItem onSelect={choose('month')}>{t('mute-month', { defaultValue: 'Mute for 30 days' })}</MenuItem>
      <MenuItem onSelect={choose('forever')}>{t('mute-forever', { defaultValue: 'Mute until I unmute' })}</MenuItem>
    </AnchoredMenu>
  );
}

/** The confirmation line after muting an account for `duration`. */
export function useMutedToastText(): (duration: AccountMuteDuration) => string {
  const { t } = useTranslation('timed-mutes');
  return (duration) => {
    switch (duration) {
      case 'day':
        return t('toast-muted-day', { defaultValue: 'Muted for 24 hours.' });
      case 'week':
        return t('toast-muted-week', { defaultValue: 'Muted for 7 days.' });
      case 'month':
        return t('toast-muted-month', { defaultValue: 'Muted for 30 days.' });
      case 'forever':
        return t('toast-muted-forever', { defaultValue: 'Muted until you unmute.' });
    }
  };
}
