import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

/** Thumbnails of the images / GIF queued on the draft, each removable. */
export function PendingMedia({
  imageUrls,
  gifUrl,
  onRemoveImage,
  onRemoveGif,
}: {
  imageUrls: string[];
  gifUrl: string | null;
  onRemoveImage: (url: string) => void;
  onRemoveGif: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="flex flex-wrap gap-2 border-t border-site-border px-3 pt-2">
      {imageUrls.map((url) => (
        <div key={url} className="relative">
          <img src={url} alt="" className="h-20 w-20 rounded-site-sm object-cover" />
          <button
            type="button"
            onClick={() => onRemoveImage(url)}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-site-media-scrim-strong p-0.5 text-site-media-ink"
            aria-label={t('remove', { defaultValue: 'Remove' })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {gifUrl && (
        <div className="relative">
          <img src={gifUrl} alt="" className="h-20 w-auto rounded-site-sm" />
          <button
            type="button"
            onClick={onRemoveGif}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-site-media-scrim-strong p-0.5 text-site-media-ink"
            aria-label={t('remove', { defaultValue: 'Remove' })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
