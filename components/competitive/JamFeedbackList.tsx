/**
 * s06-07 — "Feedback (n)" on an entry the viewer is on the team of, opening the written feedback in a dialog:
 * rows on rules with the author (or "A rater"), the date, the text (rendered as text), a Helpful toggle and Report.
 * The list is fetched only when the dialog opens; the server refuses anyone outside the team, so nothing here
 * hides data. State changes are announced in a polite live region.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import {
  listJamFeedbackApi,
  markFeedbackHelpfulApi,
  unmarkFeedbackHelpfulApi,
} from '@/lib/competitive/jam-feedback.contract';
import type { FeedbackDTO } from '@/lib/competitive/jam-feedback';
import { personLabel } from '@/lib/competitive/jam-teams';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

interface JamFeedbackListProps {
  slug: string;
  entryId: string;
  /** The count the jam page already knows, shown on the button before the list is opened. */
  count: number;
}

function FeedbackRow({
  item,
  busy,
  onHelpful,
  onReport,
}: {
  item: FeedbackDTO;
  busy: boolean;
  onHelpful: (item: FeedbackDTO) => void;
  onReport: (item: FeedbackDTO) => void;
}) {
  const { t } = useTranslation('jam-feedback');
  const fmt = useLocaleFormat();
  const who = (item.author && personLabel(item.author)) ?? t('anonymous-author', { defaultValue: 'A rater' });
  return (
    <li className="flex flex-col gap-2 border-b border-site-border py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-label text-site-text">{who}</p>
        <p className="t-meta">{fmt.date(new Date(item.createdAt))}</p>
      </div>
      <p className="t-body whitespace-pre-wrap break-words">{item.body}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" aria-pressed={item.helpful} disabled={busy} onClick={() => onHelpful(item)}>
          {item.helpful
            ? t('helpful-on', { defaultValue: 'Marked helpful' })
            : t('helpful-off', { defaultValue: 'Helpful' })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onReport(item)}>
          {t('report', { defaultValue: 'Report' })}
        </Button>
      </div>
    </li>
  );
}

export function JamFeedbackList({ slug, entryId, count }: JamFeedbackListProps) {
  const { t } = useTranslation('jam-feedback');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const options = apiQuery(listJamFeedbackApi, { params: { slug, entryId } });
  const query = useQuery({ ...options, enabled: open, retry: false });
  const items = query.data?.feedback;
  const arrival = useArrival(items != null);

  const toggleHelpful = async (item: FeedbackDTO) => {
    setBusyId(item.id);
    try {
      await api(item.helpful ? unmarkFeedbackHelpfulApi : markFeedbackHelpfulApi, { params: { slug, id: item.id } });
      setAnnouncement(
        item.helpful
          ? t('announce-helpful-off', { defaultValue: 'Helpful flag removed.' })
          : t('announce-helpful-on', { defaultValue: 'Marked as helpful.' }),
      );
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    } catch {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t('open', { count, defaultValue: 'Feedback ({{count}})' })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title', { defaultValue: 'Feedback for your entry' })}</DialogTitle>
            <DialogDescription>
              {t('description', { defaultValue: 'Only your team can read this. Raters can leave their name off.' })}
            </DialogDescription>
          </DialogHeader>
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {query.isError ? (
            <p role="alert" className="t-body text-site-text-muted">
              {t('load-error', { defaultValue: 'Could not load the feedback.' })}
            </p>
          ) : !items ? (
            <div aria-busy="true" className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className={arrival ? `t-body text-site-text-muted ${arrival}` : 't-body text-site-text-muted'}>
              {t('empty', { defaultValue: 'No feedback yet.' })}
            </p>
          ) : (
            <ul
              className={
                arrival
                  ? `max-h-[60vh] overflow-y-auto border-t border-site-border ${arrival}`
                  : 'max-h-[60vh] overflow-y-auto border-t border-site-border'
              }
            >
              {items.map((item) => (
                <FeedbackRow
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onHelpful={(i) => void toggleHelpful(i)}
                  onReport={(i) => setReporting(i.id)}
                />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {reporting && (
        <ReportDialog
          open
          onOpenChange={(next) => {
            if (!next) setReporting(null);
          }}
          entityType="jam-feedback"
          entityId={reporting}
        />
      )}
    </div>
  );
}
