import { useRef, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';

/**
 * "Send feedback" as an icon button with a popover: the shared form hangs off the button, so a page header can carry it
 * on the right without a second row. Opens the same `FeedbackForm` the dialog and the shake sheet use. The form is only
 * mounted while the popover is open, because it reads the page's context (path, recent errors) when it mounts.
 */
export function FeedbackPopover({ className }: { className?: string }) {
  const { t } = useTranslation('feedback-inbox');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = t('dialog-title', {
    defaultValue: 'Send feedback',
  });
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MessageSquareWarning aria-hidden />
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={label}
        role="dialog"
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))] p-4"
      >
        <p className="t-body mb-3 text-site-text-muted">
          {t('dialog-description', {
            defaultValue: 'Tell us what went wrong or what got in your way. We read all of it.',
          })}
        </p>
        <FeedbackForm onSent={() => setOpen(false)} />
      </AnchoredMenu>
    </>
  );
}
