import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PendingMessageImages } from '../PendingMessageImages';

/** Thumbnails of the images / GIF queued on the draft, each removable; the images take descriptions. */
export function PendingMedia({
  imageUrls,
  imageAlts,
  missingAlts,
  gifUrl,
  onSetAlt,
  onRemoveImage,
  onRemoveGif,
}: {
  imageUrls: string[];
  /** Index-aligned with `imageUrls`; '' = none. */
  imageAlts: string[];
  /** Indexes that still need a description (empty unless the member requires them). */
  missingAlts: number[];
  gifUrl: string | null;
  onSetAlt: (url: string, value: string) => void;
  onRemoveImage: (url: string) => void;
  onRemoveGif: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="border-t border-site-border px-3 pt-2">
      <PendingMessageImages
        imageUrls={imageUrls}
        alts={imageAlts}
        missing={missingAlts}
        onSetAlt={onSetAlt}
        onRemove={onRemoveImage}
      />
      {gifUrl && (
        <div className="relative mb-2 w-fit">
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
