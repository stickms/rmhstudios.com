import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** The uploaded-image preview grid, with the ALT pill and remove button per image. */
export function ImagePreviewStrip({
  imageUrls,
  imageAlts,
  onEditAlt,
  onRemove,
}: {
  imageUrls: string[];
  imageAlts: string[];
  onEditAlt: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className={`mt-2 grid gap-1 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {imageUrls.map((url, i) => {
        const hasAlt = !!imageAlts[i]?.trim();
        return (
          <div key={url} className="relative group">
            <img
              src={url}
              alt={imageAlts[i]?.trim() || ''}
              loading="lazy"
              className="w-full rounded-site-sm object-cover max-h-48"
            />
            {/* ALT pill — accent when described, so authors can see at a
 glance which images still need a description. */}
            <button
              type="button"
              onClick={() => onEditAlt(i)}
              aria-label={
                hasAlt
                  ? t('edit-alt-text-aria', { defaultValue: 'Edit image description' })
                  : t('add-alt-text-aria', { defaultValue: 'Add image description' })
              }
              title={
                imageAlts[i]?.trim() ||
                t('alt-text-title', {
                  defaultValue: 'Describe this image for screen readers',
                })
              }
              className={`absolute bottom-1 left-1 rounded-full px-2 py-1 text-xs font-bold uppercase leading-none transition-colors ${
                hasAlt
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'bg-site-media-scrim-strong text-site-media-ink/90 hover:bg-site-media-scrim-hover'
              }`}
            >
              {t('alt-badge', { defaultValue: 'Alt' })}
            </button>
            <button
              type="button"
              aria-label={t('remove-image-aria', { defaultValue: 'Remove image' })}
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full bg-site-media-scrim-strong text-site-media-ink transition-opacity sm:size-auto sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
