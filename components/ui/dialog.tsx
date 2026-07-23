'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import './dialog.css';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn('fixed inset-0 z-50 glass-scrim', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Let complex dialogs become a safe-area-aware full screen on phones. */
    mobileFullscreen?: boolean;
  }
>(({ className, children, mobileFullscreen = false, ...props }, ref) => {
  const { t } = useTranslation('c-ui');
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        data-mobile-fullscreen={mobileFullscreen || undefined}
        className={cn(
          // L4 glass-overlay: more opaque + strong blur so content never ghosts
          // through the dialog over a bright aurora corner (§7.2).
          'glass-overlay fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-var(--site-page-gutter)-var(--site-page-gutter))] w-[calc(100dvw-var(--site-page-gutter)-var(--site-page-gutter))] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto p-4 text-site-text sm:w-full sm:p-5',
          mobileFullscreen &&
            'inset-0 left-0 top-0 h-dvh max-h-none w-dvw max-w-none translate-x-0 translate-y-0 content-start rounded-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:content-normal sm:rounded-site sm:p-5',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 inline-flex size-11 items-center justify-center rounded-full text-site-text-muted opacity-80 transition-opacity hover:opacity-100 hover:bg-site-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50 disabled:pointer-events-none sm:right-4 sm:top-4 sm:size-9',
            mobileFullscreen ? 'top-[max(1rem,env(safe-area-inset-top))]' : 'top-4',
          )}
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
