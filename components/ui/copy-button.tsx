'use client';

import * as React from 'react';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useClipboard } from '@/hooks/useClipboard';
import { Button } from '@/components/ui/button';

type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, 'value' | 'children'> & {
  /** Text placed on the clipboard when pressed. */
  value: string;
  /** Accessible label for the idle state (also the tooltip/title). */
  label?: string;
  /** Optional visible text after the icon. Icon-only when omitted. */
  children?: React.ReactNode;
  /** Show a sonner toast on success. Defaults to true for icon-only buttons. */
  toastOnCopy?: boolean;
  /** Override the idle icon (e.g. Link, Share2). */
  icon?: LucideIcon;
};

/**
 * Canonical copy-to-clipboard control. Swaps its icon to a check on success,
 * announces the state change to screen readers, and (by default) fires a
 * themed sonner toast. Replaces the ~29 hand-rolled copy buttons across the
 * app so the affordance looks and behaves the same everywhere.
 */
export function CopyButton({
  value,
  label,
  children,
  toastOnCopy,
  icon: Icon = Copy,
  variant = 'ghost',
  size,
  className,
  onClick,
  ...props
}: CopyButtonProps) {
  const { t } = useTranslation('c-ui');
  const { copied, copy } = useClipboard();

  const idleLabel = label ?? t('copy', { defaultValue: 'Copy' });
  const doneLabel = t('copied', { defaultValue: 'Copied' });
  const iconOnly = !children;
  const showToast = toastOnCopy ?? iconOnly;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const ok = await copy(value);
    if (ok && showToast) toast.success(doneLabel);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? 'icon-sm' : 'sm')}
      aria-label={iconOnly ? (copied ? doneLabel : idleLabel) : undefined}
      title={iconOnly ? idleLabel : undefined}
      data-copied={copied || undefined}
      className={cn(className)}
      onClick={handleClick}
      {...props}
    >
      {copied ? <Check className="text-site-success" aria-hidden /> : <Icon aria-hidden />}
      {children ? <span>{copied ? doneLabel : children}</span> : null}
      {/* Announce the transient state change without moving focus. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? doneLabel : ''}
      </span>
    </Button>
  );
}
