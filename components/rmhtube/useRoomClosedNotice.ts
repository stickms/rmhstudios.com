/**
 * useRoomClosedNotice — when a moderator closes the room you are in (s14-10), say so in your language and go back to
 * the landing. The socket layer has already cleared the room; this is only the sentence and the way out.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { toast } from '@/lib/shared/app-toast';
import { onRoomClosed } from '@/lib/rmhtube/socket';

export function useRoomClosedNotice(): void {
  const { t } = useTranslation('tube-room-reports');
  const router = useRouter();
  useEffect(
    () =>
      onRoomClosed((reason) => {
        if (reason === 'moderator') {
          toast.warning(t('room-closed-moderator', { defaultValue: 'This room was closed by a moderator' }));
        }
        void router.navigate({ to: '/rmhtube' });
      }),
    [t, router],
  );
}
