/**
 * How an RMHark bot looks, and when that look drifts. Pure and client-safe: the
 * network half (Openverse search, download, storage) is `./stock-image.server`,
 * and the bot worker wires the two together.
 *
 * Real accounts do not all wear the same kind of picture, so neither do bots:
 * most get a real photograph chosen to fit the persona (their dog, their
 * hobby, a view), some keep a cartoon avatar, some are just initials. About two
 * in three have a banner. Every picture is sourced online; none is generated.
 *
 * Drift is memoryless: each hourly refresh run gives every field a small
 * chance of changing, `1 / (meanDays * 24)`, so changes are spread out and
 * nothing flips on a schedule. Bots in their first two weeks do not drift.
 */
import { AVATAR_STYLES } from './persona';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A bot younger than this is never refreshed: a brand-new account does not redecorate. */
export const REFRESH_MIN_AGE_MS = 14 * DAY_MS;

export type AvatarKind = 'photo' | 'cartoon' | 'initials';

/** The share of each avatar kind. Photos dominate; the rest are what real users also have. */
export const AVATAR_KIND_WEIGHTS: Readonly<Record<AvatarKind, number>> = {
  photo: 0.72,
  cartoon: 0.16,
  initials: 0.12,
};

/** Share of bots that carry a banner. */
export const BANNER_SHARE = 0.65;

export function rollAvatarKind(r: number): AvatarKind {
  if (r < AVATAR_KIND_WEIGHTS.photo) return 'photo';
  if (r < AVATAR_KIND_WEIGHTS.photo + AVATAR_KIND_WEIGHTS.cartoon) return 'cartoon';
  return 'initials';
}

export function wantsBanner(r: number): boolean {
  return r < BANNER_SHARE;
}

/** Soft background fills for DiceBear avatars (hex without `#`, as the API takes them). */
const DICEBEAR_BACKGROUNDS = [
  'b6e3f4',
  'c0aede',
  'd1d4f9',
  'ffd5dc',
  'ffdfbf',
  'c1f0c1',
  'f4e1c1',
  'e0e0e0',
  '2f3e46',
  '1d3557',
] as const;

function pick<T>(items: readonly T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))]!;
}

/**
 * A cartoon avatar. It always carries `backgroundColor`, which is what tells it
 * apart from the legacy avatars every bot was minted with (see `isLegacyBotAvatar`).
 */
export function cartoonAvatarUrl(seed: string, rStyle: number, rBg: number): string {
  const style = pick(AVATAR_STYLES, rStyle);
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${pick(DICEBEAR_BACKGROUNDS, rBg)}`;
}

/** An initials avatar from the display name. */
export function initialsAvatarUrl(name: string, rBg: number): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=${pick(DICEBEAR_BACKGROUNDS, rBg)}`;
}

/** The avatar every bot was minted with before looks existed: DiceBear with no background. */
export function isLegacyBotAvatar(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.startsWith('https://api.dicebear.com/') && !url.includes('backgroundColor=');
}

/**
 * Stock-photo searches when the persona's own could not be generated. Things,
 * places, animals and faceless people only: a stranger's face is never used as
 * a persona's own.
 */
export const GENERIC_AVATAR_QUERIES = [
  'cat portrait',
  'dog portrait',
  'golden retriever',
  'sunset',
  'mountain lake',
  'coffee cup',
  'houseplant',
  'vinyl record',
  'film camera',
  'skateboard',
  'bicycle',
  'ocean wave',
  'night city lights',
  'silhouette at sunset',
  'hands holding coffee',
  'sunflower',
  'bookshelf',
  'guitar',
  'hiking trail',
  'retro car',
] as const;

export const GENERIC_BANNER_QUERIES = [
  'mountain landscape',
  'ocean horizon',
  'city skyline at night',
  'forest path',
  'desert dunes',
  'starry night sky',
  'autumn leaves',
  'snowy mountains',
  'beach sunset',
  'rolling hills',
  'lake reflection',
  'northern lights',
] as const;

export function genericAvatarQuery(r: number): string {
  return pick(GENERIC_AVATAR_QUERIES, r);
}

export function genericBannerQuery(r: number): string {
  return pick(GENERIC_BANNER_QUERIES, r);
}

/** Mean days between changes of each field. */
export interface DriftConfig {
  avatarDays: number;
  bannerDays: number;
  bioDays: number;
  nameDays: number;
}

export interface RefreshInput {
  createdAt: Date;
  image: string | null;
}

export interface RefreshPlan {
  avatar: boolean;
  banner: boolean;
  bio: boolean;
  name: boolean;
  /** The avatar change is the upgrade of a legacy DiceBear avatar, not ordinary drift. */
  legacy: boolean;
}

/** The chance that a field with a `meanDays` mean gap changes in one hourly run. */
export function hourlyChance(meanDays: number): number {
  if (!Number.isFinite(meanDays) || meanDays <= 0) return 0;
  return Math.min(1, 1 / (meanDays * 24));
}

/**
 * What one hourly run changes on one bot. A legacy avatar is always due, at any
 * age (it is the upgrade of a placeholder, not drift; the tick caps how many it
 * upgrades per run). Everything else is a draw, and never in the first two weeks.
 */
export function refreshPlan(
  bot: RefreshInput,
  cfg: DriftConfig,
  now: number,
  random: () => number,
): RefreshPlan {
  const legacy = isLegacyBotAvatar(bot.image);
  if (now - bot.createdAt.getTime() < REFRESH_MIN_AGE_MS) {
    return { avatar: legacy, banner: false, bio: false, name: false, legacy };
  }
  return {
    avatar: legacy || random() < hourlyChance(cfg.avatarDays),
    banner: random() < hourlyChance(cfg.bannerDays),
    bio: random() < hourlyChance(cfg.bioDays),
    name: random() < hourlyChance(cfg.nameDays),
    legacy,
  };
}
