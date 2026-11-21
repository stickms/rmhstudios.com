import { useState } from 'react';
import { OfficeHoursProfileButton } from '@/components/calendar/OfficeHoursProfileButton';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CalendarDays, Coins, Gift, Link2, MapPin, ShieldCheck } from 'lucide-react';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';

import { AchievementBadgeStrip } from '@/components/feed/AchievementBadgeStrip';
import { EmojiText } from '@/components/ui/emoji';
import { StatusBadge } from '@/components/feed/StatusBadge';
import { StatusEditor } from '@/components/feed/StatusEditor';
import { VinylRecord } from '@/components/feed/VinylRecord';
import { AddToListSheet } from '@/components/lists/AddToListSheet';
import { WishButton } from '@/components/wishlist/WishButton';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { Button } from '@/components/ui/button';
import { CallButton } from '@/components/call/CallButton';
import { GroupCallButton } from '@/components/groupcall/GroupCallButton';
import { CopyButton } from '@/components/ui/copy-button';
import { ProfileStorefrontStrip } from '@/components/profile/ProfileStorefrontStrip';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';
import { safeHref } from '@/lib/url-safety';
import { getFeaturedProfileLink } from '@/lib/profile/featured-links';
import { SITE_URL } from '@/lib/seo';
import { ProfileIdentityExtras, ProfileShareCardButton } from './plus/ProfileIdentityExtras';
import { PresenceDot } from './PresenceDot';
import { BadgeMark } from '@/components/shop/art/BadgeMark';
import { PetMark } from '@/components/shop/art/PetMark';
import type { ProfileData } from './profile-types';
import { ProfileBanner } from './ProfileBanner';
import './profile.css';

const DEFAULT_AVATAR = '/images/social/default_avatar.png';

function ProfileAvatar({
  image,
  name,
  frame,
}: {
  image: string | null;
  name: string | null;
  frame?: { color?: string; gradient?: string };
}) {
  const { t } = useTranslation('feed');
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? DEFAULT_AVATAR : image;
  const avatar = (
    <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-site-bg-subtle text-xl font-semibold text-site-text">
      {imgSrc ? (
        <img
          src={buildOptimizedUrl(imgSrc, 128, 64)}
          alt={name || t('user', { defaultValue: 'User' })}
          width={64}
          height={64}
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
        <div className="rounded-full p-0.5" style={{ background: frame.gradient ?? frame.color }}>
          {avatar}
        </div>
      ) : (
        avatar
      )}
    </div>
  );
}

function IdentityBadges({ profile }: { profile: ProfileData }) {
  const { t } = useTranslation('feed');
  return (
    <>
      <BadgeMark
        badge={profile.cosmetics?.badge}
        size={24}
        title={t('equipped-badge', { defaultValue: 'Equipped badge' })}
        className="shrink-0"
      />
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
      {profile.isBot ? (
        <AutomatedBadge
          className="size-5"
          tip={t('bot-account-hint', {
            defaultValue: 'Automated account — its posts are AI-generated.',
          })}
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
  // The banner box holds the uploaded picture; without one, the equipped banner cosmetic, or else the equipped theme's
  // backdrop. Steel phase 5 dropped the element that drew this value and left the line that computed it.
  const headerBackdrop = profile.cosmetics?.banner?.gradient ?? profile.cosmetics?.theme?.gradient;
  const joined = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(profile.createdAt),
  );
  const shareUrl = `${SITE_URL}/u/${profile.handle || profile.id}`;
  // A link the site pins to this profile, distinct from the owner-editable
  // `profile.links`. Null for everyone who isn't in the registry.
  const featuredLink = getFeaturedProfileLink(profile.handle);
  const progress = profile.tipGoal
    ? Math.min(100, ((profile.tipsThisMonth ?? 0) / profile.tipGoal) * 100)
    : 0;

  const nameStyle = profile.cosmetics?.nameColor?.gradient
    ? {
        background: profile.cosmetics.nameColor.gradient,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : profile.cosmetics?.nameColor?.color
      ? { color: profile.cosmetics.nameColor.color }
      : undefined;
  const count = (n: number) => n.toLocaleString();

  // The head row ends in a column: the profile song, then the share card and the link copy under it, or in the song's
  // place when there is none. The facts line (location, website, joined) leads each fact with a decorative icon.
  // Steel section 10, Profile: the avatar at 64px, the name as the page title, the handle, a one-line bio, then Follow
  // (the one primary) and Message. No banner box, no stat tiles, no chips: what is left is words. The person's history
  // is the spine below (ProfileColumn).
  return (
    // Two columns: everything hangs in the first, and the song / share column sits beside it in the second, spanning
    // down the side, so it never pushes the bio below its own height (the bio follows the avatar row directly).
    <header className="profile-head grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 [&>*]:col-start-1">
      {profile.bannerUrl || headerBackdrop ? (
        <ProfileBanner
          src={profile.bannerUrl}
          backdrop={headerBackdrop}
          className="profile-head__banner col-span-full"
        />
      ) : null}

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <ProfileAvatar
            image={displayImage ?? null}
            name={name}
            frame={profile.cosmetics?.avatarFrame}
          />
          {profile.presence ? (
            <PresenceDot presence={profile.presence} className="absolute end-0 bottom-0" />
          ) : null}
          {/* The equipped pet keeps the avatar company at its lower start corner; the presence dot has the other one. */}
          <PetMark
            pet={profile.cosmetics?.pet}
            size={36}
            title={t('equipped-pet', { defaultValue: 'Equipped pet' })}
            className="pointer-events-none absolute -start-4 -bottom-3"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="t-title truncate" style={nameStyle}>
              <EmojiText>{name}</EmojiText>
            </h1>
            <IdentityBadges profile={profile} />
          </div>
          {profile.handle ? (
            <p className="t-meta mt-1" dir="ltr">
              @{profile.handle}
            </p>
          ) : null}
      </div>
      <div className="col-start-2! row-span-[20] flex shrink-0 flex-col items-end gap-1 self-start">
        {profile.profileSongSpotifyId && profile.profileSongAlbumArt ? (
          <VinylRecord
            albumArt={profile.profileSongAlbumArt}
            title={profile.profileSongTitle ?? t('unknown', { defaultValue: 'Unknown' })}
            artist={profile.profileSongArtist ?? t('unknown', { defaultValue: 'Unknown' })}
            isPlaying={isPlaying}
            onToggle={onTogglePlay}
          />
        ) : null}
        <ProfileShareCardButton profile={profile} />
        <CopyButton value={shareUrl} variant="ghost" size="xs">
          {t('copy-profile-link-short', { defaultValue: 'Copy link' })}
        </CopyButton>
      </div>

      {profile.bio ? (
        <p className="t-body mt-3 max-w-2xl whitespace-pre-wrap break-words">
          <EmojiText>{profile.bio}</EmojiText>
        </p>
      ) : profile.isOwnProfile ? (
        <button
          type="button"
          onClick={onEdit}
          className="t-body mt-3 text-site-text-muted underline"
        >
          {t('add-profile-bio', {
            defaultValue: 'Add a bio so people know what you make and love.',
          })}
        </button>
      ) : null}

      <ProfileIdentityExtras profile={profile} name={name} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {profile.isOwnProfile ? (
          <>
            <Button variant="default" onClick={onEdit}>
              {t('edit-profile', { defaultValue: 'Edit profile' })}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/analytics">
                {t('creator-analytics', { defaultValue: 'Creator analytics' })}
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/settings/profile">
                {t('profile-cosmetics-title', { defaultValue: 'Profile customization' })}
              </Link>
            </Button>
          </>
        ) : signedIn ? (
          <>
            <Button
              variant={profile.isFollowing ? 'default' : 'primary'}
              onClick={onFollow}
              aria-pressed={profile.isFollowing}
            >
              {profile.isFollowing
                ? t('following', { defaultValue: 'Following' })
                : t('follow', { defaultValue: 'Follow' })}
            </Button>
            <Button variant="default" onClick={onMessage} loading={messageSending}>
              {t('message', { defaultValue: 'Message' })}
            </Button>
            {/* Voice call. Hides itself when a call can't be placed; the server still decides whether this person takes
                calls from you. */}
            <CallButton
              user={{
                id: profile.id,
                name: profile.name ?? null,
                image: profile.image ?? null,
                handle: profile.handle ?? null,
              }}
            />
            <GroupCallButton
              seedUser={{
                id: profile.id,
                name: profile.name ?? null,
                handle: profile.handle ?? null,
                image: profile.image ?? null,
              }}
            />
            <OfficeHoursProfileButton userId={profile.id} />
            <Button variant="ghost" onClick={onTip}>
              {t('send-a-tip', { defaultValue: 'Send a tip' })}
            </Button>
            <Button variant="ghost" onClick={onGift}>
              {t('gift-a-membership', { defaultValue: 'Gift a membership' })}
            </Button>
          </>
        ) : (
          <Button asChild variant="primary">
            <Link to="/login" search={{ callbackURL: `/u/${profile.handle || profile.id}` }}>
              {t('sign-in-to-follow', { defaultValue: 'Sign in to follow' })}
            </Link>
          </Button>
        )}
      </div>

      {messageError ? (
        <p role="alert" className="t-body mt-3 text-site-danger">
          {messageError}
        </p>
      ) : null}

      <div className="mt-3">
        {profile.isOwnProfile ? (
          <StatusEditor initial={profile.status ?? null} />
        ) : profile.status ? (
          <StatusBadge status={profile.status} />
        ) : null}
      </div>

      <div
        className="t-body mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1"
        aria-label={t('profile-stats', { defaultValue: 'Profile stats' })}
      >
        <button type="button" onClick={() => onShowSocial('followers')} className="text-start">
          <AnimatedCount
            value={profile.followerCount}
            format={count}
            className="font-semibold text-site-text"
          />{' '}
          <span className="text-site-text-muted">
            {t('followers-label', { defaultValue: 'Followers' })}
          </span>
        </button>
        <button type="button" onClick={() => onShowSocial('following')} className="text-start">
          <AnimatedCount
            value={profile.followingCount}
            format={count}
            className="font-semibold text-site-text"
          />{' '}
          <span className="text-site-text-muted">
            {t('following-label', { defaultValue: 'Following' })}
          </span>
        </button>
        <span>
          <AnimatedCount
            value={profile.rmharkCount}
            format={count}
            className="font-semibold text-site-text"
          />{' '}
          <span className="text-site-text-muted">
            {t('rmharks-label', { defaultValue: 'RMHarks' })}
          </span>
        </span>
        <Link
          to="/predictions"
          className="text-site-text-muted"
          title={t('rmh-coins-count', {
            count: profile.coins,
            defaultValue: '{{count}} RMH Coins',
          })}
        >
          <AnimatedCount
            value={profile.coins}
            format={count}
            className="font-semibold text-site-text"
          />{' '}
          {t('rmh-coins-label', { defaultValue: 'coins' })}
        </Link>
      </div>

      <div className="t-meta mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {profile.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <EmojiText>{profile.location}</EmojiText>
          </span>
        ) : null}
        {profile.website ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Link2 aria-hidden className="size-3.5 shrink-0" />
            <a
              href={safeHref(profile.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-64 truncate underline"
            >
              {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          {t('joined-date', { date: joined, defaultValue: 'Joined {{date}}' })}
        </span>
      </div>

      {featuredLink || profile.links?.length ? (
        <p
          className="t-body mt-3 flex flex-wrap gap-x-4 gap-y-1"
          aria-label={t('profile-links', { defaultValue: 'Profile links' })}
        >
          {featuredLink ? (
            <Link to={featuredLink.to} className="max-w-48 truncate underline">
              {featuredLink.label}
            </Link>
          ) : null}
          {profile.links?.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={safeHref(link.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-48 truncate underline"
            >
              {link.label}
            </a>
          ))}
        </p>
      ) : null}

      <div className="mt-3">
        <AchievementBadgeStrip
          userId={profile.id}
          initial={profile.achievementStrip}
          onShowAll={onShowAchievements}
        />
      </div>

      {!profile.isOwnProfile ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <WishButton
            entityType="creator_builds"
            entityId={profile.id}
            label={t('notify-builds', { defaultValue: 'Notify me about builds' })}
          />
          <AddToListSheet targetUserId={profile.id} />
        </div>
      ) : null}

      <ProfileStorefrontStrip
        userKey={profile.handle || profile.id}
        isOwnProfile={!!profile.isOwnProfile}
      />

      {profile.membershipPriceCoins && profile.membershipPriceCoins > 0 ? (
        <section className="profile-head__block" aria-labelledby="profile-membership-title">
          <h2 id="profile-membership-title" className="t-label">
            {t('creator-membership', { defaultValue: 'Creator membership' })}
          </h2>
          {profile.isOwnProfile ? (
            <p className="t-body mt-1 text-site-text-muted">
              {t('creator-member-summary', {
                count: profile.memberCount ?? 0,
                price: profile.membershipPriceCoins,
                defaultValue: '{{count}} members · {{price}} coins/month',
              })}
            </p>
          ) : profile.isMember ? (
            <p className="t-body mt-1 font-semibold">
              {t('you-are-a-member', { defaultValue: "You're a member" })}
            </p>
          ) : (
            <>
              <p className="t-body mt-1 text-site-text-muted">
                {t('membership-pitch', {
                  price: profile.membershipPriceCoins,
                  defaultValue: 'Support this creator for {{price}} coins/month.',
                })}
              </p>
              <Button
                variant="default"
                className="mt-2"
                loading={membershipBusy}
                disabled={!signedIn}
                onClick={onJoinMembership}
              >
                {t('become-a-member', { defaultValue: 'Become a member' })}
              </Button>
            </>
          )}
        </section>
      ) : null}

      {profile.tipGoal && profile.tipGoal > 0 ? (
        <section className="profile-head__block" aria-labelledby="profile-tip-goal-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="profile-tip-goal-title" className="t-label">
              {profile.tipGoalLabel || t('tip-goal', { defaultValue: 'Tip goal' })}
            </h2>
            <span className="t-meta tabular-nums">
              {(profile.tipsThisMonth ?? 0).toLocaleString()} / {profile.tipGoal.toLocaleString()}
            </span>
          </div>
          <div
            className="mt-2 h-1 rounded-site-sm bg-site-border"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="h-full rounded-site-sm bg-site-text"
              style={{ inlineSize: `${progress}%` }}
            />
          </div>
        </section>
      ) : null}
    </header>
  );
}
