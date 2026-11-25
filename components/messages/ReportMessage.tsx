import { lazy, Suspense } from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui/menu';
import { canReportMessage } from '@/lib/messages/dm-report';

// The dialog (and the zod schema it carries) is fetched when someone reports, never with the conversation.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/**
 * s13-17: the "Report message" row of a message menu, shown on another member's message only (never your own, never an
 * unsent message, never a system or tip line). Selecting it is the caller's cue to close the menu and open
 * `ReportMessageDialog`.
 */
export function MessageReportRow({
  message,
  viewerId,
  onReport,
}: {
  message: { senderId: string; deletedAt?: string | null | undefined; kind?: string | null | undefined };
  viewerId: string;
  onReport: () => void;
}) {
  if (!canReportMessage(message, viewerId)) return null;
  return <ReportMenuRow onReport={onReport} />;
}

/** The row itself, for a menu whose host has already decided the message is reportable (the group chat's). */
export function ReportMenuRow({ onReport }: { onReport: () => void }) {
  const { t } = useTranslation('dm-reports');
  return (
    <MenuItem icon={Flag} onSelect={onReport}>
      {t('report-message', { defaultValue: 'Report message' })}
    </MenuItem>
  );
}

/** The report dialog for one message of a direct or group conversation (entity type `dm`). */
export function ReportMessageDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <ReportDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        entityType="dm"
        entityId={messageId}
      />
    </Suspense>
  );
}
