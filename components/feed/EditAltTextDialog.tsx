import {
  useId,
  useState,
} from 'react';
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
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { editPostAltsApi } from '@/lib/feed/alt-text-edit.contract';
import {
  MAX_IMAGE_ALT_LENGTH,
  alignAlts,
} from '@/lib/feed/alt-text-edit';

interface EditAltTextDialogProps {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  postId: string;
  imageUrls: string[];
  /** The descriptions as they stand; a short list reads as empty for the missing ones. */
  imageAlts:
    | readonly string[]
    | undefined;
  /** The saved list, one entry per image, so the surface can update in place. */
  onSaved: (
    imageAlts: string[],
  ) => void;
  /** The control that opened the dialog; focus goes back to it on close. */
  restoreFocusTo?: () => HTMLElement | null;
}

/**
 * "Edit image descriptions" for one's own post (sprint 05 #16): each image with its description as the picture's
 * alt text (or, with none, an empty alt and a visible "No description"), and a text area per image with a live
 * character count. A description is accessibility metadata, so saving does not mark the post edited.
 */
export function EditAltTextDialog({
  open,
  onOpenChange,
  postId,
  imageUrls,
  imageAlts,
  onSaved,
  restoreFocusTo,
}: EditAltTextDialogProps) {
  const {
    t,
  } =
    useTranslation(
      'alt-text-editing',
    );
  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent
        mobileFullscreen
        className="sm:max-w-lg"
        onCloseAutoFocus={(
          event,
        ) => {
          const target =
            restoreFocusTo?.();
          if (
            target?.isConnected
          ) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="t-heading">
            {t(
              'title',
              {
                defaultValue:
                  'Image descriptions',
              },
            )}
          </DialogTitle>
          <DialogDescription className="t-body text-site-text-muted">
            {t(
              'help',
              {
                defaultValue:
                  "A description lets people who use screen readers understand the image. Say what's in it.",
              },
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from the saved descriptions. */}
        <AltFields
          postId={
            postId
          }
          imageUrls={
            imageUrls
          }
          saved={alignAlts(
            imageUrls,
            imageAlts,
          )}
          onSaved={(
            alts,
          ) => {
            onSaved(
              alts,
            );
            onOpenChange(
              false,
            );
          }}
          onCancel={() =>
            onOpenChange(
              false,
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function AltFields({
  postId,
  imageUrls,
  saved,
  onSaved,
  onCancel,
}: {
  postId: string;
  imageUrls: string[];
  saved: string[];
  onSaved: (
    imageAlts: string[],
  ) => void;
  onCancel: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'alt-text-editing',
    );
  const base =
    useId();
  const [
    drafts,
    setDrafts,
  ] =
    useState(
      saved,
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  const [
    error,
    setError,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const total =
    imageUrls.length;
  const changed =
    drafts.some(
      (
        d,
        i,
      ) =>
        d.trim() !==
        (
          saved[
            i
          ] ??
          ''
        ).trim(),
    );

  const save =
    async () => {
      setSaving(
        true,
      );
      setError(
        null,
      );
      try {
        const res =
          await api(
            editPostAltsApi,
            {
              params:
                {
                  id: postId,
                },
              body: {
                alts: drafts.map(
                  (
                    d,
                  ) =>
                    d.trim(),
                ),
              },
            },
          );
        toast.success(
          t(
            'saved',
            {
              defaultValue:
                'Descriptions saved',
            },
          ),
        );
        onSaved(
          res.imageAlts,
        );
      } catch (e) {
        setError(
          serverError(
            e,
          ) ||
            t(
              'save-failed',
              {
                defaultValue:
                  'Could not save the descriptions. Try again.',
              },
            ),
        );
        setSaving(
          false,
        );
      }
    };

  return (
    <>
      <div className="flex flex-col gap-5">
        {imageUrls.map(
          (
            url,
            i,
          ) => {
            const current =
              saved[
                i
              ] ??
              '';
            const draft =
              drafts[
                i
              ] ??
              '';
            const fieldId = `${base}-${i}`;
            return (
              <div
                key={
                  url
                }
                className="flex flex-col gap-2"
              >
                <div className="relative">
                  <img
                    src={
                      url
                    }
                    alt={
                      current
                    }
                    className="max-h-40 w-full rounded-site border border-site-border bg-site-bg-subtle object-contain"
                  />
                </div>
                {!current.trim() && (
                  <span className="t-meta">
                    {t(
                      'no-description',
                      {
                        defaultValue:
                          'No description',
                      },
                    )}
                  </span>
                )}
                <label
                  htmlFor={
                    fieldId
                  }
                  className="t-label"
                >
                  {t(
                    'field-label',
                    {
                      n:
                        i +
                        1,
                      total,
                      defaultValue:
                        'Description of image {{n}} of {{total}}',
                    },
                  )}
                </label>
                <Textarea
                  id={
                    fieldId
                  }
                  autoFocus={
                    i ===
                    0
                  }
                  rows={
                    3
                  }
                  maxLength={
                    MAX_IMAGE_ALT_LENGTH
                  }
                  value={
                    draft
                  }
                  onChange={(
                    e,
                  ) => {
                    const value =
                      e
                        .target
                        .value;
                    setDrafts(
                      (
                        prev,
                      ) =>
                        prev.map(
                          (
                            d,
                            j,
                          ) =>
                            j ===
                            i
                              ? value
                              : d,
                        ),
                    );
                  }}
                  placeholder={t(
                    'placeholder',
                    {
                      defaultValue:
                        'A golden retriever running on a beach at sunset',
                    },
                  )}
                />
                <p
                  className="t-meta"
                  aria-live="off"
                >
                  {t(
                    'char-count',
                    {
                      used: draft.length,
                      max: MAX_IMAGE_ALT_LENGTH,
                      defaultValue:
                        '{{used}} / {{max}}',
                    },
                  )}
                </p>
              </div>
            );
          },
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="t-body text-site-danger"
        >
          {
            error
          }
        </p>
      )}
      <DialogFooter>
        <Button
          variant="default"
          onClick={
            onCancel
          }
          disabled={
            saving
          }
        >
          {t(
            'cancel',
            {
              defaultValue:
                'Cancel',
            },
          )}
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            void save()
          }
          disabled={
            saving ||
            !changed
          }
        >
          {t(
            'save',
            {
              defaultValue:
                'Save',
            },
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
