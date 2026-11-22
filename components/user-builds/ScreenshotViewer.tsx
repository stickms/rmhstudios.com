/**
 * The screenshot viewer (s07-17): a dialog (the overlay surface) showing one screenshot at up to 1280 px with its
 * description as visible text underneath, Previous and Next buttons, the arrow keys, and Escape to close. Radix
 * returns focus to the thumbnail that opened it. Only the current picture is in the page, so nothing is preloaded.
 * Loaded on demand by `ScreenshotStrip`; opening fades 160 ms in opacity only (the dialog's own motion).
 */
import { useEffect, useId, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { stepIndex, viewerKeyAction, type ScreenshotView } from '@/lib/builds/screenshots';

interface BodyProps {
  items: readonly ScreenshotView[];
  index: number;
  onIndexChange: (index: number) => void;
}

/** Title, picture, description and the two step buttons. Exported for the component test. */
export function ScreenshotViewerBody({ items, index, onIndexChange }: BodyProps) {
  const { t } = useTranslation('build-screenshots');
  const descriptionId = useId();
  const current = items[index];
  if (!current) return null;
  const many = items.length > 1;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('viewer-title', {
            defaultValue: 'Screenshot {{position}} of {{total}}',
            position: index + 1,
            total: items.length,
          })}
        </DialogTitle>
      </DialogHeader>
      <div className="overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
        <img
          key={current.url}
          src={current.url}
          alt={current.description}
          width={current.width}
          height={current.height}
          decoding="async"
          className="mx-auto h-auto max-h-[60dvh] w-auto max-w-full object-contain"
        />
      </div>
      <p id={descriptionId} className="t-body text-site-text">
        {current.description}
      </p>
      {many && (
        <div className="flex justify-between gap-2 border-t border-site-border pt-4">
          <Button type="button" onClick={() => onIndexChange(stepIndex(index, -1, items.length))}>
            <ChevronLeft aria-hidden className="rtl:rotate-180" />
            {t('previous', {
              defaultValue: 'Previous',
            })}
          </Button>
          <Button type="button" onClick={() => onIndexChange(stepIndex(index, 1, items.length))}>
            {t('next', {
              defaultValue: 'Next',
            })}
            <ChevronRight aria-hidden className="rtl:rotate-180" />
          </Button>
        </div>
      )}
    </>
  );
}

interface Props extends BodyProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ScreenshotViewer({ items, index, onIndexChange, open, onOpenChange }: Props) {
  // Arrow keys step through the pictures while the dialog has focus.
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const inside = contentRef.current?.contains(document.activeElement) ?? false;
      if (!inside || event.altKey || event.ctrlKey || event.metaKey) return;
      const rtl = document.documentElement.dir === 'rtl';
      const action = viewerKeyAction(event.key, rtl);
      if (!action) return;
      event.preventDefault();
      if (action === 'next') onIndexChange(stepIndex(index, 1, items.length));
      else if (action === 'previous') onIndexChange(stepIndex(index, -1, items.length));
      else if (action === 'first') onIndexChange(0);
      else onIndexChange(items.length - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, index, items.length, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-[min(1312px,calc(100dvw-2rem))]" aria-describedby={undefined}>
        <ScreenshotViewerBody items={items} index={index} onIndexChange={onIndexChange} />
      </DialogContent>
    </Dialog>
  );
}
