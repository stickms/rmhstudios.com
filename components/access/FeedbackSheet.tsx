import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from '@/lib/feedback-schema';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { sendFeedbackApi } from '@/lib/feedback.contract';

/** Feedback form over the existing `POST /api/feedback`; opened by a shake on phones. */
export function FeedbackSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('f-access');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const labels: Record<FeedbackCategory, string> = {
    bug: t('fb-bug', { defaultValue: 'Bug' }),
    feature: t('fb-feature', { defaultValue: 'Idea' }),
    general: t('fb-general', { defaultValue: 'General' }),
    other: t('fb-other', { defaultValue: 'Other' }),
  };

  async function submit() {
    setBusy(true);
    try {
      await api(sendFeedbackApi, { body: { category, message } });
      toast.success(t('fb-sent', { defaultValue: 'Thanks, feedback sent.' }));
      setMessage('');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        toast.error(t('fb-signin', { defaultValue: 'Sign in to send feedback.' }));
      } else {
        toast.error(serverError(e) ?? t('fb-failed', { defaultValue: 'Could not send feedback.' }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('fb-title', { defaultValue: 'Report a problem' })}</SheetTitle>
          <SheetDescription>
            {t('fb-desc', {
              defaultValue:
                'You shook your phone. Tell us what went wrong or what you wish worked.',
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-1 pb-2">
          <Tabs
            tabs={FEEDBACK_CATEGORIES.map((c) => ({ id: c, label: labels[c] }))}
            value={category}
            onChange={(id) => setCategory(id as FeedbackCategory)}
            aria-label={t('fb-category', { defaultValue: 'Category' })}
            size="sm"
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={2000}
            aria-label={t('fb-message', { defaultValue: 'What happened?' })}
            placeholder={t('fb-placeholder', { defaultValue: 'At least 10 characters' })}
          />
          <Button
            className="w-full"
            disabled={busy || message.trim().length < 10}
            onClick={() => void submit()}
          >
            {t('fb-send', { defaultValue: 'Send feedback' })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
