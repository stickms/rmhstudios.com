import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { extendPollApi } from '@/lib/feed/poll-lifecycle.contract';
import { POLL_EXTEND_DAYS, type PollExtendDays, type PollLifecycleView } from '@/lib/feed/poll-lifecycle';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PollExtendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  /** The extensions that keep the poll within 30 days of its post (`FeedPoll.extendDays`). */
  allowedDays: readonly number[];
  onExtended: (view: PollLifecycleView) => void;
}

/** The author gives an open, timed poll 1, 3 or 7 more days. A choice past 30 days from the post is disabled, with the reason below. */
export function PollExtendDialog({ open, onOpenChange, postId, allowedDays, onExtended }: PollExtendDialogProps) {
  const { t } = useTranslation('poll-lifecycle');
  const [busy, setBusy] = useState<PollExtendDays | null>(null);
  const someRefused = POLL_EXTEND_DAYS.some((d) => !allowedDays.includes(d));

  const extend = async (days: PollExtendDays) => {
    setBusy(days);
    try {
      onExtended(
        await api(extendPollApi, {
          params: {
            id: postId,
          },
          body: {
            days,
          },
        }),
      );
      onOpenChange(false);
      toast.success(
        t('extend-done', {
          defaultValue: 'Poll extended',
        }),
      );
    } catch (e) {
      toast.error(
        serverError(e) ||
          t('extend-error', {
            defaultValue: 'Could not extend the poll',
          }),
      );
    } finally {
      setBusy(null);
    }
  };

  // One literal t() per choice: the extractor cannot see a key built from the number of days.
  const label = (days: PollExtendDays): string => {
    switch (days) {
      case 1:
        return t('extend-1-day', {
          defaultValue: 'Extend by 1 day',
        });
      case 3:
        return t('extend-3-days', {
          defaultValue: 'Extend by 3 days',
        });
      default:
        return t('extend-7-days', {
          defaultValue: 'Extend by 7 days',
        });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('extend-title', {
              defaultValue: 'Extend poll',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('extend-description', {
              defaultValue: 'Give people more time to vote. The poll closes later; nothing else changes.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {POLL_EXTEND_DAYS.map((days) => (
            <Button
              key={days}
              variant="default"
              disabled={busy !== null || !allowedDays.includes(days)}
              onClick={() => void extend(days)}
            >
              {label(days)}
            </Button>
          ))}
        </div>
        {someRefused && (
          <p className="t-meta">
            {t('extend-limit-hint', {
              defaultValue: 'A poll can run for 30 days from its post at most.',
            })}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('extend-cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
