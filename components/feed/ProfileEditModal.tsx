import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon, LockKeyhole, Sparkles, UserRound } from 'lucide-react';

import { useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PROFILE_BANNER_ASPECT, PROFILE_BANNER_WIDTH } from '@/lib/profile/banner';
import { ImageCropModal } from './ImageCropModal';
import { CreatorSection } from './profile-edit/CreatorSection';
import { EditorPreview } from './profile-edit/EditorPreview';
import { IdentitySection } from './profile-edit/IdentitySection';
import { LinksSection } from './profile-edit/LinksSection';
import { PrivacySection } from './profile-edit/PrivacySection';
import type {
  EditorSection,
  ProfileEditInitial,
  SavedProfileData,
} from './profile-edit/profile-edit-state';
import { useHandleCheck } from './profile-edit/useHandleCheck';
import { useProfileAssets } from './profile-edit/useProfileAssets';
import { useProfileEditForm } from './profile-edit/useProfileEditForm';
import { useProfileSave } from './profile-edit/useProfileSave';

export type { SavedProfileData } from './profile-edit/profile-edit-state';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (data: SavedProfileData) => void;
  initial: ProfileEditInitial;
}

export function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { refresh: refreshResolvedUser } = useResolvedUser();
  const form = useProfileEditForm(initial);
  const handleHandleChange = useHandleCheck(form, initial);
  const assets = useProfileAssets(form, onSaved, refreshResolvedUser);
  const handleSave = useProfileSave(form, initial, onSaved, onClose);
  const { section, setSection, setError, submitting, dirty, canSave, resettingAvatar } = form;

  // True when it is fine to leave: nothing to lose, or the user agreed to lose it.
  const confirmDiscard = async () =>
    !dirty ||
    (await confirm({
      title: t('discard-profile-changes-title', { defaultValue: 'Discard profile changes?' }),
      description: t('discard-profile-changes-body', {
        defaultValue: 'Your unsaved profile updates will be lost.',
      }),
      confirmLabel: t('discard-changes', { defaultValue: 'Discard changes' }),
      danger: true,
    }));

  const requestClose = async () => {
    if (submitting) return;
    if (!(await confirmDiscard())) return;
    onClose();
  };

  const openCosmetics = async () => {
    if (!(await confirmDiscard())) return;
    onClose();
    navigate({ to: '/settings/profile' });
  };

  const sectionTabs = [
    {
      id: 'identity',
      label: t('profile-editor-identity', { defaultValue: 'Identity' }),
      icon: UserRound,
    },
    { id: 'links', label: t('profile-editor-links', { defaultValue: 'Links' }), icon: LinkIcon },
    {
      id: 'creator',
      label: t('profile-editor-creator', { defaultValue: 'Creator' }),
      icon: Sparkles,
    },
    {
      id: 'privacy',
      label: t('profile-editor-privacy', { defaultValue: 'Privacy' }),
      icon: LockKeyhole,
    },
  ];

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) void requestClose();
        }}
      >
        <SheetContent
          mobileFullscreen
          className="md:max-h-[92dvh] md:w-[min(900px,calc(100vw-2rem))] md:max-w-none md:px-0 md:pb-0 md:pt-0"
        >
          <div className="border-b border-site-border px-4 pb-3 pt-2 md:px-6 md:pt-6">
            <SheetHeader className="pr-10">
              <SheetTitle>{t('edit-profile', { defaultValue: 'Edit profile' })}</SheetTitle>
              <SheetDescription>
                {t('profile-editor-description', {
                  defaultValue: 'Shape how your profile looks, feels, and connects with people.',
                })}
              </SheetDescription>
            </SheetHeader>
            <Tabs
              tabs={sectionTabs}
              value={section}
              onChange={(value) => {
                setSection(value as EditorSection);
                setError(null);
              }}
              size="sm"
              className="mt-1 max-w-full"
              aria-label={t('profile-editor-sections', { defaultValue: 'Profile editor sections' })}
            />
          </div>

          <div className="grid gap-6 px-4 py-6 md:grid-cols-[minmax(0,1fr)_17rem] md:px-6">
            <div className="min-w-0">
              {section === 'identity' ? (
                <IdentitySection
                  form={form}
                  assets={assets}
                  handleCooldownMs={initial.handleCooldownMs}
                  onHandleChange={handleHandleChange}
                />
              ) : null}

              {section === 'links' ? <LinksSection form={form} /> : null}

              {section === 'creator' ? (
                <CreatorSection form={form} onOpenCosmetics={openCosmetics} />
              ) : null}

              {section === 'privacy' ? (
                <PrivacySection
                  showLikes={form.showLikes}
                  onShowLikesChange={form.setShowLikes}
                  dmPrivacy={form.dmPrivacy}
                  onDmPrivacyChange={form.setDmPrivacy}
                />
              ) : null}
            </div>

            <aside className="hidden md:block">
              <div className="sticky top-0 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-site-text-muted">
                  <Sparkles className="size-3.5" aria-hidden />
                  {t('live-preview', { defaultValue: 'Live preview' })}
                </div>
                <EditorPreview
                  name={form.displayName}
                  handle={form.handle}
                  bio={form.bio}
                  image={form.avatarPreview}
                  banner={form.bannerPreview}
                />
                <p className="text-xs leading-relaxed text-site-text-muted">
                  {t('live-preview-hint', {
                    defaultValue:
                      'Your theme, badges, and frame remain applied when these changes are saved.',
                  })}
                </p>
              </div>
            </aside>
          </div>

          {form.error ? (
            <div
              className="mx-4 mb-3 rounded-site-sm border border-site-danger/40 bg-site-danger/10 px-3 py-2 text-sm text-site-danger md:mx-6"
              role="alert"
            >
              {form.error}
            </div>
          ) : null}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-x-0 border-b-0 px-4 py-3 md:px-6">
            <p className="hidden text-xs text-site-text-muted sm:block">
              {dirty
                ? t('unsaved-profile-changes', { defaultValue: 'You have unsaved changes.' })
                : t('profile-up-to-date', { defaultValue: 'Your profile is up to date.' })}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void requestClose()}
                disabled={submitting}
              >
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleSave}
                loading={submitting}
                loadingText={t('saving', { defaultValue: 'Saving…' })}
                disabled={!dirty || !canSave || resettingAvatar}
              >
                <Sparkles aria-hidden />
                {t('save-profile', { defaultValue: 'Save profile' })}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {form.cropSrc ? (
        <ImageCropModal
          imageSrc={form.cropSrc}
          onCropDone={assets.handleCropDone}
          onCancel={assets.handleCropCancel}
        />
      ) : null}

      {form.bannerCrop ? (
        <ImageCropModal
          imageSrc={form.bannerCrop.src}
          onCropDone={assets.handleBannerCropDone}
          onCancel={assets.handleBannerCropCancel}
          aspect={PROFILE_BANNER_ASPECT}
          cropShape="rect"
          cover
          outputWidth={PROFILE_BANNER_WIDTH}
        />
      ) : null}
    </>
  );
}
