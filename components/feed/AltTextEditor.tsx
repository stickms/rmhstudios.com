import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MAX_MESSAGE_IMAGE_ALT_LENGTH } from '@/lib/messages/image-alts';

export interface AltTextEditorImage {
  url: string;
  /** 1-based position among the message's images, for the field's name. */
  number: number;
  /** The description as it stands. */
  value: string;
}

/**
 * The description editor for images in messages: an overlay with each image's
 * preview and a textarea (up to 1,000 characters), shared by both composers
 * (one pending image) and the sender's "Edit descriptions" on a sent message
 * (all of them). It owns the drafts and hands the whole list back on save.
 *
 * It is mounted while open. `restoreFocusTo` is the control that opened it;
 * focus goes back there on close (the dialog's own `onCloseAutoFocus`, never a
 * frame callback).
 */
export function AltTextEditor({
  images,
  title,
  saveLabel,
  saving = false,
  error = null,
  restoreFocusTo,
  onSave,
  onClose,
}: {
  images: AltTextEditorImage[];
  title: string;
  saveLabel: string;
  saving?: boolean;
  error?: string | null;
  restoreFocusTo?: () => HTMLElement | null;
  onSave: (values: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('message-alt-text');
  const base = useId();
  const [drafts, setDrafts] = useState(() => images.map((image) => image.value));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const target = restoreFocusTo?.();
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="t-heading">{title}</DialogTitle>
          <DialogDescription className="t-body text-site-text-muted">
            {t('editor-help', {
              defaultValue: "A description lets people who use screen readers understand the image. Say what's in it.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {images.map((image, i) => {
            const draft = drafts[i] ?? '';
            const fieldId = `${base}-${i}`;
            return (
              <div key={image.url} className="flex flex-col gap-2">
                <img
                  src={image.url}
                  alt=""
                  className="max-h-40 w-full rounded-site border border-site-border bg-site-bg-subtle object-contain"
                />
                <label htmlFor={fieldId} className="t-label">
                  {t('editor-field-label', {
                    n: image.number,
                    defaultValue: 'Description of image {{n}}',
                  })}
                </label>
                <Textarea
                  id={fieldId}
                  autoFocus={i === 0}
                  rows={3}
                  maxLength={MAX_MESSAGE_IMAGE_ALT_LENGTH}
                  value={draft}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDrafts((prev) => prev.map((d, j) => (j === i ? value : d)));
                  }}
                  placeholder={t('editor-placeholder', {
                    defaultValue: 'A golden retriever running on a beach at sunset',
                  })}
                />
                <p className="t-meta">
                  {t('editor-remaining', {
                    remaining: MAX_MESSAGE_IMAGE_ALT_LENGTH - draft.length,
                    defaultValue: '{{remaining}} characters left',
                  })}
                </p>
              </div>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="t-body text-site-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="default" onClick={onClose} disabled={saving}>
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button variant="primary" onClick={() => onSave(drafts)} disabled={saving}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
