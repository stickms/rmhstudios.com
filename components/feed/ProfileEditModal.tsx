'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropModal } from './ImageCropModal';
import { SpotifySongSearch, type SpotifyTrack } from './SpotifySongSearch';
import { useResolvedUser } from '@/components/Providers';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface ProfileSongData {
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
}

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (data: {
    displayName?: string | null;
    handle?: string | null;
    image?: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    showLikes: boolean;
    dmPrivacy: string;
  } & ProfileSongData) => void;
  initial: {
    handle: string | null;
    handleCooldownMs: number;
    name: string | null;
    image: string | null;
    hasCustomAvatar?: boolean;
    bio: string | null;
    location: string | null;
    website: string | null;
    showLikes: boolean;
    dmPrivacy: string;
    tipGoal?: number | null;
    tipGoalLabel?: string | null;
  } & ProfileSongData;
}

const MAX_NAME = 50;
const MAX_BIO = 160;
const MAX_LOCATION = 100;
const MAX_WEBSITE = 200;
const MAX_AVATAR_MB = 5;
const MAX_HANDLE = 20;

function formatCooldown(ms: number, t: TFunction<"feed">): string {
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 1) return t("cooldown-less-than-a-day", { defaultValue: "less than a day" });
  return t("cooldown-days", { days, defaultValue: "{{days}} days" });
}

export function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const { t } = useTranslation("feed");
  const { refresh: refreshResolvedUser } = useResolvedUser();
  const [handle, setHandle] = useState(initial.handle ?? '');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [displayName, setDisplayName] = useState(initial.name ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [website, setWebsite] = useState(initial.website ?? '');
  const [showLikes, setShowLikes] = useState(initial.showLikes);
  const [dmPrivacy, setDmPrivacy] = useState(initial.dmPrivacy ?? 'EVERYONE');
  const [tipGoal, setTipGoal] = useState<string>(initial.tipGoal ? String(initial.tipGoal) : '');
  const [tipGoalLabel, setTipGoalLabel] = useState(initial.tipGoalLabel ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.image);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resettingAvatar, setResettingAvatar] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [hasCustomAvatar, setHasCustomAvatar] = useState(initial.hasCustomAvatar ?? false);
  const [avatarWasReset, setAvatarWasReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  const [selectedSong, setSelectedSong] = useState<SpotifyTrack | null>(
    initial.profileSongSpotifyId
      ? {
          id: initial.profileSongSpotifyId,
          title: initial.profileSongTitle ?? '',
          artist: initial.profileSongArtist ?? '',
          previewUrl: initial.profileSongPreviewUrl ?? '',
          albumArt: initial.profileSongAlbumArt,
        }
      : null
  );

  const bioRemaining = MAX_BIO - bio.length;
  const nameRemaining = MAX_NAME - displayName.length;
  const handleChanged = handle !== (initial.handle ?? '');
  const handleOnCooldown = initial.handleCooldownMs > 0;

  // Handle availability check with debounce
  const checkHandle = useCallback(async (value: string) => {
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
      const data = await res.json();
      if (data.available) {
        setHandleStatus('available');
      } else {
        setHandleStatus(data.reason ? 'invalid' : 'taken');
      }
    } catch {
      setHandleStatus('idle');
    }
  }, [initial.handle]);

  const handleHandleChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_HANDLE);
    setHandle(sanitized);

    if (handleCheckTimeout.current) clearTimeout(handleCheckTimeout.current);
    handleCheckTimeout.current = setTimeout(() => checkHandle(sanitized), 400);
  };

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (cropSrc && cropSrc.startsWith('blob:')) {
        URL.revokeObjectURL(cropSrc);
      }
    };
  }, [avatarPreview, cropSrc]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setError(t("avatar-size-error", { maxMb: MAX_AVATAR_MB, defaultValue: `Avatar must be under ${MAX_AVATAR_MB} MB` }));
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropDone = (croppedBlob: Blob) => {
    if (cropSrc && cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);

    const croppedFile = new File([croppedBlob], 'avatar.png', { type: 'image/png' });
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  };

  const handleCropCancel = () => {
    if (cropSrc && cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleResetAvatar = async () => {
    setResettingAvatar(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("failed-reset-avatar", { defaultValue: "Failed to reset avatar" }));
        return;
      }
      const data = await res.json();
      // Clear local avatar state, show fallback (OAuth image or default)
      setAvatarFile(null);
      if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(data.image);
      setHasCustomAvatar(false);
      setAvatarWasReset(true);
      // Update sidebar/navbar immediately
      refreshResolvedUser();
      // Notify parent so profile page updates the displayed image
      onSaved({
        image: data.image,
        displayName: displayName.trim() || initial.name,
        bio: bio.trim() || null,
        location: location.trim() || null,
        website: website.trim() || null,
        showLikes,
        dmPrivacy,
        profileSongSpotifyId: selectedSong?.id ?? null,
        profileSongTitle: selectedSong?.title ?? null,
        profileSongArtist: selectedSong?.artist ?? null,
        profileSongPreviewUrl: selectedSong?.previewUrl ?? null,
        profileSongAlbumArt: selectedSong?.albumArt ?? null,
      });
    } catch {
      setError(t("failed-reset-avatar", { defaultValue: "Failed to reset avatar" }));
    } finally {
      setResettingAvatar(false);
      setShowResetConfirm(false);
    }
  };

  const handleSave = async () => {
    if (submitting) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setError(t("display-name-empty", { defaultValue: "Display name cannot be empty" }));
      return;
    }

    if (handleChanged && handleStatus === 'taken') {
      setError(t("handle-taken", { defaultValue: "Handle is already taken" }));
      return;
    }

    if (handleChanged && handleStatus === 'invalid') {
      setError(t("handle-invalid", { defaultValue: "Handle must start with a letter and contain only lowercase letters, numbers, and underscores (min 3 chars)" }));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let newImageUrl: string | undefined;

      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        const avatarRes = await fetch('/api/profile/avatar', {
          method: 'POST',
          body: formData,
        });
        if (!avatarRes.ok) {
          const data = await avatarRes.json();
          setError(data.error || t("failed-upload-avatar", { defaultValue: "Failed to upload avatar" }));
          setSubmitting(false);
          return;
        }
        const avatarData = await avatarRes.json();
        newImageUrl = avatarData.image;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(handleChanged ? { handle: handle.trim() } : {}),
          displayName: trimmedName,
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
          tipGoal: tipGoal.trim() ? Math.max(0, parseInt(tipGoal, 10) || 0) : null,
          tipGoalLabel: tipGoalLabel.trim() || null,
          showLikes,
          dmPrivacy,
          profileSongSpotifyId: selectedSong?.id ?? null,
          profileSongTitle: selectedSong?.title ?? null,
          profileSongArtist: selectedSong?.artist ?? null,
          profileSongPreviewUrl: selectedSong?.previewUrl ?? null,
          profileSongAlbumArt: selectedSong?.albumArt ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("failed-save", { defaultValue: "Failed to save" }));
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      onSaved({
        ...data,
        ...(newImageUrl !== undefined
          ? { image: newImageUrl }
          : avatarWasReset
            ? { image: avatarPreview }
            : {}),
      });
      onClose();
    } catch {
      setError(t("failed-save", { defaultValue: "Failed to save" }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        <div
          className="relative bg-site-bg border border-site-border rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
            <h2 className="font-bold text-site-text">{t("edit-profile", { defaultValue: "Edit Profile" })}</h2>
            <button
              onClick={onClose}
              aria-label={t("close", { defaultValue: "Close" })}
              className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="px-4 py-4 space-y-4 overflow-y-auto">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("avatar-change-hint", { maxMb: MAX_AVATAR_MB, defaultValue: "Click to change avatar (max {{maxMb}} MB)" })}
                className="relative group w-20 h-20 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-site-bg font-bold text-2xl ring-4 ring-site-bg shrink-0 overflow-hidden cursor-pointer transition-transform active:scale-95"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt={t("avatar-alt", { defaultValue: "Avatar" })} className="w-full h-full rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }} />
                ) : (
                  (displayName?.[0] || initial.name?.[0] || 'U').toUpperCase()
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
              <p className="text-xs text-site-text-dim">{t("avatar-change-hint", { maxMb: MAX_AVATAR_MB, defaultValue: "Click to change avatar (max {{maxMb}} MB)" })}</p>
              {(hasCustomAvatar || avatarFile) && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1 text-xs text-site-text-dim hover:text-site-danger transition-colors active:scale-95"
                  title={t("reset-avatar-title", { defaultValue: "Reset to default avatar" })}
                >
                  <RotateCcw className="w-3 h-3" />
                  {t("reset-avatar", { defaultValue: "Reset avatar" })}
                </button>
              )}
            </div>

            {/* Handle */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("handle-label", { defaultValue: "Handle" })}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-dim text-sm">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  placeholder={t("handle-placeholder", { defaultValue: "your_handle" })}
                  maxLength={MAX_HANDLE}
                  disabled={handleOnCooldown}
                  className={`w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 pl-7 border outline-none transition-colors ${
                    handleOnCooldown
                      ? 'border-site-border opacity-60 cursor-not-allowed'
                      : handleStatus === 'available'
                      ? 'border-emerald-500'
                      : handleStatus === 'taken' || handleStatus === 'invalid'
                      ? 'border-red-400'
                      : 'border-site-border focus:border-site-accent'
                  }`}
                />
                {handleChanged && handleStatus === 'checking' && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim animate-spin" />
                )}
                {handleChanged && handleStatus === 'available' && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                )}
                {handleChanged && handleStatus === 'taken' && (
                  <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                )}
              </div>
              <div className="mt-1">
                {handleOnCooldown ? (
                  <p className="text-xs text-site-text-dim">
                    {t("handle-cooldown", { cooldown: formatCooldown(initial.handleCooldownMs, t), defaultValue: "You can change your handle again in {{cooldown}}" })}
                  </p>
                ) : handleChanged && handleStatus === 'available' ? (
                  <p className="text-xs text-emerald-500">{t("handle-available", { defaultValue: "Handle is available" })}</p>
                ) : handleChanged && handleStatus === 'taken' ? (
                  <p className="text-xs text-red-400">{t("handle-taken", { defaultValue: "Handle is already taken" })}</p>
                ) : handleChanged && handleStatus === 'invalid' ? (
                  <p className="text-xs text-red-400">{t("handle-invalid-hint", { defaultValue: "Must start with a letter, 3-20 chars, lowercase letters/numbers/underscores only" })}</p>
                ) : (
                  <p className="text-xs text-site-text-dim">{t("handle-hint", { defaultValue: "Your unique handle for @mentions and profile URL" })}</p>
                )}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("display-name-label", { defaultValue: "Display Name" })}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("display-name-placeholder", { defaultValue: "Your display name" })}
                maxLength={MAX_NAME}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
              <span className={`text-xs font-mono ${nameRemaining <= 10 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                {nameRemaining}
              </span>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("bio-label", { defaultValue: "Bio" })}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bio-placeholder", { defaultValue: "Tell people about yourself" })}
                rows={3}
                maxLength={MAX_BIO}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
              />
              <span className={`text-xs font-mono ${bioRemaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                {bioRemaining}
              </span>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("location-label", { defaultValue: "Location" })}</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("location-placeholder", { defaultValue: "Where are you based?" })}
                maxLength={MAX_LOCATION}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("website-label", { defaultValue: "Website" })}</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                maxLength={MAX_WEBSITE}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
            </div>

            {/* Tip goal (creator) */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("tip-goal-label", { defaultValue: "Monthly tip goal (coins) — optional" })}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={tipGoal}
                  onChange={(e) => setTipGoal(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-32 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
                />
                <input
                  type="text"
                  value={tipGoalLabel}
                  onChange={(e) => setTipGoalLabel(e.target.value)}
                  placeholder={t("tip-goal-label-placeholder", { defaultValue: "Goal label (e.g. New mic fund)" })}
                  maxLength={80}
                  className="flex-1 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
                />
              </div>
            </div>

            {/* Show Likes toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-site-text">{t("show-liked-posts", { defaultValue: "Show liked posts" })}</p>
                <p className="text-xs text-site-text-dim mt-0.5">{t("show-liked-posts-hint", { defaultValue: "Let others see posts you've liked" })}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLikes(!showLikes)}
                role="switch"
                aria-checked={showLikes}
                aria-label={t("show-liked-posts", { defaultValue: "Show liked posts" })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-150 ${
                  showLikes ? 'bg-site-accent' : 'bg-site-surface border border-site-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${
                    showLikes ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* DM Privacy */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">{t("dm-privacy-label", { defaultValue: "Who can message you" })}</label>
              <select
                value={dmPrivacy}
                onChange={(e) => setDmPrivacy(e.target.value)}
                className="w-full bg-site-surface text-site-text text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors appearance-none cursor-pointer"
              >
                <option value="EVERYONE">{t("dm-everyone", { defaultValue: "Everyone" })}</option>
                <option value="FOLLOWERS">{t("dm-followers", { defaultValue: "People I follow" })}</option>
                <option value="NONE">{t("dm-none", { defaultValue: "Nobody" })}</option>
              </select>
              <p className="text-xs text-site-text-dim mt-1">
                {dmPrivacy === 'EVERYONE' && t("dm-everyone-hint", { defaultValue: "Anyone can send you a direct message." })}
                {dmPrivacy === 'FOLLOWERS' && t("dm-followers-hint", { defaultValue: "Only people you follow can message you." })}
                {dmPrivacy === 'NONE' && t("dm-none-hint", { defaultValue: "No one can send you direct messages." })}
              </p>
            </div>

            {/* Profile Song */}
            <SpotifySongSearch
              selected={selectedSong}
              onSelect={setSelectedSong}
            />

            {error && (
              <p className="text-sm text-site-danger">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-site-border">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="accent" size="sm" disabled={submitting} onClick={handleSave}>
              {submitting ? t("saving", { defaultValue: "Saving..." }) : t("save", { defaultValue: "Save" })}
            </Button>
          </div>
        </div>
      </div>

      {/* Image crop modal */}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onCropDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}

      {/* Reset avatar confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-300 flex items-center justify-center" onClick={() => setShowResetConfirm(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-site-bg border border-site-border rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-site-text mb-2">{t("reset-avatar-confirm-title", { defaultValue: "Reset avatar?" })}</h3>
            <p className="text-sm text-site-text-muted mb-4">
              {t("reset-avatar-confirm-body", { defaultValue: "This will remove your custom avatar and revert to your default profile picture. This action cannot be undone." })}
            </p>
            {error && <p className="text-sm text-site-danger mb-3">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)} disabled={resettingAvatar}>
                {t("cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={resettingAvatar}
                onClick={handleResetAvatar}
                className="bg-site-danger hover:bg-site-danger/80 text-white"
              >
                {resettingAvatar ? t("resetting", { defaultValue: "Resetting..." }) : t("reset-avatar-btn", { defaultValue: "Reset Avatar" })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
