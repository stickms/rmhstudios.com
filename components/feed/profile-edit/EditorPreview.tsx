import { useTranslation } from 'react-i18next';
import { ProfileBanner } from '@/components/profile/ProfileBanner';
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
  // The avatar sits under the banner, as it does on the profile (ProfileHero), so the preview shows the whole crop.
  return (
    <div className="overflow-hidden rounded-site">
      <ProfileBanner src={banner} />
      <div className="relative px-4 pb-4">
        <div className="mt-3 flex size-18 items-center justify-center overflow-hidden rounded-full border-[3px] border-site-border bg-site-surface text-xl font-semibold text-site-text ">
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
        <p className="mt-3 truncate text-lg font-semibold text-site-text">
          {name || t('display-name-placeholder', { defaultValue: 'Your display name' })}
        </p>
        <p className="truncate text-xs text-site-text-muted">
          @{handle || t('handle-placeholder', { defaultValue: '@handle' })}
        </p>
        <p
          className={cn(
            'mt-3 line-clamp-3 text-sm leading-relaxed',
            bio ? 'text-site-text-muted' : 'text-site-text-muted',
          )}
        >
          {bio || t('bio-preview-placeholder', { defaultValue: 'Your bio will appear here.' })}
        </p>
      </div>
    </div>
  );
}
