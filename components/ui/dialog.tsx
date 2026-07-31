'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useFluidDrag, useFluidDragEnabled } from '@/hooks/useFluidDrag';

import './dialog.css';

/**
 * Fan one element out to several refs. Needed here because the sheet gesture has
 * to measure and translate the content element that `DialogContent` also
 * forwards to its caller.
 */
function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  // `.glass-scrim` is a viewport-covering `backdrop-filter`, so keep animation
  // off it — Chromium re-blurs the whole layer every frame that anything above
  // it moves, whatever the damage's size or position.
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn('glass-scrim fixed inset-0 z-50', className)}
      {...props}
    />
  );
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * How far down the sheet must be *projected* to travel before the gesture counts
 * as "get rid of this" — half its own height, the platform convention.
 */
const SHEET_DISMISS_AT = 0.5;
/** Only phone-width touch sheets get the gesture; see `useFluidDragEnabled`. */
const SHEET_QUERY = '(max-width: 639px) and (pointer: coarse)';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Let complex dialogs become a safe-area-aware full screen on phones. */
    mobileFullscreen?: boolean;
  }
>(({ className, children, mobileFullscreen = false, ...props }, ref) => {
  const { t } = useTranslation('c-ui');
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  /**
   * Drag-to-dismiss, but only where it is a real gesture: a phone-width sheet on
   * a touch device. `mobileFullscreen` dialogs are the ones that present as
   * full-height sheets there, and on iOS a sheet that cannot be pushed away reads
   * as broken. The drag starts on the grab handle only — never on the body —
   * so it can never race the content's own vertical scrolling.
   */
  const sheet = useFluidDragEnabled(SHEET_QUERY) && mobileFullscreen;

  const drag = useFluidDrag({
    disabled: !sheet,
    dimension: () => contentRef.current?.offsetHeight ?? 0,
    min: 0,
    dismissAt: SHEET_DISMISS_AT,
    onUpdate: (y) => {
      const el = contentRef.current;
      if (!el) return;
      // The independent `translate` property, so this composes with the
      // positioning `transform` the class list already owns at every breakpoint.
      el.style.translate = `0 ${y.toFixed(2)}px`;
      // The scrim lightens as the sheet leaves — the backdrop stays coupled to
      // the finger instead of hanging at full strength until the sheet is gone.
      const overlay = overlayRef.current;
      const height = el.offsetHeight || 1;
      if (overlay) overlay.style.opacity = Math.max(0, 1 - (y / height) * 1.1).toFixed(3);
    },
    onDismiss: () => closeRef.current?.click(),
    onSettle: () => {
      // Sprung back: hand both elements to the stylesheet again.
      if (contentRef.current) contentRef.current.style.translate = '';
      if (overlayRef.current) overlayRef.current.style.opacity = '';
    },
  });

  return (
    <DialogPortal>
      <DialogOverlay ref={overlayRef} />
      <DialogPrimitive.Content
        ref={mergeRefs(ref, contentRef)}
        data-slot="dialog-content"
        data-mobile-fullscreen={mobileFullscreen || undefined}
        className={cn(
          'glass-overlay fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-var(--site-page-gutter)-var(--site-page-gutter))] w-[calc(100dvw-var(--site-page-gutter)-var(--site-page-gutter))] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-site p-5 text-site-text sm:w-full sm:gap-6 sm:p-6',
          mobileFullscreen &&
            'inset-0 left-0 top-0 h-dvh max-h-none w-dvw max-w-none translate-x-0 translate-y-0 content-start rounded-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:content-normal sm:rounded-site sm:p-6',
          className,
        )}
        {...props}
      >
        {sheet && (
          // The grab handle. Decorative and pointer-only — the close button below
          // is the accessible, keyboard-operable way out, and this never becomes
          // the only route to dismissal.
          <div
            className="absolute inset-x-0 top-0 z-10 flex h-9 cursor-grab items-end justify-center pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] active:cursor-grabbing"
            aria-hidden
            {...drag.handleProps}
          >
            <span className="h-1 w-9 rounded-full bg-site-text-muted/45" />
          </div>
        )}
        {children}
        <DialogPrimitive.Close
          ref={closeRef}
          className={cn(
            'absolute right-3 inline-flex size-11 items-center justify-center rounded-[var(--site-control-radius)] text-site-text-muted opacity-80 transition-opacity hover:opacity-100 hover:bg-site-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50 disabled:pointer-events-none sm:right-4 sm:top-4',
            mobileFullscreen ? 'top-[max(1rem,env(safe-area-inset-top))]' : 'top-4',
          )}
          data-fluid-press=""
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('close', { defaultValue: 'Close' })}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-1.5 pr-10 text-center sm:pr-8 sm:text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-[-0.022em]', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-site-text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
