import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldHeader } from './FieldHeader';
import { MAX_BANNER_MB } from './profile-edit-state';

export function CoverField({
  preview,
  inputRef,
  onSelect,
  onRemove,
}: {
  preview: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
        className="surface-press group relative block h-32 w-full overflow-hidden rounded-site"
      >
        {preview ? (
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-site-bg-subtle text-site-text-muted">
            <ImageIcon className="size-6" aria-hidden />
          </span>
        )}
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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2 text-site-danger"
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
          {t('remove-banner', { defaultValue: 'Remove cover' })}
        </Button>
      ) : null}
    </div>
  );
}
