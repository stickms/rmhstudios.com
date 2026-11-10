import { Lock, X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';

/** The accent pill shown while a post has an unlock price; opens the price editor. */
export function UnlockPricePill({ price, onEdit }: { price: number; onEdit: () => void }) {
  const { t } = useTranslation('feed');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        title={t('edit-unlock-price-title', { defaultValue: 'Edit unlock price' })}
        className="inline-flex items-center gap-1 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent transition-colors hover:bg-site-accent/20"
      >
        <Lock className="h-3.5 w-3.5" />
        <span>
          {t('unlock-price-pill', {
            price,
            defaultValue: 'Locked · {{price}} coins',
          })}
        </span>
      </button>
    </div>
  );
}

/**
 * Active content-warning pill — the toggle lives in the (+) menu, so this keeps
 * an enabled CW visible and one-tap removable.
 */
export function ContentWarningPill({ onRemove }: { onRemove: () => void }) {
  const { t } = useTranslation('feed');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRemove}
        title={t('mark-sensitive-title', {
          defaultValue: 'Mark media as sensitive (content warning)',
        })}
        className="inline-flex items-center gap-1 rounded-full border border-site-warning/50 bg-site-warning/10 px-3 py-1 text-xs font-medium text-site-warning transition-colors hover:bg-site-warning/20"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{t('mark-sensitive-short', { defaultValue: 'CW' })}</span>
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** The signed-in author's avatar (or initial) beside the text well. */
export function ComposerAvatar({
  image,
  name,
}: {
  /** Resolved (live) image, falling back to the session's. */
  image: string | null | undefined;
  name: string | null | undefined;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="w-10 h-10 rounded-full bg-site-surface-hover flex items-center justify-center text-site-text font-bold text-sm ring-2 ring-site-bg shrink-0">
      {image ? (
        // Optimized at ~2x the 40px display size (avoids the raw CDN original).
        <img
          src={buildOptimizedUrl(image, 80, 80)}
          alt={name || t('user-alt', { defaultValue: 'User' })}
          loading="eager"
          decoding="async"
          width={40}
          height={40}
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
          }}
        />
      ) : (
        (name?.[0] || 'U').toUpperCase()
      )}
    </div>
  );
}
