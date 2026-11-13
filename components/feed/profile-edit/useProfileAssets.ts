import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api, apiUrl } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { bannerSourceApi, removeProfileAvatarApi } from '@/lib/profile.contract';
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
 *
 * The banner is always cropped before it is previewed: choosing a file opens
 * the cropper on it, and "Adjust crop" reopens the cropper on the whole
 * picture the current banner was cut from. That picture is the file chosen in
 * this session, or else the one the server kept, read through the same-origin
 * `bannerSourceApi` (the public banner may be on the CDN, which a canvas
 * cannot read back).
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
    bannerCrop,
    bannerPicture,
    bannerLoading,
    submitting,
    resettingAvatar,
    setError,
    setAvatarFile,
    setAvatarPreview,
    setBannerFile,
    setBannerPreview,
    setBannerRemoved,
    setCropSrc,
    setBannerCrop,
    setBannerPicture,
    setBannerLoading,
    setHasCustomAvatar,
    setResettingAvatar,
  } = form;

  useEffect(() => () => revokeBlob(avatarPreview), [avatarPreview]);
  useEffect(() => () => revokeBlob(cropSrc), [cropSrc]);
  useEffect(() => () => revokeBlob(bannerPreview), [bannerPreview]);
  const bannerCropSrc = bannerCrop?.src ?? null;
  useEffect(() => () => revokeBlob(bannerCropSrc), [bannerCropSrc]);

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
    // Nothing changes until the crop is applied: cancelling keeps the banner as it was.
    setBannerCrop({ src: URL.createObjectURL(file), blob: file, kept: false });
    event.target.value = '';
  };

  const handleAdjustBanner = async () => {
    if (bannerLoading || bannerCrop) return;
    setError(null);
    if (bannerPicture) {
      setBannerCrop({ src: URL.createObjectURL(bannerPicture.blob), ...bannerPicture });
      return;
    }
    setBannerLoading(true);
    try {
      const res = await fetch(apiUrl(bannerSourceApi), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`banner source ${res.status}`);
      const blob = await res.blob();
      setBannerCrop({ src: URL.createObjectURL(blob), blob, kept: true });
    } catch {
      setError(
        t('failed-load-banner', { defaultValue: 'Could not load the cover to adjust it' }),
      );
    } finally {
      setBannerLoading(false);
    }
  };

  const handleBannerCropDone = (croppedBlob: Blob) => {
    if (!bannerCrop) return;
    setBannerPicture({ blob: bannerCrop.blob, kept: bannerCrop.kept });
    setBannerCrop(null);
    setBannerFile(new File([croppedBlob], 'banner.png', { type: 'image/png' }));
    setBannerPreview(URL.createObjectURL(croppedBlob));
    setBannerRemoved(false);
  };

  const handleBannerCropCancel = () => setBannerCrop(null);

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPicture(null);
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
    handleAdjustBanner,
    handleBannerCropDone,
    handleBannerCropCancel,
    handleRemoveBanner,
    handleAvatarSelect,
    handleCropDone,
    handleCropCancel,
    handleResetAvatar,
  };
}
