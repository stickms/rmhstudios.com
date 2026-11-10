/**
 * Contracts for the admin queue, dashboard and on-call endpoints under
 * /api/admin/** (redesign audit C1, batch 7): reports, strike appeals, user
 * actions, redemptions, emoji packs, held market listings, flags, link rules,
 * the question-of-the-day queue, the economy / analytics dashboards, the
 * on-call watchdog and the bot worker. Client-safe: every type is `import
 * type`. Not covered on purpose: routes that parse their own body and answer a
 * bespoke 400 (albums reorder, redemption review, predictions, rideshare
 * decisions) and the multipart blog / challenge uploads.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { adminUserUpdateSchema } from '@/lib/admin/schemas';
import type { AdminReviewCounts } from '@/lib/useAdminReviewCount';
import type { CoinFlow, supplyShape } from '@/lib/economy/flows';
import type { EconomySnapshot } from '@/lib/economy/supply.server';
import type { createSeasonSchema } from '@/lib/forecasting/forecasting.server';
import type { OncallApiResponse } from '@/lib/oncall/dashboard';
import type { EffectiveRule } from '@/lib/ops/alarm-rules';
import type { ChartSeries, DeployMarker, RangeId } from '@/lib/ops/series';
import type { qotdAddSchema } from '@/lib/posts-plus/schema';
import type { BotWorkerSettingsInput } from '@/lib/rmhark-ai/bot-stats';
import type { BotActivityStats, BotWorkerSettingsView } from '@/lib/rmhark-ai/bot-settings.server';

/* ------------------------------ moderation ------------------------------ */

export interface AdminQueueUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

export type AdminReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export interface AdminReportRow {
  id: string;
  reason: string;
  details: string | null;
  entityType: string;
  entityId: string;
  status: AdminReportStatus;
  createdAt: string;
  reporter: AdminQueueUser;
  targetUser: AdminQueueUser | null;
}

/** The moderation queue for one status (default PENDING) plus per-status counts. */
export const getAdminReportsApi = endpoint<{
  query: {
    status?: string | undefined;
    cursor?: string | undefined;
    limit?: string | undefined;
  };
  res: { items: AdminReportRow[]; nextCursor: string | null; counts: Record<string, number> };
}>()({ method: 'GET', path: '/api/admin/reports' });

/** Act on a report (409 when it already left the open states). */
export const actOnAdminReportApi = endpoint<{
  body: {
    action: 'review' | 'resolve' | 'dismiss';
    note?: string | undefined;
    message?: string | undefined;
    deleteContent?: boolean | undefined;
  };
  res: { success: true; status: AdminReportStatus };
}>()({ method: 'POST', path: '/api/admin/reports/$id' });

export type AdminAppealView = 'PENDING' | 'UPHELD' | 'OVERTURNED';

export interface AdminAppealRow {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  entityType: string | null;
  entityId: string | null;
  appealStatus: AdminAppealView;
  appealText: string | null;
  appealedAt: string | null;
  appealNote: string | null;
  decidedAt: string | null;
  user: AdminQueueUser;
  issuedBy: AdminQueueUser;
  decidedBy: AdminQueueUser | null;
}

export const getAdminAppealsApi = endpoint<{
  query: {
    status?: string | undefined;
    cursor?: string | undefined;
    limit?: string | undefined;
  };
  res: {
    items: AdminAppealRow[];
    counts: Record<string, number>;
    nextCursor: string | null | undefined;
  };
}>()({ method: 'GET', path: '/api/admin/appeals' });

export const decideAdminAppealApi = endpoint<{
  body: { action: 'uphold' | 'overturn'; note?: string | undefined };
  res: { success: true; appealStatus: AdminAppealView; banLifted: boolean };
}>()({ method: 'POST', path: '/api/admin/appeals/$id' });

/** Issue a warning strike (three active strikes auto-ban). */
export const strikeAdminUserApi = endpoint<{
  body: {
    reason: string;
    expiresDays?: number | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
  };
  res: { success: true; activeStrikes: number; autoBanned: boolean };
}>()({ method: 'POST', path: '/api/admin/users/$id/strike' });

/** Ban (`reason`, `durationDays` null = permanent) or unban a user. */
export const banAdminUserApi = endpoint<{
  body: {
    unban?: boolean | undefined;
    reason?: string | undefined;
    durationDays?: number | null | undefined;
  };
  res: { success: true; banned: boolean; until?: string | undefined };
}>()({ method: 'POST', path: '/api/admin/users/$id/ban' });

/** Grant a gift membership tier for 1..24 months, or revoke the active grants. */
export const grantAdminMembershipApi = endpoint<{
  body: { tier: 'starter' | 'pro'; months: number } | { revoke: true };
  res: { success: true; revoked?: number; tier?: string; expiresAt?: string };
}>()({ method: 'POST', path: '/api/admin/users/$id/grant-membership' });

/** Set a user's coin balance to an exact amount. */
export const setAdminUserCoinsApi = endpoint<{
  body: { coins: number };
  res: { success: true; coins: number };
}>()({ method: 'POST', path: '/api/admin/users/$id/set-coins' });

/** The slice of a user row the admin table merges back after an edit. */
export interface AdminUserPatched {
  id: string;
  name: string;
  username: string;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
}

/** Verify / admin / handle edit. Some refusals are plain-text, not `{ error }`. */
export const updateAdminUserApi = endpoint<{
  body: z.infer<typeof adminUserUpdateSchema>;
  res: AdminUserPatched;
}>()({ method: 'PATCH', path: '/api/admin/users' });

export interface AdminLinkRule {
  domain: string;
  kind: 'DENY' | 'ALLOW';
  note: string | null;
}

export const listAdminLinkRulesApi = endpoint<{ res: { items: AdminLinkRule[] } }>()({
  method: 'GET',
  path: '/api/admin/link-rules',
});

export const addAdminLinkRuleApi = endpoint<{
  body: { domain: string; kind: 'DENY' | 'ALLOW'; note?: string | undefined };
  res: { success: true };
}>()({ method: 'POST', path: '/api/admin/link-rules' });

/** 404 when the domain has no rule. */
export const deleteAdminLinkRuleApi = endpoint<{
  query: { domain: string };
  res: { success: boolean };
}>()({ method: 'DELETE', path: '/api/admin/link-rules' });

/** Read-only render of a member's entitlements, mutes, blocks and feed (audit-logged). */
export interface AdminViewAsBrief {
  id: string;
  name: string | null;
  handle: string | null;
}
export interface AdminViewAs {
  member: AdminViewAsBrief & {
    createdAt: string;
    isAdmin: boolean;
    bannedUntil: string | null;
    banReason: string | null;
  };
  entitlements: { tier: string };
  mutes: AdminViewAsBrief[];
  blocks: AdminViewAsBrief[];
  blockedBy: AdminViewAsBrief[];
  mutedWords: string[];
  feed: { id: string; type: string; createdAt: string; author: string | null; text: string }[];
}
export const adminViewAsApi = endpoint<{
  query: { user: string };
  res: AdminViewAs;
}>()({ method: 'GET', path: '/api/admin/view-as' });

/* ----------------------------- review queues ----------------------------- */

export const getAdminReviewCountsApi = endpoint<{ res: AdminReviewCounts }>()({
  method: 'GET',
  path: '/api/admin/review-counts',
});

export interface AdminRedemptionRow {
  id: string;
  kind: 'SUB_CREDIT' | 'MERCH' | 'PAYOUT';
  amountCoins: number;
  tierGranted: string | null;
  monthsGranted: number | null;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string | null; handle: string | null };
}
export const listAdminRedemptionsApi = endpoint<{ res: { requests: AdminRedemptionRow[] } }>()({
  method: 'GET',
  path: '/api/admin/redemptions',
});

export interface AdminPendingPackRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: 'emoji' | 'sticker' | 'mixed';
  visibility: 'public' | 'unlisted' | 'private';
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string | null; handle: string | null; image: string | null };
  items: { id: string; name: string; url: string; alt: string }[];
}
export const listAdminEmojiPacksApi = endpoint<{ res: { packs: AdminPendingPackRow[] } }>()({
  method: 'GET',
  path: '/api/admin/emoji-packs',
});

/** Approve or remove a pack; 409 when it was decided or edited since `version`. */
export const moderateAdminEmojiPackApi = endpoint<{
  body: {
    action: 'approve' | 'remove';
    reason?: string | undefined;
    version?: string | undefined;
  };
  res: { ok: true; status: string };
}>()({ method: 'POST', path: '/api/admin/emoji-packs/$id' });

export interface AdminHeldListing {
  id: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
  item: { id: string; name: string; kind: string; rarity: string } | null;
  seller: { id: string; name: string | null; handle: string | null };
  medianCoins: number | null;
  recentSales: number;
}
export const listAdminHeldListingsApi = endpoint<{ res: { listings: AdminHeldListing[] } }>()({
  method: 'GET',
  path: '/api/admin/market',
});

/** Release a held listing back on sale, or cancel it (409 when no longer held). */
export const resolveAdminHeldListingApi = endpoint<{
  body: { action: 'release' | 'cancel' };
  res: { ok: true };
}>()({ method: 'POST', path: '/api/admin/market/$id' });

/** Remove one slide from an album (404 when missing). */
export const deleteAdminAlbumSlideApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/admin/albums/$id/slides/$slideId',
});

/* -------------------------------- flags --------------------------------- */

export interface AdminFlag {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  description: string;
}
export const listAdminFlagsApi = endpoint<{ res: { flags: AdminFlag[] } }>()({
  method: 'GET',
  path: '/api/admin/flags',
});
export const upsertAdminFlagApi = endpoint<{
  body: { key: string; enabled: boolean; rolloutPercent: number; description: string };
  res: { flag: AdminFlag };
}>()({ method: 'PUT', path: '/api/admin/flags' });
export const deleteAdminFlagApi = endpoint<{
  body: { key: string };
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/admin/flags' });

/* ------------------------------ dashboards ------------------------------- */

export interface AdminEconomy {
  snapshot: EconomySnapshot;
  flows: readonly CoinFlow[];
  shape: ReturnType<typeof supplyShape>;
}
export const getAdminEconomyApi = endpoint<{
  query: { days?: string | undefined };
  res: AdminEconomy;
}>()({ method: 'GET', path: '/api/admin/economy' });

export interface AdminAnalytics {
  users: { total: number; new7: number; new30: number; active7: number };
  content: { posts: number; posts7: number; comments: number; builds: number };
  moderation: { pendingReports: number };
  economy: { coinsInCirculation: number };
  postsPerDay: { day: string; count: number }[];
}
export const getAdminAnalyticsApi = endpoint<{ res: AdminAnalytics }>()({
  method: 'GET',
  path: '/api/admin/analytics',
});

/* -------------------------------- on-call -------------------------------- */

/** Always 200: an unconfigured or unreachable watchdog is `{ ok: false }`. */
export const getAdminOncallApi = endpoint<{ res: OncallApiResponse }>()({
  method: 'GET',
  path: '/api/admin/oncall',
});

export interface AdminAlarmRuleView extends EffectiveRule {
  evaluations: { dim: string; current: number | null; samples: number; active: boolean }[];
}
export const getAdminOncallRulesApi = endpoint<{ res: { rules: AdminAlarmRuleView[] } }>()({
  method: 'GET',
  path: '/api/admin/oncall-rules',
});

/** Override a rule's threshold (null = the code value) or mute it. */
export const patchAdminOncallRuleApi = endpoint<{
  body: { key: string; threshold: number | null; muted: boolean };
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/admin/oncall-rules' });

export const getAdminOncallSeriesApi = endpoint<{
  query: { range: RangeId };
  res: { range: RangeId; series: ChartSeries[]; deploys: DeployMarker[] };
}>()({ method: 'GET', path: '/api/admin/oncall-series' });

/* ----------------------------- qotd / bots / seasons --------------------- */

export interface AdminQotdRow {
  id: string;
  text: string;
  dayKey: string | null;
  createdAt: string;
}
export interface AdminQotdData {
  queue: AdminQotdRow[];
  recent: AdminQotdRow[];
  today: { dayKey: string; text: string; source: 'curated' | 'builtin' };
}
export const getAdminQotdApi = endpoint<{ res: AdminQotdData }>()({
  method: 'GET',
  path: '/api/admin/qotd',
});
export const addAdminQotdApi = endpoint<{
  body: z.infer<typeof qotdAddSchema>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/admin/qotd' });
export const removeAdminQotdApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/admin/qotd/$id',
});

export interface AdminBotsData {
  settings: BotWorkerSettingsView;
  stats: BotActivityStats;
}
export const getAdminBotsApi = endpoint<{ res: AdminBotsData }>()({
  method: 'GET',
  path: '/api/admin/bots',
});
export const saveAdminBotsApi = endpoint<{
  body: BotWorkerSettingsInput;
  res: AdminBotsData;
}>()({ method: 'PUT', path: '/api/admin/bots' });

export const createForecastSeasonApi = endpoint<{
  body: z.infer<typeof createSeasonSchema>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/admin/forecasting/seasons' });
