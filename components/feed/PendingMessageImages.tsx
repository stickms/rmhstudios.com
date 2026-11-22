import { useRef, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AltTextEditor } from '@/components/feed/AltTextEditor';

/**
 * The images queued on a message draft, in both composers: a thumbnail with
 * "Add description" (or "Description added") and a remove button, the notice
 * that names the images still missing one when the member requires them, and
 * the editor dialog the buttons open. Focus returns to the image's button when
 * the dialog closes.
 */
export function PendingMessageImages({
  imageUrls,
  alts,
  missing,
  onSetAlt,
  onRemove,
}: {
  imageUrls: string[];
  /** Index-aligned with `imageUrls`; '' = none. */
  alts: string[];
  /** Indexes that still need a description (empty unless the member requires them). */
  missing: number[];
  onSetAlt: (url: string, value: string) => void;
  onRemove: (url: string) => void;
}) {
  const { t } = useTranslation('message-alt-text');
  const [editing, setEditing] = useState<number | null>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  if (imageUrls.length === 0) return null;
  const editingUrl = editing === null ? undefined : imageUrls[editing];
  const missingNames = missing.map((i) =>
    t('image-number', {
      n: i + 1,
      defaultValue: 'image {{n}}',
    }),
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-3">
        {imageUrls.map((url, i) => {
          const described = !!alts[i]?.trim();
          return (
            <div key={url} className="flex w-24 flex-col gap-1">
              <div className="relative">
                <img src={url} alt="" className="h-20 w-24 rounded-site-sm object-cover" />
                <button
                  type="button"
                  aria-label={t('remove-image-aria', {
                    n: i + 1,
                    defaultValue: 'Remove image {{n}}',
                  })}
                  onClick={() => onRemove(url)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-site-media-scrim-strong p-0.5 text-site-media-ink hover:bg-site-media-scrim-hover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                ref={(el: HTMLButtonElement | null) => {
                  buttons.current[url] = el;
                }}
                variant="default"
                size="xs"
                className="h-auto min-h-7 w-full whitespace-normal px-1 py-1 text-center"
                aria-label={
                  described
                    ? t('edit-description-aria', {
                        n: i + 1,
                        defaultValue: 'Edit description of image {{n}}',
                      })
                    : t('add-description-aria', {
                        n: i + 1,
                        defaultValue: 'Add description to image {{n}}',
                      })
                }
                onClick={() => setEditing(i)}
              >
                {described
                  ? t('description-added', {
                      defaultValue: 'Description added',
                    })
                  : t('add-description', {
                      defaultValue: 'Add description',
                    })}
              </Button>
            </div>
          );
        })}
      </div>
      {missing.length > 0 && (
        <p role="status" className="t-meta mb-2 flex items-center gap-2 text-site-text">
          <ImageOff className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {t('required-notice', {
              images: missingNames.join(', '),
              defaultValue: 'Add a description to {{images}} before sending.',
            })}
          </span>
          <Button variant="default" size="xs" onClick={() => setEditing(missing[0] ?? 0)}>
            {t('describe-it', {
              defaultValue: 'Describe it',
            })}
          </Button>
        </p>
      )}
      {editing !== null && editingUrl && (
        <AltTextEditor
          images={[
            {
              url: editingUrl,
              number: editing + 1,
              value: alts[editing] ?? '',
            },
          ]}
          title={t('editor-title', {
            defaultValue: 'Describe this image',
          })}
          saveLabel={t('done', {
            defaultValue: 'Done',
          })}
          restoreFocusTo={() => buttons.current[editingUrl] ?? null}
          onSave={(values) => {
            onSetAlt(editingUrl, (values[0] ?? '').trim());
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
