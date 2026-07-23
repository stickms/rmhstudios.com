'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import './sheet.css';

/**
 * Sheet (groundwork G1) — the responsive picker/editor surface for
 * `docs/plans/2026-07-20-parity-qol-customization-design.md`. It is a Radix
 * Dialog (focus-trapped, Escape/backdrop close, portalled) that renders as a
 * **bottom sheet on mobile** (< 768px) and a **centered dialog on desktop**,
 * both on the L4 `.glass-overlay` material over a `.glass-scrim` backdrop — the
 * exact glass Dialog uses. On mobile it also gets a drag handle and
 * swipe-down-to-dismiss, and pads the iOS home-indicator safe area.
 *
 * API mirrors Dialog so every "picker/sheet" in the spec is a drop-in:
 * ```tsx
 * <Sheet open={open} onOpenChange={setOpen}>
 *   <SheetContent>
 *     <SheetHeader><SheetTitle>Move to folder</SheetTitle></SheetHeader>
 *     …
 *   </SheetContent>
 * </Sheet>
 * ```
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn('fixed inset-0 z-50 glass-scrim', className)}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Hide the drag handle (mobile). Default false. */
    hideHandle?: boolean;
    /** Use a safe-area-aware full-screen editor instead of a bottom sheet on mobile. */
    mobileFullscreen?: boolean;
  }
>(({ className, children, hideHandle = false, mobileFullscreen = false, ...props }, ref) => {
  const { t } = useTranslation('c-ui');
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [dragY, setDragY] = React.useState(0);
  const dragStart = React.useRef<number | null>(null);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    // Swipe-to-dismiss only applies to the bottom-sheet (mobile) layout.
    if (window.matchMedia('(min-width: 768px)').matches) return;
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    const dy = e.clientY - dragStart.current;
    setDragY(Math.max(0, dy)); // downward drags only
  };
  const onHandlePointerUp = () => {
    if (dragStart.current == null) return;
    if (dragY > 80) closeRef.current?.click();
    dragStart.current = null;
    setDragY(0);
  };

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        data-mobile-fullscreen={mobileFullscreen || undefined}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        className={cn(
          // L4 glass-overlay for both layouts.
          'glass-overlay fixed z-50 flex flex-col text-site-text',
          // Mobile: a horizontally-centered floating bottom sheet by default;
          // complex editors can opt into the full visual viewport instead.
          mobileFullscreen
            ? 'inset-0 h-dvh max-h-none w-dvw rounded-none px-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]'
            : 'bottom-2 left-1/2 max-h-[calc(100dvh-1rem)] w-[calc(100dvw-1rem)] -translate-x-1/2 rounded-site px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2',
          // Desktop: centered dialog.
          'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:h-auto md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-site md:px-5 md:pb-5 md:pt-5',
          className,
        )}
        {...props}
      >
        {/* Drag handle — mobile only; drives swipe-to-dismiss. */}
        {hideHandle || mobileFullscreen ? null : (
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            className="mx-auto mb-2 h-1.5 w-10 shrink-0 cursor-grab touch-none rounded-full bg-site-border-bright md:hidden"
            aria-hidden
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        <DialogPrimitive.Close
          ref={closeRef}
          className={cn(
            'absolute right-3 inline-flex size-11 items-center justify-center rounded-full text-site-text-muted opacity-80 outline-none transition-opacity hover:bg-site-surface-hover hover:opacity-100 focus-visible:ring-2 focus-visible:ring-site-accent/50 disabled:pointer-events-none md:right-4 md:top-3 md:size-9',
            mobileFullscreen ? 'top-[max(.75rem,env(safe-area-inset-top))]' : 'top-3',
          )}
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">{t('close', { defaultValue: 'Close' })}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = 'SheetContent';

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pb-2.5 text-start', className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-[-0.022em]', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-site-text-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
