import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/** The line that replaces the chat box when chat is off for a trip: text on a rule, never a tinted box. */
export function ChatOffNotice() {
  const { t } = useTranslation('rideshare-safety');
  return (
    <p role="status" className="t-meta border-t border-site-border px-4 py-3 text-site-text-muted">
      {t('chat-off', { defaultValue: 'Chat is off for this trip' })}
    </p>
  );
}

/** "Report this trip": opens the report dialog for the trip. Lazy, so the dialog's schema stays off the page. */
export function ReportTripButton({ rideId, className }: { rideId: string; className?: string }) {
  const { t } = useTranslation('rideshare-safety');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={className} onClick={() => setOpen(true)}>
        <Flag aria-hidden /> {t('report-trip', { defaultValue: 'Report this trip' })}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType="ride" entityId={rideId} />
        </Suspense>
      )}
    </>
  );
}
