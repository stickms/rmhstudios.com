/**
 * ReportRoomButton — "Report this room" (s14-10), in the room header and on a party's page. Signed out, or on a room
 * you host, it renders nothing. The report dialog carries the report schema (zod), so it loads when a member opens it
 * and not with the room.
 */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface Props {
  /** The room's code: the report's entity id. */
  roomId: string;
  /** The viewer hosts the room, so there is nothing to report. */
  isHost?: boolean;
  /** `icon` in the room header's row of icon buttons; `text` on the party page. */
  variant: 'icon' | 'text';
}

export default function ReportRoomButton({ roomId, isHost = false, variant }: Props) {
  const { t } = useTranslation('tube-room-reports');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  if (isHost || !session?.user) return null;
  const label = t('report-room', { defaultValue: 'Report this room' });

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-app-sm p-2 transition-colors text-app-text-muted hover:text-app-text hover:bg-app-surface-hover"
          title={label}
          aria-label={label}
        >
          <Flag className="h-5 w-5" aria-hidden />
        </button>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          <Flag aria-hidden />
          {label}
        </Button>
      )}
      {open && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType="tube-room" entityId={roomId} />
        </Suspense>
      )}
    </>
  );
}
