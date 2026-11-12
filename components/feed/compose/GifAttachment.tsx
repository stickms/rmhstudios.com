import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GifEmbed } from '../GifEmbed';
import { GifPicker } from '../GifPicker';

/** The GIF attachment panel: the picker, then the chosen GIF with a remove button. */
export function GifAttachment({
  gifUrl,
  onSelect,
  onClear,
  onClose,
}: {
  gifUrl: string;
  onSelect: (url: string) => void;
  /** Remove the chosen GIF but keep the panel open. */
  onClear: () => void;
  /** Close the panel and drop the attachment. */
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="relative mt-2 rounded-site px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-site-text-muted">
          {t('gif-heading', { defaultValue: 'GIF' })}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {gifUrl.trim() ? (
        <div className="relative">
          <GifEmbed url={gifUrl.trim()} />
          <button
            type="button"
            onClick={onClear}
            aria-label={t('remove-gif-aria', { defaultValue: 'Remove GIF' })}
            className="absolute top-1 right-1 p-1 rounded-full bg-site-media-scrim-strong text-site-media-ink hover:bg-site-media-scrim-hover transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <GifPicker onSelect={onSelect} />
      )}
    </div>
  );
}
