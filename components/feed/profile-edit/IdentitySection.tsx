import { useTranslation } from 'react-i18next';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BioAssist } from '../BioAssist';
import { AvatarField } from './AvatarField';
import { CoverField } from './CoverField';
import { EditorPreview } from './EditorPreview';
import { FieldHeader } from './FieldHeader';
import { HandleField } from './HandleField';
import { MAX_BIO, MAX_NAME } from './profile-edit-state';
import type { ProfileEditForm } from './useProfileEditForm';
import type { useProfileAssets } from './useProfileAssets';

export function IdentitySection({
  form,
  assets,
  handleCooldownMs,
  onHandleChange,
}: {
  form: ProfileEditForm;
  assets: ReturnType<typeof useProfileAssets>;
  handleCooldownMs: number;
  onHandleChange: (value: string) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div role="tabpanel" className="space-y-5">
      <div className="md:hidden">
        <EditorPreview
          name={form.displayName}
          handle={form.handle}
          bio={form.bio}
          image={form.avatarPreview}
          banner={form.bannerPreview}
        />
      </div>

      <CoverField
        preview={form.bannerPreview}
        inputRef={form.bannerInputRef}
        onSelect={assets.handleBannerSelect}
        onAdjust={() => void assets.handleAdjustBanner()}
        adjusting={form.bannerLoading}
        onRemove={assets.handleRemoveBanner}
      />

      <AvatarField
        preview={form.avatarPreview}
        displayName={form.displayName}
        inputRef={form.fileInputRef}
        canReset={form.hasCustomAvatar || !!form.avatarFile}
        resetting={form.resettingAvatar}
        submitting={form.submitting}
        onSelect={assets.handleAvatarSelect}
        onReset={assets.handleResetAvatar}
      />

      <div>
        <FieldHeader
          htmlFor="profile-display-name"
          label={t('display-name-label', { defaultValue: 'Display name' })}
          count={form.nameRemaining}
        />
        <Input
          id="profile-display-name"
          value={form.displayName}
          onChange={(event) => form.setDisplayName(event.target.value)}
          maxLength={MAX_NAME}
          placeholder={t('display-name-placeholder', {
            defaultValue: 'Your display name',
          })}
          aria-invalid={form.displayName.trim().length === 0}
        />
      </div>

      <HandleField
        handle={form.handle}
        status={form.handleStatus}
        changed={form.handleChanged}
        onCooldown={form.handleOnCooldown}
        cooldownMs={handleCooldownMs}
        onChange={onHandleChange}
      />

      <div>
        <FieldHeader
          htmlFor="profile-bio"
          label={t('bio-label', { defaultValue: 'Bio' })}
          count={form.bioRemaining}
        />
        <Textarea
          ref={form.bioRef}
          id="profile-bio"
          value={form.bio}
          onChange={(event) => form.setBio(event.target.value)}
          rows={4}
          maxLength={MAX_BIO}
          placeholder={t('bio-placeholder', {
            defaultValue: 'Tell people what you make, play, or care about.',
          })}
        />
        <div className="mt-1 flex justify-between">
          <EmojiPickerButton direction="down" onSelect={form.insertBioEmoji} />
        </div>
        <BioAssist value={form.bio} onChange={form.setBio} maxChars={MAX_BIO} />
      </div>
    </div>
  );
}
