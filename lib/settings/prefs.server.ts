/**
 * Read halves of the per-account preference endpoints, shared by their GET routes
 * and by the route loaders that seed React Query (redesign audit B4), so the
 * server-rendered page and the API answer from one body.
 */
import { prisma } from '@/lib/prisma.server';
import { DEFAULT_PRESENCE_VISIBILITY } from '@/lib/presence-types';
import { DEFAULT_CALL_PRIVACY, isCallPrivacy } from '@/lib/call/state';
import { DEFAULT_CALL_ANSWER_MODE, isCallAnswerMode } from '@/lib/call/answer';
import { userChipSelect } from '@/lib/user-display';

/** GET /api/preferences/presence. */
export async function getPresencePrefs(userId: string) {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
    select: { presenceVisibility: true, presenceDetail: true },
  });
  return {
    presenceVisibility: row?.presenceVisibility ?? DEFAULT_PRESENCE_VISIBILITY,
    presenceDetail: row?.presenceDetail ?? true,
  };
}

/** GET /api/calls/privacy. */
export async function getCallPrivacy(userId: string) {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { callPrivacy: true },
  });
  const value = prefs?.callPrivacy;
  return { callPrivacy: isCallPrivacy(value) ? value : DEFAULT_CALL_PRIVACY };
}

/** GET /api/calls/mute: active mutes only (a lapsed row is inert). */
export async function listActiveCallMutes(userId: string) {
  const rows = await prisma.callMute.findMany({
    where: { userId, until: { gt: new Date() } },
    orderBy: { until: 'asc' },
    take: 100,
    select: { until: true, muted: { select: userChipSelect } },
  });
  return { mutes: rows.map((r) => ({ until: r.until.toISOString(), user: r.muted })) };
}

/** GET /api/calls/answer. */
export async function getCallAnswer(userId: string) {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { callAnswerMode: true, callBusyNote: true },
  });
  return {
    mode: isCallAnswerMode(prefs?.callAnswerMode) ? prefs.callAnswerMode : DEFAULT_CALL_ANSWER_MODE,
    note: prefs?.callBusyNote ?? '',
  };
}

const TOGGLE_DEFAULTS = {
  likes: true,
  comments: true,
  follows: true,
  mentions: true,
  reposts: true,
  system: true,
};

/** GET /api/notifications/preferences: the per-type toggles (defaults when no row exists yet). */
export async function getNotificationToggles(userId: string) {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  const { likes, comments, follows, mentions, reposts, system } = prefs ?? TOGGLE_DEFAULTS;
  return { likes, comments, follows, mentions, reposts, system };
}

/** GET /api/preferences/notifications: the category x channel matrix + quiet hours. */
export async function getNotificationMatrix(userId: string) {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { matrix: true, quietStart: true, quietEnd: true, tz: true, emailDigest: true },
  });
  return {
    matrix: row?.matrix ?? {},
    quietStart: row?.quietStart ?? null,
    quietEnd: row?.quietEnd ?? null,
    tz: row?.tz ?? null,
    emailDigest: row?.emailDigest ?? false,
  };
}
