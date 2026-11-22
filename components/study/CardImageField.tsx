import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { CARD_IMAGE_ALT_MAX, type CardImage } from '@/lib/study/card-images';
import { uploadCardImageApi } from '@/lib/study/card-images.contract';
import { CardPicture } from '@/components/study/CardPicture';

/**
 * One side's picture in the card form (s08-15): upload, replace and remove, and the description a screen reader reads.
 * A picture cannot be saved without its description, so the field is required and says why; the form holds the save
 * back until it is filled in (`showMissing` marks it), and the server refuses it too.
 */
export function CardImageField({
  side,
  value,
  onChange,
  showMissing,
}: {
  side: 'front' | 'back';
  value: CardImage | null;
  onChange: (next: CardImage | null) => void;
  /** The form was submitted: mark an empty description as the problem. */
  showMissing: boolean;
}) {
  const { t } = useTranslation('card-images');
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const altId = `${uid}-alt`;
  const hintId = `${uid}-hint`;
  const missing = showMissing && value !== null && value.alt.trim() === '';

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.append('image', file);
    try {
      const stored = await api(uploadCardImageApi, { body });
      // Replacing keeps the description the member already wrote.
      onChange({ url: stored.url, alt: value?.alt ?? '' });
    } catch (err) {
      toast.error(serverError(err) ?? t('upload-failed', { defaultValue: 'The picture could not be uploaded.' }));
    } finally {
      setBusy(false);
    }
  }

  const addLabel =
    side === 'front'
      ? t('add-front-picture', { defaultValue: 'Add a picture to the front' })
      : t('add-back-picture', { defaultValue: 'Add a picture to the back' });
  const replaceLabel =
    side === 'front'
      ? t('replace-front-picture', { defaultValue: 'Replace the front picture' })
      : t('replace-back-picture', { defaultValue: 'Replace the back picture' });
  const removeLabel =
    side === 'front'
      ? t('remove-front-picture', { defaultValue: 'Remove the front picture' })
      : t('remove-back-picture', { defaultValue: 'Remove the back picture' });
  const fileLabel =
    side === 'front'
      ? t('front-picture-file', { defaultValue: 'Front picture file' })
      : t('back-picture-file', { defaultValue: 'Back picture file' });

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={fileLabel}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {value && (
        <CardPicture
          image={{
            url: value.url,
            alt: value.alt.trim() || t('no-description', { defaultValue: 'Picture without a description' }),
          }}
          eager
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" loading={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden />
          {value ? replaceLabel : addLabel}
        </Button>
        {value && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onChange(null)}>
            <Trash2 aria-hidden />
            {removeLabel}
          </Button>
        )}
        {!value && (
          <span className="t-meta">{t('upload-limit', { defaultValue: 'JPEG, PNG or WebP, up to 5 MB.' })}</span>
        )}
      </div>
      {value && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={altId}>{t('description', { defaultValue: 'Picture description' })}</Label>
          <Input
            id={altId}
            dir="auto"
            value={value.alt}
            maxLength={CARD_IMAGE_ALT_MAX}
            required
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `${hintId} ${uid}-missing` : hintId}
            onChange={(e) => onChange({ url: value.url, alt: e.target.value })}
          />
          <p id={hintId} className="t-meta">
            {t('description-hint', {
              defaultValue: 'Required. A screen reader reads this in place of the picture, so say what it shows.',
            })}
          </p>
          {missing && (
            <p id={`${uid}-missing`} role="alert" className="t-meta text-site-danger">
              {t('description-required', { defaultValue: 'Describe the picture before you save the card' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
