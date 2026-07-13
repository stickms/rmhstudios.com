import { createHash, randomUUID } from 'node:crypto';
import { deleteObject, getObject, putObject } from '@/lib/storage/s3.server';
import { configuredLadderAiProvider } from '../ai/provider.server';
import type { LadderAiProviderName } from '../ai/provider.server';
import { analyzeRedactedResume } from '../ai/resume-review.server';
import { ensureCachedJobProfile } from '../ai/job-profile.server';
import { scoreCandidateForJob } from '../matching/score';
import type { MatchUserPreferences } from '../matching/score';
import { decryptResumeFile, decryptResumeText, encryptResumeFile, encryptResumeText } from './crypto.server';
import { extractResumeText, validateResumeFile } from './extract.server';
import { isOwnedResumeKey, resumeObjectKey } from './keys';
import { redactResumePii } from './redact';
import { RESUME_MAX_BYTES } from './schemas';
import { candidateProfileSchema } from './schemas';
import type { CandidateProfile } from './schemas';

// Prisma is intentionally structural here: the schema lands independently of
// this feature and route files cast the generated client at one boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural Prisma arguments/results
type AnyRow = Record<string, any>;

interface ModelMethods {
  findMany(args: AnyRow): Promise<AnyRow[]>;
  findFirst(args: AnyRow): Promise<AnyRow | null>;
  create(args: AnyRow): Promise<AnyRow>;
  update(args: AnyRow): Promise<AnyRow>;
  delete(args: AnyRow): Promise<AnyRow>;
  upsert(args: AnyRow): Promise<AnyRow>;
  deleteMany(args: AnyRow): Promise<unknown>;
}

export interface ResumePrisma {
  ladderResume: Partial<ModelMethods> & Pick<ModelMethods, 'findMany' | 'findFirst' | 'create' | 'update' | 'delete'>;
  ladderResumeVersion: Partial<ModelMethods> & Pick<ModelMethods, 'findFirst' | 'create' | 'update'>;
  ladderResumeReview: Partial<ModelMethods> & Pick<ModelMethods, 'create' | 'update'>;
  ladderAiTask: Partial<ModelMethods> & Pick<ModelMethods, 'create' | 'update'>;
  ladderJob: Partial<ModelMethods> & Pick<ModelMethods, 'findMany'>;
  ladderJobProfile: Partial<ModelMethods> & Pick<ModelMethods, 'findFirst' | 'upsert'>;
  ladderJobMatch: Partial<ModelMethods> & Pick<ModelMethods, 'upsert' | 'deleteMany'>;
  ladderUserPrefs: Partial<ModelMethods> & Pick<ModelMethods, 'findFirst'>;
  ladderKeyword: Partial<ModelMethods> & Pick<ModelMethods, 'findMany'>;
}

interface StorageDeps {
  put: typeof putObject;
  get: typeof getObject;
  delete: typeof deleteObject;
}

const DEFAULT_STORAGE: StorageDeps = { put: putObject, get: getObject, delete: deleteObject };

function textAad(userId: string, resumeId: string, sha256: string): string {
  return `rmhladder:text:${userId}:${resumeId}:${sha256}`;
}

function fileAad(userId: string, resumeId: string, sha256: string): string {
  return `rmhladder:file:${userId}:${resumeId}:${sha256}`;
}

function publicReview(review: AnyRow | null | undefined) {
  if (!review) return null;
  return {
    id: review.id as string,
    provider: review.provider as string,
    model: review.model as string,
    status: review.status as string,
    profile: review.profile ?? null,
    review: review.review ?? null,
    error: review.error ?? null,
    createdAt: review.createdAt as Date,
    completedAt: (review.completedAt as Date | null) ?? null,
  };
}

function publicVersion(version: AnyRow) {
  const isConfirmed = Boolean(version.confirmedAt);
  return {
    id: version.id as string,
    versionNumber: version.versionNumber as number,
    filename: version.filename as string,
    mimeType: version.mimeType as string,
    sizeBytes: version.sizeBytes as number,
    parseStatus: version.parseStatus as string,
    parseConfidence: (version.parseConfidence as number | null) ?? null,
    confirmedProfile: version.confirmedProfile ?? null,
    confirmedAt: (version.confirmedAt as Date | null) ?? null,
    createdAt: version.createdAt as Date,
    latestReview: publicReview((version.reviews as AnyRow[] | undefined)?.[0]),
    matches: (isConfirmed ? ((version.matches as AnyRow[] | undefined) ?? []) : []).map((match) => ({
      id: match.id as string,
      jobId: match.jobId as string,
      score: match.score as number,
      confidence: match.confidence as number,
      breakdown: match.breakdown,
      matchedSkills: (match.matchedSkills as string[]) ?? [],
      missingSkills: (match.missingSkills as string[]) ?? [],
      explanation: (match.explanation as string | null) ?? null,
      job: match.job ? {
        id: match.job.id as string,
        title: match.job.title as string,
        locationRaw: (match.job.locationRaw as string | null) ?? null,
        company: match.job.company ? { name: match.job.company.name as string } : null,
      } : null,
    })),
  };
}

export async function listUserResumes(prisma: ResumePrisma, userId: string) {
  const rows = await prisma.ladderResume.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
          matches: { orderBy: { score: 'desc' }, take: 30, include: { job: { include: { company: true } } } },
        },
      },
    },
  });
  return rows.map((resume) => ({
    id: resume.id as string,
    name: resume.name as string,
    activeVersionId: (resume.activeVersionId as string | null) ?? null,
    createdAt: resume.createdAt as Date,
    updatedAt: resume.updatedAt as Date,
    versions: ((resume.versions as AnyRow[] | undefined) ?? []).map(publicVersion),
  }));
}

export async function uploadResume(
  prisma: ResumePrisma,
  args: {
    userId: string;
    resumeId?: string;
    name?: string;
    file: { buffer: Buffer; filename: string; mimeType: string };
  },
  storage: StorageDeps = DEFAULT_STORAGE,
) {
  if (args.file.buffer.length === 0) throw new Error('Resume file is empty');
  if (args.file.buffer.length > RESUME_MAX_BYTES) throw new Error('Resume exceeds the 10 MiB limit');
  validateResumeFile(args.file);

  const extractedText = await extractResumeText(args.file.buffer, args.file.mimeType);
  const redacted = redactResumePii(extractedText);
  const sha256 = createHash('sha256').update(args.file.buffer).digest('hex');
  let resume: AnyRow | null = null;
  if (args.resumeId) {
    resume = await prisma.ladderResume.findFirst({ where: { id: args.resumeId, userId: args.userId } });
    if (!resume) throw new Error('Resume not found');
  } else {
    const baseName = args.file.filename.replace(/\.(pdf|docx|txt)$/i, '').trim() || 'Resume';
    resume = await prisma.ladderResume.create({ data: { userId: args.userId, name: (args.name?.trim() || baseName).slice(0, 160) } });
  }

  const latest = await prisma.ladderResumeVersion.findFirst({
    where: { resumeId: resume.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true },
  });
  const versionNumber = ((latest?.versionNumber as number | undefined) ?? 0) + 1;
  const key = resumeObjectKey({
    userId: args.userId,
    resumeId: resume.id as string,
    versionId: randomUUID(),
    mimeType: args.file.mimeType,
  });
  const aad = textAad(args.userId, resume.id as string, sha256);
  const encryptedFile = encryptResumeFile(args.file.buffer, { aad: fileAad(args.userId, resume.id as string, sha256) });

  await storage.put(key, encryptedFile, 'application/octet-stream');
  let version: AnyRow;
  try {
    version = await prisma.ladderResumeVersion.create({
      data: {
        resumeId: resume.id,
        userId: args.userId,
        versionNumber,
        storageKey: key,
        filename: args.file.filename.slice(0, 255),
        mimeType: args.file.mimeType,
        sizeBytes: args.file.buffer.length,
        sha256,
        parseStatus: extractedText.length >= 80 ? 'ready' : 'needs_correction',
        parseConfidence: extractedText.length >= 300 ? 95 : extractedText.length >= 80 ? 70 : 20,
        extractedTextEncrypted: encryptResumeText(extractedText, { aad }),
        redactedTextEncrypted: encryptResumeText(redacted.text, { aad }),
      },
    });
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
  await prisma.ladderResume.update({ where: { id: resume.id }, data: { activeVersionId: version.id } });
  await prisma.ladderAiTask.create({
    data: {
      userId: args.userId,
      kind: 'resume_parse',
      status: 'complete',
      resumeVersionId: version.id,
      inputRef: sha256,
      outputRef: version.id,
      attempts: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });
  return { resumeId: resume.id as string, version: publicVersion(version), redactions: redacted.counts };
}

async function ownedResumeWithVersions(prisma: ResumePrisma, userId: string, resumeId: string) {
  const resume = await prisma.ladderResume.findFirst({
    where: { id: resumeId, userId },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!resume) throw new Error('Resume not found');
  return resume;
}

export async function downloadResume(
  prisma: ResumePrisma,
  userId: string,
  resumeId: string,
  storage: StorageDeps = DEFAULT_STORAGE,
) {
  const resume = await ownedResumeWithVersions(prisma, userId, resumeId);
  const versions = (resume.versions as AnyRow[] | undefined) ?? [];
  const version = versions.find((candidate) => candidate.id === resume.activeVersionId) ?? versions[0];
  if (!version || !isOwnedResumeKey(version.storageKey as string, userId)) throw new Error('Resume file not found');
  const object = await storage.get(version.storageKey as string);
  if (!object) throw new Error('Resume file not found');
  const body = decryptResumeFile(object.body, { aad: fileAad(userId, resume.id as string, version.sha256 as string) });
  return { body, filename: version.filename as string, mimeType: version.mimeType as string };
}

export async function deleteResume(
  prisma: ResumePrisma,
  userId: string,
  resumeId: string,
  storage: StorageDeps = DEFAULT_STORAGE,
) {
  const resume = await ownedResumeWithVersions(prisma, userId, resumeId);
  for (const version of (resume.versions as AnyRow[] | undefined) ?? []) {
    if (!isOwnedResumeKey(version.storageKey as string, userId)) throw new Error('Invalid owned resume storage key');
    // Do not remove DB ownership until private object deletion succeeds. A
    // transient storage failure can then be retried without orphaning PII.
    await storage.delete(version.storageKey as string);
  }
  await prisma.ladderResume.delete({ where: { id: resumeId } });
  return { ok: true };
}

async function refreshMatches(
  prisma: ResumePrisma,
  args: { userId: string; versionId: string; profile: CandidateProfile },
) {
  const [jobs, prefs, keywords] = await Promise.all([
    prisma.ladderJob.findMany({
      where: {
        status: 'active',
        earlyCareerClassification: { in: ['yes', 'probable'] },
        company: { enabled: true },
      },
      include: {
        company: true,
        verifications: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ relevanceScoreBase: 'desc' }, { discoveredAt: 'desc' }],
      take: 250,
    }),
    prisma.ladderUserPrefs.findFirst({ where: { userId: args.userId } }),
    prisma.ladderKeyword.findMany({ where: { userId: args.userId, type: 'boost' } }),
  ]);
  const matchPrefs: MatchUserPreferences = {
    preferredCities: (prefs?.preferredCities as string[] | undefined) ?? [],
    preferredProgramTypes: (prefs?.preferredProgramTypes as string[] | undefined) ?? [],
    boostKeywords: keywords.map((keyword) => keyword.keyword as string),
  };
  const matches: AnyRow[] = [];
  for (const job of jobs) {
    const latestVerification = (job.verifications as AnyRow[] | undefined)?.[0];
    if (!latestVerification || !['verified_active', 'verified_probable'].includes(latestVerification.status as string)) {
      continue;
    }
    const profile = await ensureCachedJobProfile(
      prisma,
      job as Parameters<typeof ensureCachedJobProfile>[1],
      { allowAi: false },
    );
    const match = scoreCandidateForJob(args.profile, profile, matchPrefs);
    const stored = await prisma.ladderJobMatch.upsert({
      where: { resumeVersionId_jobId: { resumeVersionId: args.versionId, jobId: job.id } },
      create: { userId: args.userId, resumeVersionId: args.versionId, jobId: job.id, ...match },
      update: match,
    });
    matches.push({ ...stored, job: { id: job.id, title: job.title, locationRaw: job.locationRaw, company: job.company } });
  }
  const eligibleJobIds = matches.map((match) => match.jobId as string);
  await prisma.ladderJobMatch.deleteMany({
    where: {
      resumeVersionId: args.versionId,
      ...(eligibleJobIds.length ? { jobId: { notIn: eligibleJobIds } } : {}),
    },
  });
  matches.sort((a, b) => (b.score as number) - (a.score as number));
  return matches.slice(0, 30);
}

/** Refresh a previously confirmed profile after a scrape adds or changes jobs. */
export async function refreshConfirmedResumeMatches(
  prisma: ResumePrisma,
  args: { userId: string; versionId: string; profile: CandidateProfile },
) {
  const matches = await refreshMatches(prisma, {
    ...args,
    profile: candidateProfileSchema.parse(args.profile),
  });
  await prisma.ladderResumeVersion.update({
    where: { id: args.versionId },
    data: { matchesRefreshedAt: new Date() },
  });
  return matches;
}

export async function analyzeResume(
  prisma: ResumePrisma,
  args: { userId: string; resumeId: string; versionId?: string; provider?: LadderAiProviderName; reservedTaskId?: string },
) {
  const resume = await ownedResumeWithVersions(prisma, args.userId, args.resumeId);
  const versions = (resume.versions as AnyRow[] | undefined) ?? [];
  const version = args.versionId
    ? versions.find((candidate) => candidate.id === args.versionId)
    : versions.find((candidate) => candidate.id === resume.activeVersionId) ?? versions[0];
  if (!version?.redactedTextEncrypted) throw new Error('Resume text is not ready for analysis');
  const provider = configuredLadderAiProvider(args.provider);
  const now = new Date();
  const task = args.reservedTaskId
    ? await prisma.ladderAiTask.update({
        where: { id: args.reservedTaskId },
        data: { status: 'processing', provider: provider.name, inputRef: version.sha256, attempts: 1, startedAt: now },
      })
    : await prisma.ladderAiTask.create({
        data: { userId: args.userId, kind: 'resume_review', status: 'processing', provider: provider.name, resumeVersionId: version.id, inputRef: version.sha256, dedupeKey: `resume_review:${version.id}`, attempts: 1, startedAt: now },
      });
  let review: AnyRow | null = null;
  try {
    review = await prisma.ladderResumeReview.create({
      data: { userId: args.userId, resumeVersionId: version.id, provider: provider.name, model: provider.model, status: 'processing' },
    });
    const aad = textAad(args.userId, resume.id as string, version.sha256 as string);
    const redactedText = decryptResumeText(version.redactedTextEncrypted as string, { aad });
    const analyzed = await analyzeRedactedResume(redactedText, { client: provider });
    const completedAt = new Date();
    const completedReview = await prisma.ladderResumeReview.update({
      where: { id: review.id },
      data: { status: 'complete', profile: analyzed.analysis.profile, review: analyzed.analysis.review, completedAt, error: null },
    });
    await prisma.ladderAiTask.update({
      where: { id: task.id }, data: { status: 'complete', outputRef: review.id, dedupeKey: null, finishedAt: completedAt, error: null },
    });

    // The model's profile is a draft. It must never change ranking until the
    // owner confirms or corrects it through confirmResumeProfile.
    return { review: publicReview(completedReview), matches: [], requiresConfirmation: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : 'Resume analysis failed';
    const failedAt = new Date();
    await Promise.allSettled([
      ...(review
        ? [prisma.ladderResumeReview.update({ where: { id: review.id }, data: { status: 'failed', error: message, completedAt: failedAt } })]
        : []),
      prisma.ladderAiTask.update({ where: { id: task.id }, data: { status: 'failed', error: message, dedupeKey: null, finishedAt: failedAt } }),
    ]);
    throw error;
  }
}

export async function confirmResumeProfile(
  prisma: ResumePrisma,
  args: { userId: string; resumeId: string; versionId: string; profile: CandidateProfile },
) {
  const resume = await ownedResumeWithVersions(prisma, args.userId, args.resumeId);
  const version = ((resume.versions as AnyRow[] | undefined) ?? []).find((candidate) => candidate.id === args.versionId);
  if (!version) throw new Error('Resume version not found');
  const profile = candidateProfileSchema.parse(args.profile);
  const confirmedAt = new Date();
  const task = await prisma.ladderAiTask.create({
    data: { userId: args.userId, kind: 'match_refresh', status: 'processing', resumeVersionId: version.id, attempts: 1, startedAt: confirmedAt },
  });
  try {
    const matches = await refreshMatches(prisma, { userId: args.userId, versionId: version.id as string, profile });
    // Confirmation becomes visible only after the deterministic refresh
    // completes, so a partial failed refresh cannot surface draft matches.
    await prisma.ladderResumeVersion.update({
      where: { id: version.id },
      data: { confirmedProfile: profile, confirmedAt, matchesRefreshedAt: new Date() },
    });
    await prisma.ladderAiTask.update({ where: { id: task.id }, data: { status: 'complete', outputRef: version.id, finishedAt: new Date() } });
    return { profile, confirmedAt, matches };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : 'Match refresh failed';
    await prisma.ladderAiTask.update({ where: { id: task.id }, data: { status: 'failed', error: message, finishedAt: new Date() } });
    throw error;
  }
}
