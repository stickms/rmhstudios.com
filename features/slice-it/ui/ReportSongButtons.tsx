import * as React from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';

// The dialog carries the report schema (zod), so it loads only when a player opens it.
const ReportDialog = React.lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface ReportSongButtonProps {
  songId: string;
  /** The server's verdict that the viewer uploaded this song; nobody reports their own. */
  isOwner: boolean;
}

/** "Report song" in a song's details: a signed-in player who is not its uploader files the `song` report. */
export function ReportSongButton({ songId, isOwner }: ReportSongButtonProps) {
  const { t } = useTranslation('slice-reports');
  const session = useSession();
  const [open, setOpen] = React.useState(false);
  if (!session.data?.user || isOwner) return null;
  return (
    <>
      <button type="button" className="slice-rec__edit" onClick={() => setOpen(true)}>
        <Flag className="size-4" aria-hidden />
        {t('report-song', { defaultValue: 'Report song' })}
      </button>
      {open ? (
        <React.Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType="song" entityId={songId} />
        </React.Suspense>
      ) : null}
    </>
  );
}

interface ReportCommentButtonProps {
  commentId: string;
  /** True for the viewer's own comment, which never offers "Report". */
  isOwn: boolean;
}

/** "Report" on someone else's comment: files the `song-comment` report. */
export function ReportCommentButton({ commentId, isOwn }: ReportCommentButtonProps) {
  const { t } = useTranslation('slice-reports');
  const session = useSession();
  const [open, setOpen] = React.useState(false);
  if (!session.data?.user || isOwn) return null;
  return (
    <>
      <button
        type="button"
        className="text-[10px] text-slice-text-light hover:underline"
        onClick={() => setOpen(true)}
        aria-label={t('report-comment-label', { defaultValue: 'Report this comment' })}
      >
        {t('report-comment', { defaultValue: 'Report' })}
      </button>
      {open ? (
        <React.Suspense fallback={null}>
          <ReportDialog open onOpenChange={setOpen} entityType="song-comment" entityId={commentId} />
        </React.Suspense>
      ) : null}
    </>
  );
}
