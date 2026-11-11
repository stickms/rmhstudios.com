import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { removeProfileAvatarApi } from '@/lib/profile.contract';
import {
  MAX_AVATAR_MB,
  MAX_BANNER_MB,
  revokeBlob,
  type SavedProfileData,
} from './profile-edit-state';
import type { ProfileEditForm } from './useProfileEditForm';

/**
 * Avatar and banner handling: file selection with size limits, the crop
 * hand-off, banner removal, avatar reset, and releasing object URLs when a
 * preview is replaced or the editor unmounts.
 */
export function useProfileAssets(
  form: ProfileEditForm,
  onSaved: (data: SavedProfileData) => void,
  refreshResolvedUser: () => void,
) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const {
    avatarPreview,
    bannerPreview,
    cropSrc,
    submitting,
    resettingAvatar,
    setError,
    setAvatarFile,
    setAvatarPreview,
    setBannerFile,
    setBannerPreview,
    setBannerRemoved,
    setCropSrc,
    setHasCustomAvatar,
    setResettingAvatar,
  } = form;

  useEffect(() => () => revokeBlob(avatarPreview), [avatarPreview]);
  useEffect(() => () => revokeBlob(cropSrc), [cropSrc]);
  useEffect(() => () => revokeBlob(bannerPreview), [bannerPreview]);

  const handleBannerSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BANNER_MB * 1024 * 1024) {
      setError(
        t('banner-size-error', {
          maxMb: MAX_BANNER_MB,
          defaultValue: 'Banner must be under {{maxMb}} MB',
        }),
      );
      return;
    }
    setError(null);
    revokeBlob(bannerPreview);
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setBannerRemoved(false);
    event.target.value = '';
  };

  const handleRemoveBanner = () => {
    revokeBlob(bannerPreview);
    setBannerFile(null);
    setBannerPreview(null);
    setBannerRemoved(true);
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setError(
        t('avatar-size-error', {
          maxMb: MAX_AVATAR_MB,
          defaultValue: 'Avatar must be under {{maxMb}} MB',
        }),
      );
      return;
    }
    setError(null);
    setCropSrc(URL.createObjectURL(file));
    event.target.value = '';
  };

  const handleCropDone = (croppedBlob: Blob) => {
    revokeBlob(cropSrc);
    revokeBlob(avatarPreview);
    const croppedFile = new File([croppedBlob], 'avatar.png', { type: 'image/png' });
    setCropSrc(null);
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  };

  const handleCropCancel = () => {
    revokeBlob(cropSrc);
    setCropSrc(null);
  };

  const handleResetAvatar = async () => {
    const approved = await confirm({
      title: t('reset-avatar-confirm-title', { defaultValue: 'Reset avatar?' }),
      description: t('reset-avatar-confirm-body', {
        defaultValue: 'This removes your custom avatar and restores your account picture.',
      }),
      confirmLabel: t('reset-avatar-btn', { defaultValue: 'Reset avatar' }),
      danger: true,
    });
    if (!approved || submitting || resettingAvatar) return;

    setResettingAvatar(true);
    setError(null);
    try {
      const data = await api(removeProfileAvatarApi);
      setAvatarFile(null);
      revokeBlob(avatarPreview);
      setAvatarPreview(data.image ?? null);
      setHasCustomAvatar(false);
      refreshResolvedUser();
      onSaved({
        image: data.image ?? null,
      });
    } catch (resetError) {
      setError(
        serverError(resetError) ||
          t('failed-reset-avatar', { defaultValue: 'Failed to reset avatar' }),
      );
    } finally {
      setResettingAvatar(false);
    }
  };

  return {
    handleBannerSelect,
    handleRemoveBanner,
    handleAvatarSelect,
    handleCropDone,
    handleCropCancel,
    handleResetAvatar,
  };
}
