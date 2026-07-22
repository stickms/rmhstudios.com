'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  BarChart3,
  Calendar,
  Coins,
  Gift,
  Link as LinkIcon,
  MapPin,
  MessageCircle,
  Palette,
  Pencil,
  ShieldCheck,
  Star,
  Store,
  Trophy,
} from 'lucide-react';

import { AchievementBadgeStrip } from '@/components/feed/AchievementBadgeStrip';
import { StatusBadge } from '@/components/feed/StatusBadge';
import { StatusEditor } from '@/components/feed/StatusEditor';
import { VinylRecord } from '@/components/feed/VinylRecord';
import { AddToListSheet } from '@/components/lists/AddToListSheet';
import { WishButton } from '@/components/wishlist/WishButton';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { GlassPane } from '@/components/ui/liquid-glass';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';
import { safeHref } from '@/lib/url-safety';
import { SITE_URL } from '@/lib/seo';
import type { ProfileData } from './profile-types';

const DEFAULT_AVATAR = '/images/social/default_avatar.png';

function ProfileAvatar({
  image,
  name,
  frame,
  online,
}: {
  image: string | null;
  name: string | null;
  frame?: { color?: string; gradient?: string };
  online?: boolean;
}) {
  const { t } = useTranslation('feed');
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? DEFAULT_AVATAR : image;
  const avatar = (
    <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-site-surface-opaque text-3xl font-bold text-site-text shadow-site sm:size-28">
      {imgSrc ? (
        <img
          src={buildOptimizedUrl(imgSrc, 224, 112)}
          alt={name || t('user', { defaultValue: 'User' })}
          width={112}
          height={112}
          decoding="async"
          className="size-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        (name?.[0] || 'U').toUpperCase()
      )}
    </div>
  );

  return (
    <div className="relative shrink-0">
      {frame ? (
        <div
          className="rounded-full p-[3px] shadow-site"
          style={{ background: frame.gradient ?? frame.color }}
        >
          {avatar}
        </div>
      ) : (
        <div className="rounded-full border-[3px] border-site-glass-rim bg-site-bg p-0.5 shadow-site">
          {avatar}
        </div>
      )}
      {online ? (
        <span
          className="absolute bottom-1 right-1 size-5 rounded-full border-[3px] border-site-surface-opaque bg-site-success"
          title={t('online-now', { defaultValue: 'Online now' })}
          aria-label={t('online-now', { defaultValue: 'Online now' })}
        />
      ) : null}
    </div>
  );
}

function IdentityBadges({ profile }: { profile: ProfileData }) {
  const { t } = useTranslation('feed');
  return (
    <>
      {profile.cosmetics?.badge?.emoji ? (
        <span className="text-xl" title={t('equipped-badge', { defaultValue: 'Equipped badge' })}>
          {profile.cosmetics.badge.emoji}
        </span>
      ) : null}
      {profile.isVerified ? (
        <BadgeCheck
          className="size-5 shrink-0 text-site-success"
          aria-label={t('verified', { defaultValue: 'Verified' })}
        />
      ) : null}
      {profile.isAdmin ? (
        <ShieldCheck
          className="size-5 shrink-0 text-site-accent"
          aria-label={t('admin', { defaultValue: 'Admin' })}
        />
      ) : null}
    </>
  );
}

export interface ProfileHeroProps {
  profile: ProfileData;
  displayName: string | null | undefined;
  displayImage: string | null | undefined;
  signedIn: boolean;
  isPlaying: boolean;
  membershipBusy: boolean;
  messageSending: boolean;
  messageError: string | null;
  onTogglePlay: () => void;
  onEdit: () => void;
  onFollow: () => void;
  onMessage: () => void;
  onTip: () => void;
  onGift: () => void;
  onJoinMembership: () => void;
  onShowSocial: (type: 'followers' | 'following') => void;
  onShowAchievements: () => void;
}

export function ProfileHero({
  profile,
  displayName,
  displayImage,
  signedIn,
  isPlaying,
  membershipBusy,
  messageSending,
  messageError,
  onTogglePlay,
  onEdit,
  onFollow,
  onMessage,
  onTip,
  onGift,
  onJoinMembership,
  onShowSocial,
  onShowAchievements,
}: ProfileHeroProps) {
  const { t } = useTranslation('feed');
  const name = displayName || profile.username || t('user', { defaultValue: 'User' });
  const headerBackdrop = profile.cosmetics?.banner?.gradient ?? profile.cosmetics?.theme?.gradient;
  const joined = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(profile.createdAt),
  );
  const shareUrl = `${SITE_URL}/u/${profile.handle || profile.id}`;
  const progress = profile.tipGoal
    ? Math.min(100, ((profile.tipsThisMonth ?? 0) / profile.tipGoal) * 100)
    : 0;

  return (
    <div className="space-y-3 px-2 pt-3 sm:px-3">
      <GlassPane refract liquid className="relative overflow-hidden p-0">
        <div className="relative h-36 overflow-hidden sm:h-44">
          {profile.bannerUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${profile.bannerUrl})` }}
              aria-hidden
            />
          ) : headerBackdrop ? (
            <div className="absolute inset-0" style={{ background: headerBackdrop }} aria-hidden />
          ) : (
            <div
              className="absolute inset-0 bg-linear-to-br from-site-accent-dim via-site-glass-tint to-site-bg-subtle"
              aria-hidden
            />
          )}
          <div
            className="absolute inset-0 bg-linear-to-t from-site-surface-opaque via-site-bg/20 to-transparent"
            aria-hidden
          />
          {profile.profileSongSpotifyId && profile.profileSongAlbumArt ? (
            <div className="glass-fill absolute right-3 top-3 rounded-site-sm p-2 shadow-site-sm">
              <VinylRecord
                albumArt={profile.profileSongAlbumArt}
                title={profile.profileSongTitle ?? t('unknown', { defaultValue: 'Unknown' })}
                artist={profile.profileSongArtist ?? t('unknown', { defaultValue: 'Unknown' })}
                isPlaying={isPlaying}
                onToggle={onTogglePlay}
              />
            </div>
          ) : null}
        </div>

        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <ProfileAvatar
              image={displayImage ?? null}
              name={name}
              frame={profile.cosmetics?.avatarFrame}
              online={profile.isOnline}
            />
            <div className="mb-1 flex min-w-0 items-center justify-end gap-2">
              <CopyButton
                value={shareUrl}
                icon={LinkIcon}
                variant="secondary"
                size="icon"
                label={t('copy-profile-link', { defaultValue: 'Copy profile link' })}
              />
              <Button asChild variant="secondary" size="icon">
                <Link
                  to={`/store/${profile.handle || profile.id}` as string}
                  aria-label={t('storefront', { defaultValue: 'Storefront' })}
                  title={t('storefront', { defaultValue: 'Storefront' })}
                >
                  <Store aria-hidden />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2
                  className="truncate font-(family-name:--site-font-display) text-2xl font-bold tracking-[-0.025em] text-site-text sm:text-3xl"
                  style={
                    profile.cosmetics?.nameColor?.gradient
                      ? {
                          background: profile.cosmetics.nameColor.gradient,
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          color: 'transparent',
                        }
                      : profile.cosmetics?.nameColor?.color
                        ? { color: profile.cosmetics.nameColor.color }
                        : undefined
                  }
                >
                  {name}
                </h2>
                <IdentityBadges profile={profile} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-site-text-muted">
                {profile.handle ? <span>@{profile.handle}</span> : null}
                <Link
                  to="/predictions"
                  className="inline-flex items-center gap-1 rounded-full bg-site-warning/10 px-2 py-0.5 font-semibold text-site-warning transition-colors hover:bg-site-warning/15"
                  title={t('rmh-coins-count', {
                    count: profile.coins,
                    defaultValue: '{{count}} RMH Coins',
                  })}
                >
                  <CoinIcon className="size-3.5" />
                  <AnimatedCount value={profile.coins} format={(value) => value.toLocaleString()} />
                </Link>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {profile.isOwnProfile ? (
                <>
                  <Button variant="accent" onClick={onEdit} className="min-w-0 flex-1 sm:flex-none">
                    <Pencil aria-hidden />
                    {t('edit-profile', { defaultValue: 'Edit profile' })}
                  </Button>
                  <Button asChild variant="outline" size="icon">
                    <Link
                      to="/analytics"
                      aria-label={t('creator-analytics', { defaultValue: 'Creator analytics' })}
                      title={t('creator-analytics', { defaultValue: 'Creator analytics' })}
                    >
                      <BarChart3 aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon">
                    <Link
                      to="/settings/profile"
                      aria-label={t('profile-cosmetics-title', {
                        defaultValue: 'Profile customization',
                      })}
                      title={t('profile-cosmetics-title', {
                        defaultValue: 'Profile customization',
                      })}
                    >
                      <Palette aria-hidden />
                    </Link>
                  </Button>
                </>
              ) : signedIn ? (
                <>
                  <Button
                    variant={profile.isFollowing ? 'outline' : 'accent'}
                    onClick={onFollow}
                    aria-pressed={profile.isFollowing}
                    className="min-w-28 flex-1 sm:flex-none"
                  >
                    {profile.isFollowing
                      ? t('following', { defaultValue: 'Following' })
                      : t('follow', { defaultValue: 'Follow' })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onMessage}
                    loading={messageSending}
                    aria-label={t('message', { defaultValue: 'Message' })}
                  >
                    <MessageCircle aria-hidden />
                    <span className="hidden xs:inline">
                      {t('message', { defaultValue: 'Message' })}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onTip}
                    aria-label={t('send-a-tip', { defaultValue: 'Send a tip' })}
                    title={t('send-a-tip', { defaultValue: 'Send a tip' })}
                  >
                    <Coins className="text-site-warning" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onGift}
                    aria-label={t('gift-a-membership', { defaultValue: 'Gift a membership' })}
                    title={t('gift-a-membership', { defaultValue: 'Gift a membership' })}
                  >
                    <Gift className="text-site-accent" aria-hidden />
                  </Button>
                </>
              ) : (
                <Button asChild variant="accent" className="w-full sm:w-auto">
                  <Link to="/login" search={{ callbackURL: `/u/${profile.handle || profile.id}` }}>
                    {t('sign-in-to-follow', { defaultValue: 'Sign in to follow' })}
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {messageError ? (
            <p role="alert" className="mt-3 text-sm text-site-danger">
              {messageError}
            </p>
          ) : null}

          <div className="mt-4">
            {profile.isOwnProfile ? (
              <StatusEditor initial={profile.status ?? null} />
            ) : profile.status ? (
              <StatusBadge status={profile.status} />
            ) : null}
          </div>

          {profile.bio ? (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-[15px] leading-relaxed text-site-text">
              {profile.bio}
            </p>
          ) : profile.isOwnProfile ? (
            <button
              type="button"
              onClick={onEdit}
              className="mt-4 text-sm text-site-text-muted hover:text-site-accent"
            >
              {t('add-profile-bio', {
                defaultValue: 'Add a bio so people know what you make and love.',
              })}
            </button>
          ) : null}

          <div
            className="mt-5 grid grid-cols-3 gap-2"
            aria-label={t('profile-stats', { defaultValue: 'Profile stats' })}
          >
            <button
              type="button"
              onClick={() => onShowSocial('followers')}
              className="glass-fill glass-interactive rounded-site-sm px-2 py-3 text-center"
              data-glass-light=""
            >
              <AnimatedCount
                value={profile.followerCount}
                format={(value) => value.toLocaleString()}
                className="block text-lg font-bold text-site-text"
              />
              <span className="text-xs text-site-text-muted">
                {t('followers-label', { defaultValue: 'Followers' })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onShowSocial('following')}
              className="glass-fill glass-interactive rounded-site-sm px-2 py-3 text-center"
              data-glass-light=""
            >
              <AnimatedCount
                value={profile.followingCount}
                format={(value) => value.toLocaleString()}
                className="block text-lg font-bold text-site-text"
              />
              <span className="text-xs text-site-text-muted">
                {t('following-label', { defaultValue: 'Following' })}
              </span>
            </button>
            <div className="glass-fill rounded-site-sm px-2 py-3 text-center">
              <AnimatedCount
                value={profile.rmharkCount}
                format={(value) => value.toLocaleString()}
                className="block text-lg font-bold text-site-text"
              />
              <span className="text-xs text-site-text-muted">
                {t('rmharks-label', { defaultValue: 'RMHarks' })}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-site-text-muted">
            {profile.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {profile.location}
              </span>
            ) : null}
            {profile.website ? (
              <a
                href={safeHref(profile.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-site-accent hover:underline"
              >
                <LinkIcon className="size-4 shrink-0" aria-hidden />
                <span className="max-w-64 truncate">
                  {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </span>
              </a>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" aria-hidden />
              {t('joined-date', { date: joined, defaultValue: 'Joined {{date}}' })}
            </span>
          </div>

          {profile.links?.length ? (
            <div
              className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
              aria-label={t('profile-links', { defaultValue: 'Profile links' })}
            >
              {profile.links.map((link, index) => (
                <a
                  key={`${link.url}-${index}`}
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-fill glass-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-site-text"
                  data-glass-light=""
                >
                  <LinkIcon className="size-3.5" aria-hidden />
                  <span className="max-w-48 truncate">{link.label}</span>
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-4">
            <AchievementBadgeStrip userId={profile.id} onShowAll={onShowAchievements} />
          </div>

          {!profile.isOwnProfile ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-site-border pt-4">
              <WishButton
                entityType="creator_builds"
                entityId={profile.id}
                label={t('notify-builds', { defaultValue: 'Notify me about builds' })}
              />
              <AddToListSheet targetUserId={profile.id} />
            </div>
          ) : null}
        </div>
      </GlassPane>

      {profile.membershipPriceCoins || profile.tipGoal ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {profile.membershipPriceCoins && profile.membershipPriceCoins > 0 ? (
            <section
              className="glass-fill rounded-site p-4"
              aria-labelledby="profile-membership-title"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                  <Star className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id="profile-membership-title" className="font-semibold text-site-text">
                    {t('creator-membership', { defaultValue: 'Creator membership' })}
                  </h3>
                  {profile.isOwnProfile ? (
                    <p className="mt-1 text-sm text-site-text-muted">
                      {t('creator-member-summary', {
                        count: profile.memberCount ?? 0,
                        price: profile.membershipPriceCoins,
                        defaultValue: '{{count}} members · {{price}} coins/month',
                      })}
                    </p>
                  ) : profile.isMember ? (
                    <p className="mt-1 text-sm font-medium text-site-success">
                      {t('you-are-a-member', { defaultValue: "You're a member" })}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-site-text-muted">
                        {t('membership-pitch', {
                          price: profile.membershipPriceCoins,
                          defaultValue: 'Support this creator for {{price}} coins/month.',
                        })}
                      </p>
                      <Button
                        size="sm"
                        variant="accent"
                        className="mt-3"
                        loading={membershipBusy}
                        disabled={!signedIn}
                        onClick={onJoinMembership}
                      >
                        {t('become-a-member', { defaultValue: 'Become a member' })}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {profile.tipGoal && profile.tipGoal > 0 ? (
            <section
              className="glass-fill rounded-site p-4"
              aria-labelledby="profile-tip-goal-title"
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id="profile-tip-goal-title"
                  className="inline-flex items-center gap-2 font-semibold text-site-text"
                >
                  <CoinIcon className="size-4" />
                  {profile.tipGoalLabel || t('tip-goal', { defaultValue: 'Tip goal' })}
                </h3>
                <span className="shrink-0 text-sm tabular-nums text-site-text-muted">
                  {(profile.tipsThisMonth ?? 0).toLocaleString()} /{' '}
                  {profile.tipGoal.toLocaleString()}
                </span>
              </div>
              <div className="glass-inset mt-3 h-2 overflow-hidden rounded-full p-0">
                <div
                  className="h-full rounded-full bg-site-warning transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {profile.modules?.length || profile.isOwnProfile ? (
        <div className="pt-1">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <Trophy className="size-3.5" aria-hidden />
            {t('profile-showcase', { defaultValue: 'Showcase' })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
