/**
 * "Pretending to be someone" (sprint 14, feature 09): reports an account for impersonating another one, naming WHO. The
 * other account is picked by handle (with the same suggestions the composer offers) or is the reporter ("Me"). It posts
 * to the existing impersonation endpoint, which resolves the handle itself and files the report with the two accounts
 * the moderator then compares.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { HandleInput } from '@/components/feed/HandleInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { MAX_IMPERSONATION_NOTE } from '@/lib/handles/impersonation';
import { fileImpersonationReportApi } from '@/lib/handles/impersonation.contract';
import { HttpError } from '@/lib/http';
import { isolateText } from '@/lib/i18n/user-text';
import { toast } from '@/lib/toast';

interface ImpersonationReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account being reported. */
  accusedUserId: string;
  accusedName: string;
}

export function ImpersonationReportDialog({
  open,
  onOpenChange,
  accusedUserId,
  accusedName,
}: ImpersonationReportDialogProps) {
  const { t } = useTranslation('profile-reports');
  const { t: tl } = useTranslation('my-reports');
  const refusalText = useRefusalText();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const myId = session?.user?.id;

  const [handle, setHandle] = useState('');
  const [me, setMe] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setHandle('');
    setMe(false);
    setNote('');
    setSubmitting(false);
  };

  const target = me
    ? myId
      ? { impersonatedUserId: myId }
      : null
    : handle.trim()
      ? { impersonatedHandle: handle }
      : null;

  const submit = async () => {
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      const sent = await api(fileImpersonationReportApi, {
        body: { accusedUserId, ...target, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      const toYourReports = {
        label: tl('view-reports', { defaultValue: 'Your reports' }),
        onClick: () => {
          void navigate({ to: '/settings/security' });
        },
      };
      if (sent.alreadyReported) {
        toast.info(tl('already-reported', { defaultValue: 'You already have an open report on this.' }), {
          action: toYourReports,
        });
      } else {
        toast.success(t('reported', { defaultValue: 'Thanks. Our team will compare the two accounts.' }), {
          action: toYourReports,
        });
      }
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ||
          (e instanceof HttpError && e.status === 429
            ? t('rate-limited', { defaultValue: 'You have sent a lot of reports. Try again later.' })
            : t('report-error', { defaultValue: 'Could not send the report. Please try again.' })),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('impersonation-title', { defaultValue: 'Pretending to be someone' })}</DialogTitle>
          <DialogDescription>
            {t('impersonation-description', {
              name: isolateText(accusedName),
              defaultValue:
                'Say who {{name}} is pretending to be. A moderator compares the two accounts. Reports are anonymous to the person you are reporting.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="impersonation-handle">
            {t('impersonation-who', { defaultValue: 'Who are they pretending to be?' })}
          </Label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {me ? (
                <p id="impersonation-handle" className="t-body flex h-10 items-center text-site-text-muted">
                  {t('impersonation-me-chosen', { defaultValue: 'You' })}
                </p>
              ) : (
                <HandleInput
                  id="impersonation-handle"
                  value={handle}
                  onChange={setHandle}
                  placeholder={t('impersonation-handle-placeholder', { defaultValue: '@handle' })}
                  className="flex h-10 w-full rounded-site border border-site-border bg-site-surface px-3 text-base sm:text-sm text-site-text placeholder:text-site-text-muted"
                />
              )}
            </div>
            <Button
              type="button"
              variant="default"
              className={me ? 'border-site-text font-semibold' : 'text-site-text-muted'}
              aria-pressed={me}
              disabled={!myId}
              onClick={() => setMe((on) => !on)}
            >
              {t('impersonation-me', { defaultValue: 'Me' })}
            </Button>
          </div>
        </div>

        <Textarea
          aria-label={t('impersonation-note-label', { defaultValue: 'Note for the moderators' })}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_IMPERSONATION_NOTE}
          dir="auto"
          placeholder={t('impersonation-note-placeholder', { defaultValue: 'Add any details (optional)' })}
          rows={3}
          className="min-h-0 resize-none px-3 py-2"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="default" onClick={() => void submit()} disabled={!target || submitting}>
            {submitting
              ? t('submitting', { defaultValue: 'Sending…' })
              : t('impersonation-submit', { defaultValue: 'Send report' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
