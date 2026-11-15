import {
  useRef,
  useState,
} from 'react';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import type { SpotifyTrack } from '../SpotifySongSearch';
import {
  MAX_BIO,
  MAX_NAME,
  canSaveDraft,
  coinsToField,
  isDirty,
  songFromInitial,
  type BannerCropSession,
  type BannerPicture,
  type EditorSection,
  type HandleStatus,
  type ProfileDraft,
  type ProfileEditInitial,
  type ProfileLink,
} from './profile-edit-state';

/**
 * Every field of the editor's draft plus its refs and derived flags. The
 * `useState` order here is the order the characterization suite seeds by
 * ordinal; keep it stable.
 */
export function useProfileEditForm(
  initial: ProfileEditInitial,
) {
  const [
    section,
    setSection,
  ] =
    useState<EditorSection>(
      'identity',
    );
  const [
    handle,
    setHandle,
  ] =
    useState(
      initial.handle ??
        '',
    );
  const [
    handleStatus,
    setHandleStatus,
  ] =
    useState<HandleStatus>(
      'idle',
    );
  const [
    displayName,
    setDisplayName,
  ] =
    useState(
      initial.name ??
        '',
    );
  const [
    bio,
    setBio,
  ] =
    useState(
      initial.bio ??
        '',
    );
  const [
    location,
    setLocation,
  ] =
    useState(
      initial.location ??
        '',
    );
  const [
    website,
    setWebsite,
  ] =
    useState(
      initial.website ??
        '',
    );
  const [
    links,
    setLinks,
  ] =
    useState<
      ProfileLink[]
    >(
      initial.links ??
        [],
    );
  const [
    showLikes,
    setShowLikes,
  ] =
    useState(
      initial.showLikes,
    );
  const [
    dmPrivacy,
    setDmPrivacy,
  ] =
    useState(
      initial.dmPrivacy ??
        'EVERYONE',
    );
  const [
    tipGoal,
    setTipGoal,
  ] =
    useState(
      coinsToField(
        initial.tipGoal,
      ),
    );
  const [
    tipGoalLabel,
    setTipGoalLabel,
  ] =
    useState(
      initial.tipGoalLabel ??
        '',
    );
  const [
    membershipPrice,
    setMembershipPrice,
  ] =
    useState(
      coinsToField(
        initial.membershipPriceCoins,
      ),
    );
  const [
    avatarFile,
    setAvatarFile,
  ] =
    useState<File | null>(
      null,
    );
  const [
    avatarPreview,
    setAvatarPreview,
  ] =
    useState<
      | string
      | null
    >(
      initial.image,
    );
  const [
    cropSrc,
    setCropSrc,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    bannerFile,
    setBannerFile,
  ] =
    useState<File | null>(
      null,
    );
  const [
    bannerPreview,
    setBannerPreview,
  ] =
    useState<
      | string
      | null
    >(
      initial.bannerUrl ??
        null,
    );
  const [
    bannerRemoved,
    setBannerRemoved,
  ] =
    useState(
      false,
    );
  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );
  const [
    resettingAvatar,
    setResettingAvatar,
  ] =
    useState(
      false,
    );
  const [
    hasCustomAvatar,
    setHasCustomAvatar,
  ] =
    useState(
      initial.hasCustomAvatar ??
        false,
    );
  const [
    error,
    setError,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    selectedSong,
    setSelectedSong,
  ] =
    useState<SpotifyTrack | null>(
      songFromInitial(
        initial,
      ),
    );
  // Banner cropping. Appended after the states above on purpose (see the note on order).
  const [
    bannerCrop,
    setBannerCrop,
  ] =
    useState<BannerCropSession | null>(
      null,
    );
  const [
    bannerPicture,
    setBannerPicture,
  ] =
    useState<BannerPicture | null>(
      null,
    );
  const [
    bannerLoading,
    setBannerLoading,
  ] =
    useState(
      false,
    );

  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const bannerInputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const handleCheckTimeout =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(
      null,
    );
  const bioRef =
    useRef<HTMLTextAreaElement>(
      null,
    );
  const insertBioEmoji =
    useEmojiInsert(
      bioRef,
      bio,
      setBio,
    );

  const draft: ProfileDraft =
    {
      handle,
      displayName,
      bio,
      location,
      website,
      links,
      showLikes,
      dmPrivacy,
      tipGoal,
      tipGoalLabel,
      membershipPrice,
      avatarFile,
      bannerFile,
      bannerRemoved,
      selectedSong,
    };
  const bioRemaining =
    MAX_BIO -
    bio.length;
  const nameRemaining =
    MAX_NAME -
    displayName.length;
  const handleChanged =
    handle !==
    (initial.handle ??
      '');
  const handleOnCooldown =
    initial.handleCooldownMs >
    0;
  const dirty =
    isDirty(
      draft,
      initial,
    );
  const canSave =
    canSaveDraft(
      displayName,
      bio,
      handleChanged,
      handleStatus,
    );

  return {
    section,
    setSection,
    handle,
    setHandle,
    handleStatus,
    setHandleStatus,
    displayName,
    setDisplayName,
    bio,
    setBio,
    location,
    setLocation,
    website,
    setWebsite,
    links,
    setLinks,
    showLikes,
    setShowLikes,
    dmPrivacy,
    setDmPrivacy,
    tipGoal,
    setTipGoal,
    tipGoalLabel,
    setTipGoalLabel,
    membershipPrice,
    setMembershipPrice,
    avatarFile,
    setAvatarFile,
    avatarPreview,
    setAvatarPreview,
    cropSrc,
    setCropSrc,
    bannerFile,
    setBannerFile,
    bannerPreview,
    setBannerPreview,
    bannerRemoved,
    setBannerRemoved,
    submitting,
    setSubmitting,
    resettingAvatar,
    setResettingAvatar,
    hasCustomAvatar,
    setHasCustomAvatar,
    error,
    setError,
    selectedSong,
    setSelectedSong,
    bannerCrop,
    setBannerCrop,
    bannerPicture,
    setBannerPicture,
    bannerLoading,
    setBannerLoading,
    fileInputRef,
    bannerInputRef,
    handleCheckTimeout,
    bioRef,
    insertBioEmoji,
    draft,
    bioRemaining,
    nameRemaining,
    handleChanged,
    handleOnCooldown,
    dirty,
    canSave,
  };
}

export type ProfileEditForm =
  ReturnType<
    typeof useProfileEditForm
  >;
