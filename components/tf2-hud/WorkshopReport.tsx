/**
 * The report entry and the owner's removed line for the TF2 workshop (s15-04).
 *
 * - `WorkshopReportButton`: "Report" on a HUD or loadout page, for a signed-in member who is not its owner. The report
 *   dialog carries the report schema (zod), so it loads when a member opens it and not with the page.
 * - `RemovedByModeratorLine`: the owner's own removed HUD or loadout, marked on its page. A removed item is private and
 *   cannot be published, renamed or copied again, so the line says so.
 */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Btn } from '@/components/tf2-hud/ui';

const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface ReportProps {
  entityType: 'tf2-hud' | 'tf2-loadout';
  /** The HUD's or loadout's id (not its slug): the report's entity id. */
  entityId: string;
  size?: 'sm' | 'md';
}

export function WorkshopReportButton({ entityType, entityId, size = 'sm' }: ReportProps) {
  const { t } = useTranslation('workshop-reports');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  if (!session?.user) return null;
  return (
    <>
      <Btn size={size} icon={Flag} onClick={() => setOpen(true)}>
        {entityType === 'tf2-hud'
          ? t('report-hud', { defaultValue: 'Report this HUD' })
          : t('report-loadout', { defaultValue: 'Report this loadout' })}
      </Btn>
      {open && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType={entityType} entityId={entityId} />
        </Suspense>
      )}
    </>
  );
}

export function RemovedByModeratorLine({ kind }: { kind: 'tf2-hud' | 'tf2-loadout' }) {
  const { t } = useTranslation('workshop-reports');
  return (
    <p role="status" className="text-sm font-semibold text-app-danger">
      {kind === 'tf2-hud'
        ? t('removed-hud', {
            defaultValue: 'Removed by a moderator. This HUD is private and cannot be published, renamed or copied.',
          })
        : t('removed-loadout', {
            defaultValue: 'Removed by a moderator. This loadout is private and cannot be published, renamed or copied.',
          })}
    </p>
  );
}
