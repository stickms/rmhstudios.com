/**
 * Server half of the profile identity extras (P2 /now, P3 pronouns +
 * pronunciation, P4 timezone, P9 visitor counter). Server-only.
 *
 * Everything here is keyed by the member's own id and reads/writes the single
 * optional `ProfilePlus` row. None of it is on the profile page's critical path:
 * the profile payload carries three small scalars (`pronouns`, `timezone`,
 * `pronunciationUrl`), and the rest is fetched by the module that shows it.
 */
import { prisma } from '@/lib/prisma.server';
import { utcDayString, visitorHash } from '@/lib/profile/visitor-hash.server';
import { getObject, putObject, deleteObject } from '@/lib/storage/s3.server';
import { isSafeFilename } from '@/lib/storage/keys';
import { parseLayout, withModule, type ModuleKind } from '@/lib/profile/modules';
import {
  PRONUNCIATION_ACCEPT_MS,
  PRONUNCIATION_MAX_BYTES,
  type PlusUpdateInput,
  type ProfilePlusView,
} from '@/lib/profile/plus';
import {
  AUDIO_CONTAINER_EXT,
  AUDIO_CONTAINER_TYPE,
  sniffAudioContainer,
  type AudioContainer,
} from '@/lib/profile/audio-sniff';
import { voiceExtForContentType } from '@/lib/voice/keys';

/** Where pronunciation clips live in object storage. */
export const PRONUNCIATION_PREFIX = 'profile-pronunciation/';

/* -------------------------------------------------------------------------- */
/* Layout modules                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Show or hide profile modules in the member's showcase. A feature switched on
 * from settings should appear on the profile without a second trip to "Edit
 * showcase"; switched off, it should leave. The cap and the existing order and
 * config are preserved (`withModule`).
 */
export async function setProfileModules(
  userId: string,
  changes: Partial<Record<ModuleKind, boolean>>,
): Promise<void> {
  const row = await prisma.profileLayout.findUnique({
    where: { userId },
    select: { modules: true },
  });
  const current = parseLayout(row?.modules);
  let next = current;
  for (const [kind, present] of Object.entries(changes) as [ModuleKind, boolean][]) {
    next = withModule(next, kind, present);
  }
  if (next.length === current.length && next.every((m, i) => m.kind === current[i]?.kind)) return;
  await prisma.profileLayout.upsert({
    where: { userId },
    create: { userId, modules: next },
    update: { modules: next },
  });
}

/** Which of the given module kinds the member currently shows on their profile. */
export async function profileHasModules(
  userId: string,
  kinds: ModuleKind[],
): Promise<Set<ModuleKind>> {
  const row = await prisma.profileLayout.findUnique({
    where: { userId },
    select: { modules: true },
  });
  const present = new Set(parseLayout(row?.modules).map((m) => m.kind));
  return new Set(kinds.filter((k) => present.has(k)));
}

/* -------------------------------------------------------------------------- */
/* Read / write the scalars                                                   */
/* -------------------------------------------------------------------------- */

export async function getPlusView(userId: string): Promise<ProfilePlusView> {
  const row = await prisma.profilePlus.findUnique({
    where: { userId },
    select: {
      pronouns: true,
      timezone: true,
      nowText: true,
      nowUpdatedAt: true,
      counterEnabled: true,
    },
  });
  return {
    pronouns: row?.pronouns ?? null,
    timezone: row?.timezone ?? null,
    nowText: row?.nowText ?? null,
    nowUpdatedAt: row?.nowUpdatedAt?.toISOString() ?? null,
    counterEnabled: row?.counterEnabled ?? false,
  };
}

const blankToNull = (v: string | undefined): string | null | undefined =>
  v === undefined ? undefined : v.trim() === '' ? null : v.trim();

/**
 * Apply a settings write. `nowUpdatedAt` moves only when the /now text actually
 * changed, so re-saving the form does not reset the "updated" stamp (the whole
 * point of the stamp is to be honest about staleness).
 */
export async function updatePlus(
  userId: string,
  input: PlusUpdateInput,
  now: Date = new Date(),
): Promise<ProfilePlusView> {
  const pronouns = blankToNull(input.pronouns);
  const timezone = blankToNull(input.timezone);
  const nowText = blankToNull(input.nowText);

  const existing = await prisma.profilePlus.findUnique({
    where: { userId },
    select: { nowText: true },
  });
  const nowChanged = nowText !== undefined && nowText !== (existing?.nowText ?? null);

  const data = {
    ...(pronouns !== undefined ? { pronouns } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(nowText !== undefined ? { nowText } : {}),
    ...(nowChanged ? { nowUpdatedAt: nowText ? now : null } : {}),
    ...(input.counterEnabled !== undefined ? { counterEnabled: input.counterEnabled } : {}),
  };
  await prisma.profilePlus.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  const modules: Partial<Record<ModuleKind, boolean>> = {};
  if (nowText !== undefined) modules.now = nowText !== null;
  if (input.counterEnabled !== undefined) modules.counter = input.counterEnabled;
  if (input.endorsementsEnabled !== undefined) modules.endorsements = input.endorsementsEnabled;
  if (Object.keys(modules).length) await setProfileModules(userId, modules);

  return getPlusView(userId);
}

/* -------------------------------------------------------------------------- */
/* Pronunciation clip                                                         */
/* -------------------------------------------------------------------------- */

export type PronunciationResult =
  { ok: true; key: string; durationMs: number } | { ok: false; status: number; error: string };

export async function savePronunciation(
  userId: string,
  buffer: Buffer,
  declaredType: string,
  durationMs: number,
): Promise<PronunciationResult> {
  if (buffer.length === 0) return { ok: false, status: 400, error: 'That recording is empty.' };
  if (buffer.length > PRONUNCIATION_MAX_BYTES) {
    return { ok: false, status: 413, error: 'That recording is too large. Keep it to 5 seconds.' };
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > PRONUNCIATION_ACCEPT_MS) {
    return { ok: false, status: 400, error: 'Pronunciation clips can be up to 5 seconds.' };
  }
  // Both the declared type and the bytes must say "audio"; the bytes decide which.
  if (!voiceExtForContentType(declaredType)) {
    return { ok: false, status: 400, error: 'That audio format is not supported.' };
  }
  const container = sniffAudioContainer(buffer);
  if (!container) return { ok: false, status: 400, error: 'That audio format is not supported.' };

  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const key = `${PRONUNCIATION_PREFIX}${userId}-${unique}.${AUDIO_CONTAINER_EXT[container]}`;
  await putObject(key, buffer, AUDIO_CONTAINER_TYPE[container]);

  const previous = await prisma.profilePlus.findUnique({
    where: { userId },
    select: { pronunciationKey: true },
  });
  const rounded = Math.round(durationMs);
  await prisma.profilePlus.upsert({
    where: { userId },
    create: { userId, pronunciationKey: key, pronunciationMs: rounded },
    update: { pronunciationKey: key, pronunciationMs: rounded },
  });
  // Retire the old object after the new one is live (a failed upload must not
  // leave the member with no clip at all).
  if (previous?.pronunciationKey && previous.pronunciationKey !== key) {
    await deleteObject(previous.pronunciationKey).catch(() => {});
  }
  return { ok: true, key, durationMs: rounded };
}

export async function removePronunciation(userId: string): Promise<void> {
  const row = await prisma.profilePlus.findUnique({
    where: { userId },
    select: { pronunciationKey: true },
  });
  if (!row?.pronunciationKey) return;
  await prisma.profilePlus.update({
    where: { userId },
    data: { pronunciationKey: null, pronunciationMs: null },
  });
  await deleteObject(row.pronunciationKey).catch(() => {});
}

export async function readPronunciation(
  userId: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const row = await prisma.profilePlus.findUnique({
    where: { userId },
    select: { pronunciationKey: true },
  });
  const key = row?.pronunciationKey;
  if (!key || !isSafeFilename(key.slice(PRONUNCIATION_PREFIX.length))) return null;
  const object = await getObject(key);
  if (!object) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1) as string;
  const container = (Object.keys(AUDIO_CONTAINER_EXT) as AudioContainer[]).find(
    (c) => AUDIO_CONTAINER_EXT[c] === ext,
  );
  return {
    body: object.body,
    // From the stored extension (written from sniffed bytes), never from the
    // object's metadata: the local-FS backend cannot persist a content type.
    contentType: container ? AUDIO_CONTAINER_TYPE[container] : 'application/octet-stream',
  };
}

/* -------------------------------------------------------------------------- */
/* P9 — visitor counter                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Count a visit — at most once per visitor per profile per UTC day.
 *
 * One statement, one round trip: a CTE inserts the dedupe row (`ON CONFLICT DO
 * NOTHING`) and the UPDATE adds however many rows it inserted (0 or 1) to the
 * counter. Both are gated on `counterEnabled`, so a profile that has not opted
 * in records nothing, not even a dedupe row. Returns `null` when the counter is
 * not enabled for this profile.
 */
export async function recordProfileVisit(
  profileId: string,
  visitorKey: string,
  now: Date = new Date(),
): Promise<{ count: number } | null> {
  const day = utcDayString(now);
  const visitor = visitorHash(visitorKey, profileId, day);
  const rows = await prisma.$queryRaw<{ visitCount: number }[]>`
    WITH ins AS (
      INSERT INTO profile_visit_day ("profileId", "day", "visitor")
      SELECT ${profileId}::text, ${day}::date, ${visitor}::text
      FROM profile_plus
      WHERE "userId" = ${profileId} AND "counterEnabled" = true
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    UPDATE profile_plus
    SET "visitCount" = "visitCount" + (SELECT COUNT(*) FROM ins)::int
    WHERE "userId" = ${profileId} AND "counterEnabled" = true
    RETURNING "visitCount"
  `;
  return rows[0] ? { count: rows[0].visitCount } : null;
}

/** Current counter without recording (the owner viewing their own page). */
export async function readVisitCount(profileId: string): Promise<number | null> {
  const row = await prisma.profilePlus.findUnique({
    where: { userId: profileId },
    select: { counterEnabled: true, visitCount: true },
  });
  return row?.counterEnabled ? row.visitCount : null;
}

/** Drop dedupe rows from before yesterday. Run daily by the jobs worker. */
export async function sweepProfileVisits(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const res = await prisma.profileVisitDay.deleteMany({ where: { day: { lt: cutoff } } });
  return res.count;
}
