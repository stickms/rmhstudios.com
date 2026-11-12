import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldHeader } from './FieldHeader';
import { MAX_AVATAR_MB } from './profile-edit-state';

export function AvatarField({
  preview,
  displayName,
  inputRef,
  canReset,
  resetting,
  submitting,
  onSelect,
  onReset,
}: {
  preview: string | null;
  displayName: string;
  inputRef: RefObject<HTMLInputElement | null>;
  /** A custom avatar is saved, or a new one is pending. */
  canReset: boolean;
  resetting: boolean;
  submitting: boolean;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div>
      <FieldHeader
        label={t('profile-photo', { defaultValue: 'Profile photo' })}
        hint={t('avatar-change-hint', {
          maxMb: MAX_AVATAR_MB,
          defaultValue: 'Square images work best. Maximum {{maxMb}} MB.',
        })}
      />
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="surface-press group relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold text-site-text"
          aria-label={t('change-avatar', { defaultValue: 'Change profile photo' })}
        >
          {preview ? (
            <img
              src={preview}
              alt={t('avatar-alt', { defaultValue: 'Avatar' })}
              className="size-full object-cover"
            />
          ) : (
            (displayName[0] || 'U').toUpperCase()
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-site-bg/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-5" aria-hidden />
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden />
            {t('upload-photo', { defaultValue: 'Upload photo' })}
          </Button>
          {canReset ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-site-danger"
              loading={resetting}
              disabled={submitting}
              onClick={onReset}
            >
              <RotateCcw aria-hidden />
              {t('reset-avatar', { defaultValue: 'Reset' })}
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={onSelect}
      />
    </div>
  );
}
