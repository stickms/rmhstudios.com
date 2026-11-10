import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function EditorPreview({
  name,
  handle,
  bio,
  image,
  banner,
}: {
  name: string;
  handle: string;
  bio: string;
  image: string | null;
  banner: string | null;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="glass-fill overflow-hidden rounded-site shadow-site-sm">
      <div className="relative h-24 overflow-hidden bg-linear-to-br from-site-accent-dim via-site-surface to-site-bg-subtle">
        {banner ? <img src={banner} alt="" className="size-full object-cover" /> : null}
        <div
          className="absolute inset-0 bg-linear-to-t from-site-surface-opaque to-transparent"
          aria-hidden
        />
      </div>
      <div className="relative px-4 pb-4">
        <div className="-mt-9 flex size-18 items-center justify-center overflow-hidden rounded-full border-[3px] border-site-glass-rim bg-site-surface-opaque text-xl font-bold text-site-text shadow-site-sm">
          {image ? (
            <img
              src={image}
              alt={t('avatar-alt', { defaultValue: 'Avatar' })}
              className="size-full object-cover"
            />
          ) : (
            (name[0] || 'U').toUpperCase()
          )}
        </div>
        <p className="mt-3 truncate text-lg font-bold text-site-text">
          {name || t('display-name-placeholder', { defaultValue: 'Your display name' })}
        </p>
        <p className="truncate text-xs text-site-text-dim">
          @{handle || t('handle-placeholder', { defaultValue: '@handle' })}
        </p>
        <p
          className={cn(
            'mt-3 line-clamp-3 text-sm leading-relaxed',
            bio ? 'text-site-text-muted' : 'text-site-text-dim',
          )}
        >
          {bio || t('bio-preview-placeholder', { defaultValue: 'Your bio will appear here.' })}
        </p>
      </div>
    </div>
  );
}
