import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import type { UpdateProfileInput } from '@/lib/profile-schema';
import { removeProfileBannerApi, updateProfileApi } from '@/lib/profile.contract';
import {
  buildProfilePatch,
  type ProfileEditInitial,
  type SavedProfileData,
} from './profile-edit-state';
import type { ProfileEditForm } from './useProfileEditForm';

/**
 * Save: upload the avatar and banner (or remove the banner), then PATCH the
 * profile. Any failure surfaces in the editor's error banner and keeps the
 * draft.
 */
export function useProfileSave(
  form: ProfileEditForm,
  initial: ProfileEditInitial,
  onSaved: (data: SavedProfileData) => void,
  onClose: () => void,
) {
  const { t } = useTranslation('feed');
  const {
    submitting,
    resettingAvatar,
    canSave,
    avatarFile,
    bannerFile,
    bannerRemoved,
    handleChanged,
    draft,
    setSubmitting,
    setError,
  } = form;

  const handleSave = async () => {
    if (submitting || resettingAvatar || !canSave) return;
    setSubmitting(true);
    setError(null);

    try {
      let newImageUrl: string | undefined;
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        const avatarRes = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
        const avatarData = (await avatarRes.json().catch(() => ({}))) as {
          image?: string;
          error?: string;
        };
        if (!avatarRes.ok || !avatarData.image) {
          throw new Error(
            avatarData.error ||
              t('failed-upload-avatar', { defaultValue: 'Failed to upload avatar' }),
          );
        }
        newImageUrl = avatarData.image;
      }

      let newBannerUrl: string | null | undefined;
      if (bannerFile) {
        const bannerForm = new FormData();
        bannerForm.append('banner', bannerFile);
        const bannerRes = await fetch('/api/profile/banner', { method: 'POST', body: bannerForm });
        const bannerData = (await bannerRes.json().catch(() => ({}))) as {
          bannerUrl?: string;
          error?: string;
        };
        if (!bannerRes.ok || !bannerData.bannerUrl) {
          throw new Error(
            bannerData.error ||
              t('failed-upload-banner', { defaultValue: 'Failed to upload banner' }),
          );
        }
        newBannerUrl = bannerData.bannerUrl;
      } else if (bannerRemoved && initial.bannerUrl) {
        await api(removeProfileBannerApi).catch((e: unknown) => {
          throw new Error(
            serverError(e) ||
              t('failed-remove-banner', { defaultValue: 'Failed to remove banner' }),
          );
        });
        newBannerUrl = null;
      }

      const data = await api(updateProfileApi, {
        body: {
          ...buildProfilePatch(draft, handleChanged),
          // The draft keeps the radio value as a string; the server validates the enum.
          dmPrivacy: draft.dmPrivacy as UpdateProfileInput['dmPrivacy'],
        },
      }).catch((e: unknown) => {
        throw new Error(serverError(e) || t('failed-save', { defaultValue: 'Failed to save' }));
      });

      onSaved({
        ...data,
        ...(newImageUrl !== undefined ? { image: newImageUrl } : {}),
        ...(newBannerUrl !== undefined ? { bannerUrl: newBannerUrl } : {}),
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : t('failed-save', { defaultValue: 'Failed to save' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return handleSave;
}
