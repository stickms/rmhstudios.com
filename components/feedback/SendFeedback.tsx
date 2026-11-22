import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { isTouchPhone } from '@/lib/access/shake';

const FeedbackSheet = lazy(() =>
  import('@/components/access/FeedbackSheet').then((m) => ({
    default: m.FeedbackSheet,
  })),
);

/**
 * "Send feedback": a button that opens the shared form in a dialog on desktop and in the shake sheet on phones.
 * `children` is the trigger's content; `className` styles the button (a settings row, a help row).
 */
export function SendFeedback({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation('feedback-inbox');
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setSheet(isTouchPhone());
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && sheet ? (
        <Suspense fallback={null}>
          <FeedbackSheet open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {t('dialog-title', {
                  defaultValue: 'Send feedback',
                })}
              </DialogTitle>
              <DialogDescription>
                {t('dialog-description', {
                  defaultValue: 'Tell us what went wrong or what got in your way. We read all of it.',
                })}
              </DialogDescription>
            </DialogHeader>
            {open ? <FeedbackForm onSent={() => setOpen(false)} /> : null}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
