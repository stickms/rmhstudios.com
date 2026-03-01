'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropModal } from './ImageCropModal';
import { SpotifySongSearch, type SpotifyTrack } from './SpotifySongSearch';

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
    image?: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    showLikes: boolean;
  } & ProfileSongData) => void;
  initial: {
    name: string | null;
    image: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    showLikes: boolean;
  } & ProfileSongData;
}

const MAX_NAME = 50;
const MAX_BIO = 160;
const MAX_LOCATION = 100;
const MAX_WEBSITE = 200;
const MAX_AVATAR_MB = 5;

export function ProfileEditModal({ open, onClose, onSaved, initial }: ProfileEditModalProps) {
  const [displayName, setDisplayName] = useState(initial.name ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [website, setWebsite] = useState(initial.website ?? '');
  const [showLikes, setShowLikes] = useState(initial.showLikes);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.image);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setError(`Avatar must be under ${MAX_AVATAR_MB} MB`);
      return;
    }

    setError(null);
    // Open crop modal with the selected image
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);

    // Reset input so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropDone = (croppedBlob: Blob) => {
    // Clean up the source image URL
    if (cropSrc && cropSrc.startsWith('blob:')) {
      URL.revokeObjectURL(cropSrc);
    }
    setCropSrc(null);

    // Revoke old preview
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }

    const croppedFile = new File([croppedBlob], 'avatar.png', { type: 'image/png' });
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
  };

  const handleCropCancel = () => {
    if (cropSrc && cropSrc.startsWith('blob:')) {
      URL.revokeObjectURL(cropSrc);
    }
    setCropSrc(null);
  };

  const handleSave = async () => {
    if (submitting) return;

    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setError('Display name cannot be empty');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let newImageUrl: string | undefined;

      // Step 1: Upload avatar if changed
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        const avatarRes = await fetch('/api/profile/avatar', {
          method: 'POST',
          body: formData,
        });
        if (!avatarRes.ok) {
          const data = await avatarRes.json();
          setError(data.error || 'Failed to upload avatar');
          setSubmitting(false);
          return;
        }
        const avatarData = await avatarRes.json();
        newImageUrl = avatarData.image;
      }

      // Step 2: Save text fields + song
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: trimmedName,
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
          showLikes,
          profileSongSpotifyId: selectedSong?.id ?? null,
          profileSongTitle: selectedSong?.title ?? null,
          profileSongArtist: selectedSong?.artist ?? null,
          profileSongPreviewUrl: selectedSong?.previewUrl ?? null,
          profileSongAlbumArt: selectedSong?.albumArt ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      onSaved({
        ...data,
        ...(newImageUrl !== undefined ? { image: newImageUrl } : {}),
      });
      onClose();
    } catch {
      setError('Failed to save');
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
            <h2 className="font-bold text-site-text">Edit Profile</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
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
                className="relative group w-20 h-20 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-2xl ring-4 ring-site-bg shrink-0 overflow-hidden cursor-pointer"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full rounded-full object-cover" />
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
              <p className="text-xs text-site-text-dim">Click to change avatar (max {MAX_AVATAR_MB} MB)</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                maxLength={MAX_NAME}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
              <span className={`text-xs font-mono ${nameRemaining <= 10 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                {nameRemaining}
              </span>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself"
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
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Where are you based?"
                maxLength={MAX_LOCATION}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-xs font-medium text-site-text-dim mb-1.5">Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                maxLength={MAX_WEBSITE}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border outline-none focus:border-site-accent transition-colors"
              />
            </div>

            {/* Show Likes toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-site-text">Show liked posts</p>
                <p className="text-xs text-site-text-dim mt-0.5">Let others see posts you&apos;ve liked</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLikes(!showLikes)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  showLikes ? 'bg-site-accent' : 'bg-site-surface border border-site-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    showLikes ? 'translate-x-5' : ''
                  }`}
                />
              </button>
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
              Cancel
            </Button>
            <Button variant="accent" size="sm" disabled={submitting} onClick={handleSave}>
              {submitting ? 'Saving...' : 'Save'}
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
    </>
  );
}
