/**
 * "Report" on a guestbook entry or an announcement comment (s15-06): an icon button in the row's existing actions, for
 * a signed-in member, and the report dialog behind it. The dialog carries the report schema (zod), so it loads when a
 * member opens it and not with the page. The caller leaves the button out of its own rows and of hidden or deleted ones;
 * the server refuses those too.
 */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { IconButton } from '@/components/ui/icon-button';

const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

export function MemberTextReportButton({
  entityType,
  entityId,
}: {
  entityType: 'guestbook-entry' | 'blog-comment';
  /** The `GuestbookEntry` or `BlogComment` id. */
  entityId: string;
}) {
  const { t } = useTranslation('member-text-reports');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  if (!session?.user) return null;
  return (
    <>
      <IconButton
        icon={Flag}
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        label={
          entityType === 'guestbook-entry'
            ? t('report-guestbook-entry', { defaultValue: 'Report entry' })
            : t('report-blog-comment', { defaultValue: 'Report comment' })
        }
      />
      {open && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType={entityType} entityId={entityId} />
        </Suspense>
      )}
    </>
  );
}
