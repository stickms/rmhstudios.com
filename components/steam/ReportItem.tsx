import * as React from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameReportType } from '@/lib/games/moderation';

// The dialog carries the report schema (zod), so it loads only when a player opens it.
const ReportDialog = React.lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/**
 * "Report" on a review, guide, discussion, reply or achievement tip written by someone else (s14-08). Nothing for a
 * signed-out viewer or for the viewer's own item (the server refuses both as well).
 */
export function ReportItemButton({
  entityType,
  entityId,
  signedIn,
  isOwn,
  className = 'stm-helpful',
}: {
  entityType: GameReportType;
  entityId: string;
  signedIn: boolean;
  isOwn: boolean;
  className?: string;
}) {
  const { t } = useTranslation('game-reports');
  const [open, setOpen] = React.useState(false);
  if (!signedIn || isOwn) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Flag aria-hidden className="size-3.5" />
        {t('report', { defaultValue: 'Report' })}
      </button>
      {open ? (
        <React.Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType={entityType} entityId={entityId} />
        </React.Suspense>
      ) : null}
    </>
  );
}

/** What the author of an item a moderator removed sees in its place: no edit, no delete. */
export function RemovedByModerator({ className = 'stm-muted' }: { className?: string }) {
  const { t } = useTranslation('game-reports');
  return (
    <p className={className} role="status">
      {t('removed-by-moderator', { defaultValue: 'Removed by a moderator' })}
    </p>
  );
}
