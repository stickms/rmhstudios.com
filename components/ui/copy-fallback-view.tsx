import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { CopyFallbackOptions } from '@/components/ui/copy-fallback';
import { useClipboard } from '@/hooks/useClipboard';

/**
 * The body of the dialog. Its own component so the "Copied" state starts clear for every call and
 * so it renders without the dialog portal.
 */
export function CopyFallbackBody({
  options,
  close,
}: {
  options: CopyFallbackOptions;
  close: () => void;
}) {
  const { t } = useTranslation('c-ui');
  const { copied, copy } = useClipboard();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
      </DialogHeader>
      <Input
        readOnly
        autoFocus
        value={options.text}
        aria-label={options.title}
        onFocus={(event) => event.currentTarget.select()}
      />
      <p role="status" aria-live="polite" className="t-meta min-h-4 text-site-text-muted">
        {copied ? t('copied', { defaultValue: 'Copied' }) : ''}
      </p>
      <DialogFooter>
        <Button type="button" variant="default" onClick={close}>
          {options.closeLabel ?? t('close', { defaultValue: 'Close' })}
        </Button>
        <Button type="button" variant="primary" onClick={() => void copy(options.text)}>
          {options.copyLabel ?? t('copy', { defaultValue: 'Copy' })}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The dialog `useCopyFallback()` opens, loaded by the first call. Focus returns through `DialogContent`. */
export function CopyFallbackView({
  pending,
  close,
}: {
  pending: CopyFallbackOptions | null;
  close: () => void;
}) {
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {pending && (
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <CopyFallbackBody options={pending} close={close} />
        </DialogContent>
      )}
    </Dialog>
  );
}
