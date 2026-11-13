import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Crop, Image as ImageIcon, Trash2 } from 'lucide-react';
import { ProfileBanner } from '@/components/profile/ProfileBanner';
import { Button } from '@/components/ui/button';
import { FieldHeader } from './FieldHeader';
import { MAX_BANNER_MB } from './profile-edit-state';

// The cover is drawn in the profile's own banner box (ProfileBanner), so the field shows the
// crop exactly as the profile will.
export function CoverField({
  preview,
  inputRef,
  onSelect,
  onAdjust,
  adjusting,
  onRemove,
}: {
  preview: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Reopen the cropper on the picture the current cover was cut from. */
  onAdjust: () => void;
  adjusting: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div>
      <FieldHeader
        label={t('profile-cover', { defaultValue: 'Profile cover' })}
        hint={t('profile-cover-hint', {
          maxMb: MAX_BANNER_MB,
          defaultValue: 'Wide images work best. Maximum {{maxMb}} MB.',
        })}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="surface-press group relative block w-full overflow-hidden rounded-site"
      >
        <ProfileBanner src={preview} className="border-0">
          <span className="flex size-full items-center justify-center text-site-text-muted">
            <ImageIcon className="size-6" aria-hidden />
          </span>
        </ProfileBanner>
        <span className="absolute inset-0 flex items-center justify-center bg-site-bg/55 text-sm font-medium text-site-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="mr-2 size-4" aria-hidden />
          {t('change-cover', { defaultValue: 'Change cover' })}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={onSelect}
      />
      {preview ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="xs" loading={adjusting} onClick={onAdjust}>
            <Crop aria-hidden />
            {t('adjust-cover', { defaultValue: 'Adjust crop' })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-site-danger"
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
            {t('remove-banner', { defaultValue: 'Remove cover' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
