'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Camera,
  Check,
  Coins,
  Eye,
  Image as ImageIcon,
  Link as LinkIcon,
  LockKeyhole,
  Music2,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import { useResolvedUser } from '@/components/Providers';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { MAX_PROFILE_LINKS } from '@/lib/profile-schema';
import { cn } from '@/lib/utils';
import { ImageCropModal } from './ImageCropModal';
import { SpotifySongSearch, type SpotifyTrack } from './SpotifySongSearch';

interface ProfileSongData {
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
}

export interface SavedProfileData extends Partial<ProfileSongData> {
  displayName?: string | null;
  handle?: string | null;
  image?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  links?: { label: string; url: string }[];
  bannerUrl?: string | null;
  tipGoal?: number | null;
  tipGoalLabel?: string | null;
  membershipPriceCoins?: number | null;
  showLikes?: boolean;
  dmPrivacy?: string;
}

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (data: SavedProfileData) => void;
  initial: {
    handle: string | null;
    handleCooldownMs: number;
    name: string | null;
    image: string | null;
    hasCustomAvatar?: boolean;
    bannerUrl?: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    links?: { label: string; url: string }[];
    showLikes: boolean;
    dmPrivacy: string;
    tipGoal?: number | null;
    tipGoalLabel?: string | null;
    membershipPriceCoins?: number | null;
  } & ProfileSongData;
}

type EditorSection = 'identity' | 'links' | 'creator' | 'privacy';
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const MAX_NAME = 50;
const MAX_BIO = 160;
const MAX_LOCATION = 100;
const MAX_WEBSITE = 200;
const MAX_AVATAR_MB = 5;
const MAX_BANNER_MB = 8;
const MAX_HANDLE = 20;

function formatCooldown(ms: number, t: TFunction<'feed'>): string {
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 1) {
    return t('cooldown-less-than-a-day', { defaultValue: 'less than a day' });
  }
  return t('cooldown-days', { days, defaultValue: '{{days}} days' });
}

function FieldHeader({
  htmlFor,
  label,
  hint,
  count,
}: {
  htmlFor?: string;
  label: string;
  hint?: string;
  count?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <div>
        {htmlFor ? (
          <Label htmlFor={htmlFor}>{label}</Label>
        ) : (
          <p className="text-sm font-medium text-site-text">{label}</p>
        )}
        {hint ? <p className="mt-1 text-xs text-site-text-dim">{hint}</p> : null}
      </div>
      {count ? (
        <span className="shrink-0 font-mono text-xs text-site-text-dim">{count}</span>
      ) : null}
    </div>
  );
}

function EditorPreview({
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
  return (
    <div className="glass-fill overflow-hidden rounded-site shadow-site-sm">
      <div className="relative h-24 overflow-hidden bg-linear-to-br from-site-accent-dim via-site-glass-tint to-site-bg-subtle">
        {banner ? <img src={banner} alt="" className="size-full object-cover" /> : null}
        <div
          className="absolute inset-0 bg-linear-to-t from-site-surface-opaque to-transparent"
          aria-hidden
        />
      </div>
      <div className="relative px-4 pb-4">
        <div className="-mt-9 flex size-18 items-center justify-center overflow-hidden rounded-full border-[3px] border-site-glass-rim bg-site-surface-opaque text-xl font-bold text-site-text shadow-site-sm">
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
        <p className="mt-3 truncate text-lg font-bold text-site-text">
          {name || t('display-name-placeholder', { defaultValue: 'Your display name' })}
        </p>
        <p className="truncate text-xs text-site-text-dim">
          @{handle || t('handle-placeholder', { defaultValue: 'your_handle' })}
        </p>
        <p
          className={cn(
            'mt-3 line-clamp-3 text-sm leading-relaxed',
            bio ? 'text-site-text-muted' : 'text-site-text-dim',
          )}
        >
          {bio || t('bio-preview-placeholder', { defaultValue: 'Your bio will appear here.' })}
        </p>
      </div>
    </div>
  );
}

export function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { refresh: refreshResolvedUser } = useResolvedUser();
  const [section, setSection] = useState<EditorSection>('identity');
  const [handle, setHandle] = useState(initial.handle ?? '');
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle');
  const [displayName, setDisplayName] = useState(initial.name ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [website, setWebsite] = useState(initial.website ?? '');
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial.links ?? []);
  const [showLikes, setShowLikes] = useState(initial.showLikes);
  const [dmPrivacy, setDmPrivacy] = useState(initial.dmPrivacy ?? 'EVERYONE');
  const [tipGoal, setTipGoal] = useState(initial.tipGoal ? String(initial.tipGoal) : '');
  const [tipGoalLabel, setTipGoalLabel] = useState(initial.tipGoalLabel ?? '');
  const [membershipPrice, setMembershipPrice] = useState(
    initial.membershipPriceCoins ? String(initial.membershipPriceCoins) : '',
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.image);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(initial.bannerUrl ?? null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resettingAvatar, setResettingAvatar] = useState(false);
  const [hasCustomAvatar, setHasCustomAvatar] = useState(initial.hasCustomAvatar ?? false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<SpotifyTrack | null>(
    initial.profileSongSpotifyId
      ? {
          id: initial.profileSongSpotifyId,
          title: initial.profileSongTitle ?? '',
          artist: initial.profileSongArtist ?? '',
          previewUrl: initial.profileSongPreviewUrl,
          albumArt: initial.profileSongAlbumArt,
        }
      : null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const handleCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const insertBioEmoji = useEmojiInsert(bioRef, bio, setBio);

  const bioRemaining = MAX_BIO - bio.length;
  const nameRemaining = MAX_NAME - displayName.length;
  const handleChanged = handle !== (initial.handle ?? '');
  const handleOnCooldown = initial.handleCooldownMs > 0;
  const songChanged = selectedSong?.id !== initial.profileSongSpotifyId;
  const linksChanged = JSON.stringify(links) !== JSON.stringify(initial.links ?? []);
  const dirty =
    displayName !== (initial.name ?? '') ||
    handleChanged ||
    bio !== (initial.bio ?? '') ||
    location !== (initial.location ?? '') ||
    website !== (initial.website ?? '') ||
    linksChanged ||
    showLikes !== initial.showLikes ||
    dmPrivacy !== (initial.dmPrivacy ?? 'EVERYONE') ||
    tipGoal !== (initial.tipGoal ? String(initial.tipGoal) : '') ||
    tipGoalLabel !== (initial.tipGoalLabel ?? '') ||
    membershipPrice !==
      (initial.membershipPriceCoins ? String(initial.membershipPriceCoins) : '') ||
    avatarFile !== null ||
    bannerFile !== null ||
    bannerRemoved ||
    songChanged;
  const canSave =
    displayName.trim().length > 0 &&
    nameRemaining >= 0 &&
    bioRemaining >= 0 &&
    (!handleChanged || handleStatus === 'available');

  const checkHandle = useCallback(
    async (value: string) => {
      if (!value || value === initial.handle) {
        setHandleStatus('idle');
        return;
      }
      if (value.length < 3 || !/^[a-z][a-z0-9_]*$/.test(value)) {
        setHandleStatus('invalid');
        return;
      }
      setHandleStatus('checking');
      try {
        const res = await fetch(`/api/handle/check?handle=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; reason?: string };
        setHandleStatus(data.available ? 'available' : data.reason ? 'invalid' : 'taken');
      } catch {
        setHandleStatus('idle');
      }
    },
    [initial.handle],
  );

  const handleHandleChange = (value: string) => {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, MAX_HANDLE);
    setHandle(sanitized);
    setHandleStatus('idle');
    if (handleCheckTimeout.current) clearTimeout(handleCheckTimeout.current);
    handleCheckTimeout.current = setTimeout(() => checkHandle(sanitized), 400);
  };

  useEffect(
    () => () => {
      if (handleCheckTimeout.current) clearTimeout(handleCheckTimeout.current);
    },
    [],
  );

  useEffect(
    () => () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );
  useEffect(
    () => () => {
      if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    },
    [cropSrc],
  );
  useEffect(
    () => () => {
      if (bannerPreview?.startsWith('blob:')) URL.revokeObjectURL(bannerPreview);
    },
    [bannerPreview],
  );

  const requestClose = async () => {
    if (submitting) return;
    if (
      dirty &&
      !(await confirm({
        title: t('discard-profile-changes-title', { defaultValue: 'Discard profile changes?' }),
        description: t('discard-profile-changes-body', {
          defaultValue: 'Your unsaved profile updates will be lost.',
        }),
        confirmLabel: t('discard-changes', { defaultValue: 'Discard changes' }),
        danger: true,
      }))
    ) {
      return;
    }
    onClose();
  };

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
    if (bannerPreview?.startsWith('blob:')) URL.revokeObjectURL(bannerPreview);
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setBannerRemoved(false);
    event.target.value = '';
  };

  const handleRemoveBanner = () => {
    if (bannerPreview?.startsWith('blob:')) URL.revokeObjectURL(bannerPreview);
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
    if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    const croppedFile = new File([croppedBlob], 'avatar.png', { type: 'image/png' });
    setCropSrc(null);
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  };

  const handleCropCancel = () => {
    if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
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
    if (!approved) return;

    setResettingAvatar(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        image?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error);
      setAvatarFile(null);
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(data.image ?? null);
      setHasCustomAvatar(false);
      refreshResolvedUser();
      onSaved({
        image: data.image ?? null,
      });
    } catch (resetError) {
      setError(
        resetError instanceof Error && resetError.message
          ? resetError.message
          : t('failed-reset-avatar', { defaultValue: 'Failed to reset avatar' }),
      );
    } finally {
      setResettingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (submitting || !canSave) return;
    setSubmitting(true);
    setError(null);

    const cleanedLinks = links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url);

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
        const bannerRes = await fetch('/api/profile/banner', { method: 'DELETE' });
        if (!bannerRes.ok) {
          const bannerData = (await bannerRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            bannerData.error ||
              t('failed-remove-banner', { defaultValue: 'Failed to remove banner' }),
          );
        }
        newBannerUrl = null;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(handleChanged ? { handle: handle.trim() } : {}),
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
          links: cleanedLinks,
          tipGoal: tipGoal.trim() ? Math.max(0, Number.parseInt(tipGoal, 10) || 0) : null,
          tipGoalLabel: tipGoalLabel.trim() || null,
          membershipPriceCoins: membershipPrice.trim()
            ? Math.max(0, Number.parseInt(membershipPrice, 10) || 0)
            : null,
          showLikes,
          dmPrivacy,
          profileSongSpotifyId: selectedSong?.id ?? null,
          profileSongTitle: selectedSong?.title ?? null,
          profileSongArtist: selectedSong?.artist ?? null,
          profileSongPreviewUrl: selectedSong?.previewUrl ?? null,
          profileSongAlbumArt: selectedSong?.albumArt ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SavedProfileData & { error?: string };
      if (!res.ok)
        throw new Error(data.error || t('failed-save', { defaultValue: 'Failed to save' }));

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
        <SheetContent className="max-h-[96dvh] px-0 pb-0 pt-2 md:max-h-[92dvh] md:w-[min(900px,calc(100vw-2rem))] md:max-w-none md:px-0 md:pb-0 md:pt-0">
          <div className="border-b border-site-border px-4 pb-3 pt-2 md:px-6 md:pt-6">
            <SheetHeader className="pr-10">
              <SheetTitle>{t('edit-profile', { defaultValue: 'Edit profile' })}</SheetTitle>
              <SheetDescription>
                {t('profile-editor-description', {
                  defaultValue: 'Shape how your profile looks, feels, and connects with people.',
                })}
              </SheetDescription>
            </SheetHeader>
            <LiquidTabs
              tabs={sectionTabs}
              value={section}
              onChange={(value) => {
                setSection(value as EditorSection);
                setError(null);
              }}
              size="sm"
              scroll
              className="mt-1 max-w-full"
              aria-label={t('profile-editor-sections', { defaultValue: 'Profile editor sections' })}
            />
          </div>

          <div className="grid gap-6 px-4 py-5 md:grid-cols-[minmax(0,1fr)_17rem] md:px-6">
            <div className="min-w-0">
              {section === 'identity' ? (
                <div role="tabpanel" className="space-y-5">
                  <div className="md:hidden">
                    <EditorPreview
                      name={displayName}
                      handle={handle}
                      bio={bio}
                      image={avatarPreview}
                      banner={bannerPreview}
                    />
                  </div>

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
                      onClick={() => bannerInputRef.current?.click()}
                      className="glass-fill glass-interactive group relative block h-32 w-full overflow-hidden rounded-site"
                      data-glass-light=""
                    >
                      {bannerPreview ? (
                        <img src={bannerPreview} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center bg-linear-to-br from-site-accent-dim via-site-glass-tint to-site-bg-subtle text-site-text-muted">
                          <ImageIcon className="size-6" aria-hidden />
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-site-bg/55 text-sm font-medium text-site-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Camera className="mr-2 size-4" aria-hidden />
                        {t('change-cover', { defaultValue: 'Change cover' })}
                      </span>
                    </button>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleBannerSelect}
                    />
                    {bannerPreview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="mt-2 text-site-danger"
                        onClick={handleRemoveBanner}
                      >
                        <Trash2 aria-hidden />
                        {t('remove-banner', { defaultValue: 'Remove cover' })}
                      </Button>
                    ) : null}
                  </div>

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
                        onClick={() => fileInputRef.current?.click()}
                        className="glass-fill glass-interactive group relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl font-bold text-site-text"
                        data-glass-light=""
                        aria-label={t('change-avatar', { defaultValue: 'Change profile photo' })}
                      >
                        {avatarPreview ? (
                          <img
                            src={avatarPreview}
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
                          variant="secondary"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera aria-hidden />
                          {t('upload-photo', { defaultValue: 'Upload photo' })}
                        </Button>
                        {hasCustomAvatar || avatarFile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-site-danger"
                            loading={resettingAvatar}
                            onClick={handleResetAvatar}
                          >
                            <RotateCcw aria-hidden />
                            {t('reset-avatar', { defaultValue: 'Reset' })}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleAvatarSelect}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      htmlFor="profile-display-name"
                      label={t('display-name-label', { defaultValue: 'Display name' })}
                      count={nameRemaining}
                    />
                    <Input
                      id="profile-display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={MAX_NAME}
                      placeholder={t('display-name-placeholder', {
                        defaultValue: 'Your display name',
                      })}
                      aria-invalid={displayName.trim().length === 0}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      htmlFor="profile-handle"
                      label={t('handle-label', { defaultValue: 'Handle' })}
                      count={`${handle.length}/${MAX_HANDLE}`}
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-site-text-dim">
                        @
                      </span>
                      <Input
                        id="profile-handle"
                        value={handle}
                        onChange={(event) => handleHandleChange(event.target.value)}
                        disabled={handleOnCooldown}
                        className={cn(
                          'pl-8 pr-10',
                          handleChanged && handleStatus === 'available' && 'border-site-success',
                          handleChanged &&
                            (handleStatus === 'taken' || handleStatus === 'invalid') &&
                            'border-site-danger',
                        )}
                        aria-invalid={
                          handleChanged && (handleStatus === 'taken' || handleStatus === 'invalid')
                        }
                      />
                      {handleChanged && handleStatus === 'checking' ? (
                        <Spinner
                          size={16}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2"
                        />
                      ) : null}
                      {handleChanged && handleStatus === 'available' ? (
                        <Check
                          className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-site-success"
                          aria-hidden
                        />
                      ) : null}
                      {handleChanged && (handleStatus === 'taken' || handleStatus === 'invalid') ? (
                        <X
                          className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-site-danger"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        'mt-1.5 text-xs',
                        handleStatus === 'available'
                          ? 'text-site-success'
                          : handleStatus === 'taken' || handleStatus === 'invalid'
                            ? 'text-site-danger'
                            : 'text-site-text-dim',
                      )}
                    >
                      {handleOnCooldown
                        ? t('handle-cooldown', {
                            cooldown: formatCooldown(initial.handleCooldownMs, t),
                            defaultValue: 'You can change your handle again in {{cooldown}}',
                          })
                        : handleChanged && handleStatus === 'available'
                          ? t('handle-available', { defaultValue: 'Handle is available' })
                          : handleChanged && handleStatus === 'taken'
                            ? t('handle-taken', { defaultValue: 'Handle is already taken' })
                            : handleChanged && handleStatus === 'invalid'
                              ? t('handle-invalid-hint', {
                                  defaultValue:
                                    'Use 3–20 lowercase letters, numbers, or underscores; start with a letter.',
                                })
                              : t('handle-hint', {
                                  defaultValue: 'Used for mentions and your profile URL.',
                                })}
                    </p>
                  </div>

                  <div>
                    <FieldHeader
                      htmlFor="profile-bio"
                      label={t('bio-label', { defaultValue: 'Bio' })}
                      count={bioRemaining}
                    />
                    <Textarea
                      ref={bioRef}
                      id="profile-bio"
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      rows={4}
                      maxLength={MAX_BIO}
                      placeholder={t('bio-placeholder', {
                        defaultValue: 'Tell people what you make, play, or care about.',
                      })}
                    />
                    <div className="mt-1 flex justify-between">
                      <EmojiPickerButton direction="down" onSelect={insertBioEmoji} />
                    </div>
                  </div>
                </div>
              ) : null}

              {section === 'links' ? (
                <div role="tabpanel" className="space-y-5">
                  <div>
                    <FieldHeader
                      htmlFor="profile-location"
                      label={t('location-label', { defaultValue: 'Location' })}
                    />
                    <Input
                      id="profile-location"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      maxLength={MAX_LOCATION}
                      placeholder={t('location-placeholder', {
                        defaultValue: 'Where are you based?',
                      })}
                    />
                  </div>
                  <div>
                    <FieldHeader
                      htmlFor="profile-website"
                      label={t('website-label', { defaultValue: 'Website' })}
                    />
                    <Input
                      id="profile-website"
                      type="url"
                      inputMode="url"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      maxLength={MAX_WEBSITE}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <FieldHeader
                      label={t('links-label', { defaultValue: 'Featured links' })}
                      hint={t('links-editor-hint', {
                        defaultValue:
                          'Add up to five links. They appear as quick-access glass chips.',
                      })}
                      count={`${links.length}/${MAX_PROFILE_LINKS}`}
                    />
                    <div className="space-y-3">
                      {links.map((link, index) => (
                        <div key={index} className="glass-fill rounded-site-sm p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                              <LinkIcon className="size-4" aria-hidden />
                            </span>
                            <Input
                              value={link.label}
                              onChange={(event) =>
                                setLinks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              maxLength={30}
                              placeholder={t('link-label-placeholder', { defaultValue: 'Label' })}
                              aria-label={t('link-label-aria', {
                                count: index + 1,
                                defaultValue: 'Link {{count}} label',
                              })}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-site-danger"
                              onClick={() =>
                                setLinks((current) =>
                                  current.filter((_, itemIndex) => itemIndex !== index),
                                )
                              }
                              aria-label={t('remove-link-aria', {
                                count: index + 1,
                                defaultValue: 'Remove link {{count}}',
                              })}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          </div>
                          <Input
                            type="url"
                            inputMode="url"
                            value={link.url}
                            onChange={(event) =>
                              setLinks((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, url: event.target.value } : item,
                                ),
                              )
                            }
                            maxLength={200}
                            placeholder="https://example.com"
                            aria-label={t('link-url-aria', {
                              count: index + 1,
                              defaultValue: 'Link {{count}} URL',
                            })}
                            className="mt-2"
                          />
                        </div>
                      ))}
                    </div>
                    {links.length < MAX_PROFILE_LINKS ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}
                      >
                        <Plus aria-hidden />
                        {t('add-link', { defaultValue: 'Add link' })}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {section === 'creator' ? (
                <div role="tabpanel" className="space-y-5">
                  <section className="glass-fill rounded-site p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-warning/10 text-site-warning">
                        <Coins className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h3 className="font-semibold text-site-text">
                          {t('creator-support', { defaultValue: 'Creator support' })}
                        </h3>
                        <p className="text-sm text-site-text-muted">
                          {t('creator-support-hint', {
                            defaultValue:
                              'Set optional goals and membership pricing for supporters.',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <FieldHeader
                          htmlFor="profile-tip-goal"
                          label={t('monthly-tip-goal', { defaultValue: 'Monthly tip goal' })}
                        />
                        <Input
                          id="profile-tip-goal"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={tipGoal}
                          onChange={(event) => setTipGoal(event.target.value)}
                          placeholder="1000"
                        />
                      </div>
                      <div>
                        <FieldHeader
                          htmlFor="profile-membership-price"
                          label={t('membership-price-short', {
                            defaultValue: 'Membership / month',
                          })}
                        />
                        <Input
                          id="profile-membership-price"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={membershipPrice}
                          onChange={(event) => setMembershipPrice(event.target.value)}
                          placeholder="500"
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <FieldHeader
                        htmlFor="profile-tip-label"
                        label={t('tip-goal-name', { defaultValue: 'Goal name' })}
                      />
                      <Input
                        id="profile-tip-label"
                        value={tipGoalLabel}
                        onChange={(event) => setTipGoalLabel(event.target.value)}
                        maxLength={80}
                        placeholder={t('tip-goal-label-placeholder', {
                          defaultValue: 'New microphone fund',
                        })}
                      />
                    </div>
                  </section>

                  <section className="glass-fill rounded-site p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                        <Music2 className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h3 className="font-semibold text-site-text">
                          {t('profile-soundtrack', { defaultValue: 'Profile soundtrack' })}
                        </h3>
                        <p className="text-sm text-site-text-muted">
                          {t('profile-soundtrack-hint', {
                            defaultValue: 'Pick a song visitors can play from your cover.',
                          })}
                        </p>
                      </div>
                    </div>
                    <SpotifySongSearch selected={selectedSong} onSelect={setSelectedSong} />
                  </section>

                  <section className="glass-fill rounded-site p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                        <Palette className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-site-text">
                          {t('profile-look', { defaultValue: 'Profile look' })}
                        </h3>
                        <p className="mt-1 text-sm text-site-text-muted">
                          {t('profile-look-hint', {
                            defaultValue:
                              'Equip themes, frames, badges, and banners from profile customization.',
                          })}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={async () => {
                            if (
                              dirty &&
                              !(await confirm({
                                title: t('discard-profile-changes-title', {
                                  defaultValue: 'Discard profile changes?',
                                }),
                                description: t('discard-profile-changes-body', {
                                  defaultValue: 'Your unsaved profile updates will be lost.',
                                }),
                                confirmLabel: t('discard-changes', {
                                  defaultValue: 'Discard changes',
                                }),
                                danger: true,
                              }))
                            ) {
                              return;
                            }
                            onClose();
                            navigate({ to: '/settings/profile' });
                          }}
                        >
                          <Palette aria-hidden />
                          {t('profile-cosmetics-title', { defaultValue: 'Profile customization' })}
                        </Button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {section === 'privacy' ? (
                <div role="tabpanel" className="space-y-4">
                  <section className="glass-fill rounded-site p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                          <Eye className="size-4" aria-hidden />
                        </span>
                        <div>
                          <Label htmlFor="profile-show-likes">
                            {t('show-liked-posts', { defaultValue: 'Show liked posts' })}
                          </Label>
                          <p
                            id="profile-show-likes-hint"
                            className="mt-1 text-sm text-site-text-muted"
                          >
                            {t('show-liked-posts-hint', {
                              defaultValue: "Let others see posts you've liked.",
                            })}
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="profile-show-likes"
                        checked={showLikes}
                        onCheckedChange={setShowLikes}
                        aria-describedby="profile-show-likes-hint"
                      />
                    </div>
                  </section>

                  <section className="glass-fill rounded-site p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                        <LockKeyhole className="size-4" aria-hidden />
                      </span>
                      <div>
                        <h3 className="font-semibold text-site-text">
                          {t('direct-messages', { defaultValue: 'Direct messages' })}
                        </h3>
                        <p className="text-sm text-site-text-muted">
                          {t('direct-messages-hint', {
                            defaultValue: 'Choose who can start a new conversation with you.',
                          })}
                        </p>
                      </div>
                    </div>
                    <Label htmlFor="profile-dm-privacy">
                      {t('dm-privacy-label', { defaultValue: 'Who can message you' })}
                    </Label>
                    <Select
                      id="profile-dm-privacy"
                      value={dmPrivacy}
                      onChange={(event) => setDmPrivacy(event.target.value)}
                      className="mt-2"
                    >
                      <option value="EVERYONE">
                        {t('dm-everyone', { defaultValue: 'Everyone' })}
                      </option>
                      <option value="FOLLOWERS">
                        {t('dm-followers', { defaultValue: 'People I follow' })}
                      </option>
                      <option value="NONE">{t('dm-none', { defaultValue: 'Nobody' })}</option>
                    </Select>
                    <p className="mt-2 text-xs text-site-text-dim">
                      {dmPrivacy === 'EVERYONE'
                        ? t('dm-everyone-hint', {
                            defaultValue: 'Anyone can send you a direct message.',
                          })
                        : dmPrivacy === 'FOLLOWERS'
                          ? t('dm-followers-hint', {
                              defaultValue: 'Only people you follow can message you.',
                            })
                          : t('dm-none-hint', {
                              defaultValue: 'No one can send you direct messages.',
                            })}
                    </p>
                  </section>
                </div>
              ) : null}
            </div>

            <aside className="hidden md:block">
              <div className="sticky top-0 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                  <Sparkles className="size-3.5" aria-hidden />
                  {t('live-preview', { defaultValue: 'Live preview' })}
                </div>
                <EditorPreview
                  name={displayName}
                  handle={handle}
                  bio={bio}
                  image={avatarPreview}
                  banner={bannerPreview}
                />
                <p className="text-xs leading-relaxed text-site-text-dim">
                  {t('live-preview-hint', {
                    defaultValue:
                      'Your theme, badges, and frame remain applied when these changes are saved.',
                  })}
                </p>
              </div>
            </aside>
          </div>

          {error ? (
            <div
              className="mx-4 mb-3 rounded-site-sm border border-site-danger/40 bg-site-danger/10 px-3 py-2 text-sm text-site-danger md:mx-6"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="glass-fill sticky bottom-0 flex items-center justify-between gap-3 border-x-0 border-b-0 px-4 py-3 md:px-6">
            <p className="hidden text-xs text-site-text-dim sm:block">
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
                variant="accent"
                onClick={handleSave}
                loading={submitting}
                loadingText={t('saving', { defaultValue: 'Saving…' })}
                disabled={!dirty || !canSave}
              >
                <Sparkles aria-hidden />
                {t('save-profile', { defaultValue: 'Save profile' })}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {cropSrc ? (
        <ImageCropModal
          imageSrc={cropSrc}
          onCropDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      ) : null}
    </>
  );
}
