/**
 * Pure state for the profile editor (A6): types, limits, and the derivations
 * the modal makes from its draft — dirty/can-save, handle sanitising, link
 * clean-up and the PATCH body. No React, no I/O.
 */
import { PROFILE_BANNER_MAX_MB } from '@/lib/profile/banner';
import type { SpotifyTrack } from '../SpotifySongSearch';

export interface ProfileSongData {
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface SavedProfileData extends Partial<ProfileSongData> {
  displayName?: string | null;
  handle?: string | null;
  image?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  links?: ProfileLink[];
  bannerUrl?: string | null;
  tipGoal?: number | null;
  tipGoalLabel?: string | null;
  membershipPriceCoins?: number | null;
  showLikes?: boolean;
  dmPrivacy?: string;
}

export interface ProfileEditInitial extends ProfileSongData {
  handle: string | null;
  handleCooldownMs: number;
  name: string | null;
  image: string | null;
  hasCustomAvatar?: boolean;
  bannerUrl?: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  links?: ProfileLink[];
  showLikes: boolean;
  dmPrivacy: string;
  tipGoal?: number | null;
  tipGoalLabel?: string | null;
  membershipPriceCoins?: number | null;
}

/**
 * The whole picture a banner is cropped from. `kept` means the server already holds it (it
 * was read back to adjust the crop), so a save sends only the new crop; otherwise it is a
 * picture chosen in this session and is uploaded with the crop as the new source.
 */
export interface BannerPicture {
  blob: Blob;
  kept: boolean;
}

/** A banner picture open in the cropper; `src` is an object URL for `blob`. */
export interface BannerCropSession extends BannerPicture {
  src: string;
}

/** The multipart body of a banner save (`uploadBannerApi`). */
export function buildBannerUpload(crop: File, picture: BannerPicture | null): FormData {
  const form = new FormData();
  form.append('banner', crop);
  if (picture?.kept) form.append('source', 'keep');
  else if (picture) form.append('original', picture.blob, 'original');
  return form;
}

export type EditorSection = 'identity' | 'links' | 'creator' | 'privacy';
export type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export const MAX_NAME = 50;
export const MAX_BIO = 160;
export const MAX_LOCATION = 100;
export const MAX_WEBSITE = 200;
export const MAX_AVATAR_MB = 5;
export const MAX_BANNER_MB = PROFILE_BANNER_MAX_MB;
export const MAX_HANDLE = 20;

/** The editable draft the dirty/save derivations read. */
export interface ProfileDraft {
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  links: ProfileLink[];
  showLikes: boolean;
  dmPrivacy: string;
  tipGoal: string;
  tipGoalLabel: string;
  membershipPrice: string;
  avatarFile: File | null;
  bannerFile: File | null;
  bannerRemoved: boolean;
  selectedSong: SpotifyTrack | null;
}

/** Numeric field as the form holds it: '' when unset. */
export const coinsToField = (value: number | null | undefined): string =>
  value ? String(value) : '';

/** Field text -> API number: blank is null, anything else a non-negative int. */
export function fieldToCoins(value: string): number | null {
  return value.trim() ? Math.max(0, Number.parseInt(value, 10) || 0) : null;
}

export function songFromInitial(initial: ProfileSongData): SpotifyTrack | null {
  return initial.profileSongSpotifyId
    ? {
        id: initial.profileSongSpotifyId,
        title: initial.profileSongTitle ?? '',
        artist: initial.profileSongArtist ?? '',
        previewUrl: initial.profileSongPreviewUrl,
        albumArt: initial.profileSongAlbumArt,
      }
    : null;
}

export function sanitizeHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, MAX_HANDLE);
}

/**
 * What a handle can be said about without asking the server: `'idle'` for an
 * empty or unchanged handle, `'invalid'` for a malformed one, `null` when the
 * availability check has to go to the network.
 */
export function localHandleStatus(value: string, current: string | null): HandleStatus | null {
  if (!value || value === current) return 'idle';
  if (value.length < 3 || !/^[a-z][a-z0-9_]*$/.test(value)) return 'invalid';
  return null;
}

/** Maps the `/api/handle/check` answer onto the editor's status. */
export function remoteHandleStatus(data: { available?: boolean; reason?: string }): HandleStatus {
  return data.available ? 'available' : data.reason ? 'invalid' : 'taken';
}

export function isDirty(draft: ProfileDraft, initial: ProfileEditInitial): boolean {
  const handleChanged = draft.handle !== (initial.handle ?? '');
  const songChanged = (draft.selectedSong?.id ?? null) !== initial.profileSongSpotifyId;
  const linksChanged = JSON.stringify(draft.links) !== JSON.stringify(initial.links ?? []);
  return (
    draft.displayName !== (initial.name ?? '') ||
    handleChanged ||
    draft.bio !== (initial.bio ?? '') ||
    draft.location !== (initial.location ?? '') ||
    draft.website !== (initial.website ?? '') ||
    linksChanged ||
    draft.showLikes !== initial.showLikes ||
    draft.dmPrivacy !== (initial.dmPrivacy ?? 'EVERYONE') ||
    draft.tipGoal !== coinsToField(initial.tipGoal) ||
    draft.tipGoalLabel !== (initial.tipGoalLabel ?? '') ||
    draft.membershipPrice !== coinsToField(initial.membershipPriceCoins) ||
    draft.avatarFile !== null ||
    draft.bannerFile !== null ||
    draft.bannerRemoved ||
    songChanged
  );
}

export function canSaveDraft(
  displayName: string,
  bio: string,
  handleChanged: boolean,
  handleStatus: HandleStatus,
): boolean {
  return (
    displayName.trim().length > 0 &&
    MAX_NAME - displayName.length >= 0 &&
    MAX_BIO - bio.length >= 0 &&
    (!handleChanged || handleStatus === 'available')
  );
}

export function cleanLinks(links: ProfileLink[]): ProfileLink[] {
  return links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label && link.url);
}

/** The PATCH /api/profile body for a draft. */
export function buildProfilePatch(draft: ProfileDraft, handleChanged: boolean) {
  return {
    ...(handleChanged ? { handle: draft.handle.trim() } : {}),
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim() || null,
    location: draft.location.trim() || null,
    website: draft.website.trim() || null,
    links: cleanLinks(draft.links),
    tipGoal: fieldToCoins(draft.tipGoal),
    tipGoalLabel: draft.tipGoalLabel.trim() || null,
    membershipPriceCoins: fieldToCoins(draft.membershipPrice),
    showLikes: draft.showLikes,
    dmPrivacy: draft.dmPrivacy,
    profileSongSpotifyId: draft.selectedSong?.id ?? null,
    profileSongTitle: draft.selectedSong?.title ?? null,
    profileSongArtist: draft.selectedSong?.artist ?? null,
    profileSongPreviewUrl: draft.selectedSong?.previewUrl ?? null,
    profileSongAlbumArt: draft.selectedSong?.albumArt ?? null,
  };
}

/** Revokes an object URL the editor created (leaves server URLs alone). */
export function revokeBlob(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}
