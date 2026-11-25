import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { fileReportApi } from '@/lib/daily-puzzles/reports.contract';
import { REPORT_KINDS, REPORT_NOTE_MAX, type ReportKind } from '@/lib/daily-puzzles/reports';
import type { DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';

/**
 * "Something wrong with this puzzle?": four kinds and an optional note, one report per member per puzzle (sending
 * again replaces it). Mounted only after the member has a result, so it can never hint at the answer; the endpoint
 * refuses anyone without a score row for the day. Kinds and wording never name the answer.
 */
export function ReportPuzzleDialog({
  gameMode,
  dateKey,
  open,
  onOpenChange,
}: {
  gameMode: DailyPuzzleMode;
  dateKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('puzzle-reports');
  const refusalText = useRefusalText();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const labels: Record<ReportKind, string> = {
    'two-answers': t('kind-two-answers', { defaultValue: 'Two answers fit' }),
    'wrong-answer': t('kind-wrong-answer', { defaultValue: 'The answer is wrong' }),
    unclear: t('kind-unclear', { defaultValue: 'The clue is unclear or contradicts itself' }),
    other: t('kind-other', { defaultValue: 'Something else' }),
  };

  const send = async () => {
    if (!kind || sending) return;
    setSending(true);
    try {
      await api(fileReportApi, { body: { gameMode, dateKey, kind, ...(note.trim() ? { note: note.trim() } : {}) } });
      toast.success(t('sent', { defaultValue: 'Thanks. The report was sent.' }));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('send-failed', { defaultValue: 'The report did not send. Try again.' }),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialog-title', { defaultValue: 'Something wrong with this puzzle?' })}</DialogTitle>
          <DialogDescription>
            {t('dialog-description', {
              defaultValue: 'Say what is wrong and someone will look at it. Sending again replaces your report.',
            })}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-1.5">
          <legend className="sr-only">{t('kind-legend', { defaultValue: 'What is wrong' })}</legend>
          {REPORT_KINDS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-site-sm border px-3 py-2 t-body ${
                kind === value
                  ? 'border-site-text text-site-text'
                  : 'border-site-border text-site-text-muted hover:bg-site-surface-hover'
              }`}
            >
              <input
                type="radio"
                name="puzzle-report-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="accent-(--site-accent)"
              />
              {labels[value]}
            </label>
          ))}
        </fieldset>

        <Textarea
          aria-label={t('note-label', { defaultValue: 'Note (optional)' })}
          placeholder={t('note-placeholder', { defaultValue: 'Add a note (optional)' })}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={REPORT_NOTE_MAX}
          rows={3}
          dir="auto"
          className="min-h-0 resize-none px-3 py-2"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="primary" onClick={() => void send()} disabled={!kind || sending}>
            {sending ? t('sending', { defaultValue: 'Sending…' }) : t('send', { defaultValue: 'Send report' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
