import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import type { UpdateProfileInput } from '@/lib/profile-schema';
import {
  removeProfileBannerApi,
  updateProfileApi,
  uploadAvatarApi,
  uploadBannerApi,
} from '@/lib/profile.contract';
import {
  buildBannerUpload,
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
  onSaved: (
    data: SavedProfileData,
  ) => void,
  onClose: () => void,
) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    submitting,
    resettingAvatar,
    canSave,
    avatarFile,
    bannerFile,
    bannerPicture,
    bannerRemoved,
    handleChanged,
    draft,
    setSubmitting,
    setError,
  } =
    form;

  const handleSave =
    async () => {
      if (
        submitting ||
        resettingAvatar ||
        !canSave
      )
        return;
      setSubmitting(
        true,
      );
      setError(
        null,
      );

      try {
        let newImageUrl:
          | string
          | undefined;
        if (
          avatarFile
        ) {
          const formData =
            new FormData();
          formData.append(
            'avatar',
            avatarFile,
          );
          const avatarData =
            await api(
              uploadAvatarApi,
              {
                body: formData,
              },
            ).catch(
              (
                e: unknown,
              ) => {
                throw new Error(
                  serverError(
                    e,
                  ) ||
                    t(
                      'failed-upload-avatar',
                      {
                        defaultValue:
                          'Failed to upload avatar',
                      },
                    ),
                );
              },
            );
          if (
            !avatarData.image
          ) {
            throw new Error(
              t(
                'failed-upload-avatar',
                {
                  defaultValue:
                    'Failed to upload avatar',
                },
              ),
            );
          }
          newImageUrl =
            avatarData.image;
        }

        let newBannerUrl:
          | string
          | null
          | undefined;
        if (
          bannerFile
        ) {
          const bannerForm =
            buildBannerUpload(
              bannerFile,
              bannerPicture,
            );
          const bannerData =
            await api(
              uploadBannerApi,
              {
                body: bannerForm,
              },
            ).catch(
              (
                e: unknown,
              ) => {
                throw new Error(
                  serverError(
                    e,
                  ) ||
                    t(
                      'failed-upload-banner',
                      {
                        defaultValue:
                          'Failed to upload banner',
                      },
                    ),
                );
              },
            );
          if (
            !bannerData.bannerUrl
          ) {
            throw new Error(
              t(
                'failed-upload-banner',
                {
                  defaultValue:
                    'Failed to upload banner',
                },
              ),
            );
          }
          newBannerUrl =
            bannerData.bannerUrl;
        } else if (
          bannerRemoved &&
          initial.bannerUrl
        ) {
          await api(
            removeProfileBannerApi,
          ).catch(
            (
              e: unknown,
            ) => {
              throw new Error(
                serverError(
                  e,
                ) ||
                  t(
                    'failed-remove-banner',
                    {
                      defaultValue:
                        'Failed to remove banner',
                    },
                  ),
              );
            },
          );
          newBannerUrl =
            null;
        }

        const data =
          await api(
            updateProfileApi,
            {
              body: {
                ...buildProfilePatch(
                  draft,
                  handleChanged,
                ),
                // The draft keeps the radio value as a string; the server validates the enum.
                dmPrivacy:
                  draft.dmPrivacy as UpdateProfileInput['dmPrivacy'],
              },
            },
          ).catch(
            (
              e: unknown,
            ) => {
              throw new Error(
                serverError(
                  e,
                ) ||
                  t(
                    'failed-save',
                    {
                      defaultValue:
                        'Failed to save',
                    },
                  ),
              );
            },
          );

        onSaved(
          {
            ...data,
            ...(newImageUrl !==
            undefined
              ? {
                  image:
                    newImageUrl,
                }
              : {}),
            ...(newBannerUrl !==
            undefined
              ? {
                  bannerUrl:
                    newBannerUrl,
                }
              : {}),
          },
        );
        onClose();
      } catch (saveError) {
        setError(
          saveError instanceof
            Error &&
            saveError.message
            ? saveError.message
            : t(
                'failed-save',
                {
                  defaultValue:
                    'Failed to save',
                },
              ),
        );
      } finally {
        setSubmitting(
          false,
        );
      }
    };

  return handleSave;
}
