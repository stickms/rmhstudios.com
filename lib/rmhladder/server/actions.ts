/**
 * rmhladder dashboard — write-side action layer.
 *
 * Structurally-typed prisma (tests inject a fake). zod validates user input
 * on the two free-form surfaces (application patch, prefs patch).
 */

import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural prisma rows
type AnyRow = Record<string, any>;

export interface ActionsPrisma {
  ladderJobAction: {
    upsert(args: AnyRow): Promise<AnyRow>;
    delete(args: AnyRow): Promise<unknown>;
  };
  ladderApplication: {
    findUnique(args: AnyRow): Promise<AnyRow | null>;
    upsert(args: AnyRow): Promise<AnyRow>;
  };
  ladderApplicationEvent?: {
    create(args: AnyRow): Promise<AnyRow>;
  };
  ladderResumeVersion?: {
    findFirst(args: AnyRow): Promise<AnyRow | null>;
  };
  ladderReviewTask: {
    findUnique(args: AnyRow): Promise<AnyRow | null>;
    update(args: AnyRow): Promise<AnyRow | undefined>;
  };
  ladderJob: {
    findUnique(args: AnyRow): Promise<AnyRow | null>;
    update(args: AnyRow): Promise<AnyRow | undefined>;
  };
  ladderVerification: { create(args: AnyRow): Promise<AnyRow> };
  ladderCompany: { update(args: AnyRow): Promise<AnyRow | undefined> };
  ladderKeyword: {
    upsert(args: AnyRow): Promise<AnyRow>;
    delete(args: AnyRow): Promise<unknown>;
  };
  ladderUserPrefs: { upsert(args: AnyRow): Promise<AnyRow> };
  ladderWatchlistEntry: {
    findUnique(args: AnyRow): Promise<AnyRow | null>;
    create(args: AnyRow): Promise<AnyRow>;
    delete(args: AnyRow): Promise<unknown>;
  };
}

export type JobActionValue = 'saved' | 'applied' | 'ignored' | null;

export async function setJobAction(
  prisma: ActionsPrisma,
  userId: string,
  jobId: string,
  action: JobActionValue,
) {
  if (action === 'applied') {
    await prisma.ladderUserPrefs.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const existing = await prisma.ladderApplication.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
    const application = await prisma.ladderApplication.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, status: 'applied', appliedDate: new Date() },
      update: existing?.status === 'not_applied'
        ? { status: 'applied', appliedDate: existing.appliedDate ?? new Date() }
        : {},
    });
    if (prisma.ladderApplicationEvent && existing?.status !== 'applied') {
      await prisma.ladderApplicationEvent.create({
        data: {
          applicationId: application.id,
          userId,
          type: 'status_changed',
          fromStatus: existing?.status ?? null,
          toStatus: 'applied',
        },
      });
    }
    // Application state is intentionally separate from saved/ignored state.
    return { userAction: 'applied' as const };
  }

  if (action === null) {
    try {
      await prisma.ladderJobAction.delete({ where: { userId_jobId: { userId, jobId } } });
    } catch {
      // real Prisma throws P2025 when the row is already absent — absence is the goal
    }
    return { userAction: null };
  }
  await prisma.ladderJobAction.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, action },
    update: { action },
  });
  return { userAction: action };
}

const APPLICATION_STATUSES = [
  'not_applied', 'planning', 'applied', 'networking', 'interviewing',
  'final_round', 'rejected', 'offer', 'withdrawn',
] as const;

const MAX_TEXT = { message: 'Maximum length is 2000 characters' };

const applicationPatchSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  appliedDate: z.coerce.date().nullable().optional(),
  resumeVersion: z.string().max(2000, MAX_TEXT).nullable().optional(),
  resumeVersionId: z.string().min(1).max(100).nullable().optional(),
  coverLetter: z.string().max(2000, MAX_TEXT).nullable().optional(),
  referralName: z.string().max(2000, MAX_TEXT).nullable().optional(),
  contactEmail: z.string().max(2000, MAX_TEXT).nullable().optional(),
  notes: z.string().max(2000, MAX_TEXT).nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
  interviewDates: z.array(z.coerce.date()).max(25, 'Maximum 25 interview dates').optional(),
  outcome: z.string().max(2000, MAX_TEXT).nullable().optional(),
});

export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;

export async function updateApplication(
  prisma: ActionsPrisma,
  userId: string,
  jobId: string,
  patch: ApplicationPatch,
) {
  const validated = applicationPatchSchema.parse(patch);
  if (validated.resumeVersionId) {
    if (!prisma.ladderResumeVersion) throw new Error('Resume ownership validation is unavailable');
    const ownedVersion = await prisma.ladderResumeVersion.findFirst({
      where: { id: validated.resumeVersionId, userId },
      select: { id: true },
    });
    if (!ownedVersion) throw new Error('Resume version not found');
  }
  await prisma.ladderUserPrefs.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const existing = await prisma.ladderApplication.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });
  const application = await prisma.ladderApplication.upsert({
    where: { userId_jobId: { userId, jobId } },
    // spread first so the status default cannot be clobbered by an undefined key
    create: { userId, jobId, ...validated, status: validated.status ?? 'not_applied' },
    update: validated,
  });
  if (prisma.ladderApplicationEvent) {
    const statusChanged = validated.status !== undefined && validated.status !== existing?.status;
    await prisma.ladderApplicationEvent.create({
      data: {
        applicationId: application.id,
        userId,
        type: statusChanged ? 'status_changed' : 'application_updated',
        fromStatus: statusChanged ? existing?.status ?? null : null,
        toStatus: statusChanged ? validated.status : null,
        data: {
          fields: Object.keys(validated),
        },
      },
    });
  }
  return application;
}

export type ReviewResolution = 'verify' | 'expire' | 'duplicate' | 'non_us' | 'ignore';

const RESOLUTION_EFFECTS: Record<
  Exclude<ReviewResolution, 'ignore'>,
  { jobStatus?: string; verification: { status: string; confidence: number; evidence: string } }
> = {
  verify: {
    jobStatus: 'active',
    verification: { status: 'verified_probable', confidence: 75, evidence: 'Manually verified via review queue.' },
  },
  expire: {
    jobStatus: 'expired',
    verification: { status: 'expired', confidence: 90, evidence: 'Manually expired via review queue.' },
  },
  non_us: {
    verification: { status: 'non_us_role', confidence: 90, evidence: 'Manually classified non-US via review queue.' },
  },
  duplicate: {
    jobStatus: 'expired',
    verification: { status: 'expired', confidence: 100, evidence: 'Manually removed as a duplicate posting.' },
  },
};

export async function resolveReviewTask(
  prisma: ActionsPrisma,
  userId: string,
  taskId: string,
  resolution: ReviewResolution,
): Promise<{ ok: boolean; error?: string }> {
  const task = await prisma.ladderReviewTask.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: 'task not found' };

  if (resolution !== 'ignore') {
    if (!task.jobId) return { ok: false, error: 'task has no job' };
    const effect = RESOLUTION_EFFECTS[resolution];
    if (effect.jobStatus) {
      await prisma.ladderJob.update({ where: { id: task.jobId }, data: { status: effect.jobStatus } });
    }
    await prisma.ladderVerification.create({
      data: { jobId: task.jobId, ...effect.verification, checkedAt: new Date() },
    });
  }

  await prisma.ladderReviewTask.update({
    where: { id: taskId },
    data: { status: 'resolved', resolution, resolvedById: userId, resolvedAt: new Date() },
  });
  return { ok: true };
}

export async function setCompanyEnabled(prisma: ActionsPrisma, companyId: string, enabled: boolean) {
  return prisma.ladderCompany.update({ where: { id: companyId }, data: { enabled } });
}

export async function setCompanyPriority(prisma: ActionsPrisma, companyId: string, priorityLevel: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(priorityLevel)));
  return prisma.ladderCompany.update({ where: { id: companyId }, data: { priorityLevel: clamped } });
}

export async function upsertKeyword(
  prisma: ActionsPrisma,
  userId: string,
  keyword: string,
  type: 'boost' | 'block',
  weight: number,
) {
  return prisma.ladderKeyword.upsert({
    where: { userId_keyword_type: { userId, keyword, type } },
    create: { userId, keyword, type, weight },
    update: { weight },
  });
}

export async function deleteKeyword(
  prisma: ActionsPrisma,
  userId: string,
  keyword: string,
  type: 'boost' | 'block',
) {
  try {
    await prisma.ladderKeyword.delete({ where: { userId_keyword_type: { userId, keyword, type } } });
  } catch {
    // P2025 on already-absent row — absence is the goal
  }
  return { ok: true };
}

const DIGEST_FREQUENCIES = ['immediate', 'daily', 'weekly'] as const;
const PROGRAM_TYPES = [
  'internship', 'summer_analyst', 'summer_associate', 'analyst_program', 'rotational_program',
  'new_grad', 'leadership_development', 'entry_level', 'mba', 'other',
] as const;
const timezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA timezone');

const prefsPatchSchema = z.object({
  relevanceThreshold: z.number().int().min(0, 'Minimum 0').max(100, 'Maximum is 100').optional(),
  preferredCities: z.array(z.string().max(100)).max(50).optional(),
  preferredProgramTypes: z.array(z.enum(PROGRAM_TYPES)).max(PROGRAM_TYPES.length).optional(),
  digestFrequency: z.enum(DIGEST_FREQUENCIES).optional(),
  channelInApp: z.boolean().optional(),
  channelEmail: z.boolean().optional(),
  channelDiscord: z.boolean().optional(),
  discordUserId: z.string().max(100).nullable().optional(),
  timezone: timezoneSchema.optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  resumeMatchThreshold: z.number().int().min(0).max(100).nullable().optional(),
});

export type PrefsPatch = z.infer<typeof prefsPatchSchema>;

export async function updatePrefs(prisma: ActionsPrisma, userId: string, patch: PrefsPatch) {
  const validated = prefsPatchSchema.parse(patch);
  return prisma.ladderUserPrefs.upsert({
    where: { userId },
    create: { userId, ...validated },
    update: validated,
  });
}

export async function markAlertsRead(
  prisma: ActionsPrisma & { ladderAlertEvent: { updateMany(args: AnyRow): Promise<unknown> } },
  userId: string,
  alertId?: string,
) {
  await prisma.ladderAlertEvent.updateMany({
    where: { userId, readAt: null, ...(alertId ? { id: alertId } : {}) },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function toggleWatchlist(
  prisma: ActionsPrisma,
  userId: string,
  companyId: string,
  on: boolean,
): Promise<{ isWatchlisted: boolean }> {
  const existing = await prisma.ladderWatchlistEntry.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (on && !existing) {
    await prisma.ladderWatchlistEntry.create({ data: { userId, companyId, priority: 3 } });
  } else if (!on && existing) {
    await prisma.ladderWatchlistEntry.delete({ where: { userId_companyId: { userId, companyId } } });
  }
  return { isWatchlisted: on };
}
