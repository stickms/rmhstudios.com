/**
 * The `medschools.sdn-interviews` job: weekly, each school's SDN interview-feedback summary page becomes one
 * `MedInterviewProfile` (source SDN) plus scrubbed question rows. No model is involved.
 *
 * The summary page exposes no handles (ruling Q9), so `scrubQuestion` runs with an empty handle set and its
 * pattern rejections (email, URL, @, phone, honorific + name) are the guard. SDN `comments` are never stored
 * (D4): the profile's feedback arrays stay empty. Questions are never deleted (forum-derived SDN questions
 * share the `source`), and their hash is the forum pipeline's (`q:<school>:<normalized text>`), so one
 * question reported in both places is stored once.
 *
 * Missing data is not zero: an unavailable page (404, empty report array, challenge, unparseable) leaves the
 * school's stored rows untouched. The profile is written last; it is what the 6-day skip reads, so a failed
 * question write is retried next run. Never throws; `MedSourceRun.stats` holds counters only.
 */
import { dedupeHash } from '../engine/dedupe';
import { normalizeQuestion, scrubQuestion, splitQuestions } from '../engine/sdn-rules';
import { parseSummaryKey } from '../engine/sdn-title';
import { SdnPageError, assertPage, parseSummaryPage, summaryPageUrl } from './adapters/sdn';
import { SourceHaltedError, type PoliteHost } from './http';
import { brief, closeStaleRuns, pickWalkTargets } from './run-support';
import { SOURCES } from './sources';
import type { Logger, MedPrisma } from './types';

export interface SdnInterviewsDeps {
  prisma: MedPrisma;
  /** The www host (`SOURCES.SDN_WWW`), a separate politeness domain from the forums. */
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
}

export interface SdnInterviewsSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  /** Schools with a `summary:` alias on an active school (one per school). */
  schools: number;
  /** Schools skipped because the stored SDN profile is fresher than 6 days. */
  skipped: number;
  /** Schools whose profile was written this run. */
  fetched: number;
  /** Pages SDN answered without usable data (404, empty report array); stored rows untouched. */
  unavailable: number;
  failed: number;
  profiles: number;
  questionsCreated: number;
  questionsRejected: number;
  /** A further `summary:` key on a school already walked; reported, never fetched. */
  duplicateKeys: number;
  requests: number;
  durationMs: number;
}

const FRESH_MS = 6 * 86_400_000;

export async function runSdnInterviews(
  deps: SdnInterviewsDeps,
  opts: {
    trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP';
  },
): Promise<SdnInterviewsSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();
  const summary: SdnInterviewsSummary = {
    runId: '',
    status: 'FAILED',
    schools: 0,
    skipped: 0,
    fetched: 0,
    unavailable: 0,
    failed: 0,
    profiles: 0,
    questionsCreated: 0,
    questionsRejected: 0,
    duplicateKeys: 0,
    requests: 0,
    durationMs: 0,
  };
  const finish = (): SdnInterviewsSummary => {
    summary.durationMs = now().getTime() - t0;
    return summary;
  };

  if (deps.secret.length < 16) {
    log.error('sdn-interviews: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped');
    return finish();
  }

  await closeStaleRuns(prisma, 'SDN', 'sdn-interviews', now, log);

  let run: {
    id: string;
  };
  try {
    run = await prisma.medSourceRun.create({
      data: {
        source: 'SDN',
        job: 'sdn-interviews',
        trigger: opts.trigger,
        status: 'RUNNING',
      },
    });
  } catch (e) {
    log.error(`sdn-interviews: could not open run: ${brief(e)}`);
    return finish();
  }
  summary.runId = run.id;

  const session = host.session({
    spacingMs: SOURCES.SDN_WWW.backfillSpacingMs,
  });
  let error: string | null = null;
  let incomplete = false;

  try {
    const aliases = (
      await prisma.medSchoolAlias.findMany({
        where: {
          source: 'SDN',
        },
      })
    ).filter((a) => a.sourceKey.startsWith('summary:'));
    const active = new Set(
      (
        await prisma.medSchool.findMany({
          where: {
            active: true,
          },
        })
      ).map((s) => s.id),
    );
    const { targets, duplicates } = pickWalkTargets(aliases, active);
    summary.schools = targets.length;
    summary.duplicateKeys = duplicates.length;
    if (duplicates.length > 0) log.warn(`sdn-interviews: ${duplicates.length} extra summary key(s) not walked`);

    for (const t of targets) {
      if (deps.shouldStop() || session.halted) {
        incomplete = true;
        break;
      }
      const key = parseSummaryKey(t.sourceKey);
      if (key === null) {
        summary.failed++;
        incomplete = true;
        log.warn('sdn-interviews: malformed summary key skipped');
        continue;
      }
      try {
        const stored = await prisma.medInterviewProfile.findFirst({
          where: {
            schoolId: t.schoolId,
            source: 'SDN',
          },
        });
        if (stored !== null && now().getTime() - stored.fetchedAt.getTime() < FRESH_MS) {
          summary.skipped++;
          continue;
        }
        const label = `summary ${key.code}`;
        const res = await session.get(summaryPageUrl(key.code, key.slug));
        let page: ReturnType<typeof parseSummaryPage>;
        try {
          page = parseSummaryPage(assertPage(res, session, label));
        } catch (e) {
          if (!(e instanceof SdnPageError)) throw e;
          if (e.status === 404) {
            summary.unavailable++;
            incomplete = true;
            continue;
          }
          // assertPage already counted a challenge and the client a 429/5xx; only a page that parsed to
          // nothing is ours to count.
          if (e.status === undefined) session.noteFailure(`${label}: unparseable page`);
          throw e;
        }
        session.noteSuccess();
        // An empty report array is not "no interviews": leave the school's stored rows as they are.
        if (page.reports === 0) {
          summary.unavailable++;
          incomplete = true;
          continue;
        }

        // Questions first, profile last.
        const hashes = new Map<string, string>();
        for (const blob of page.questionBlobs) {
          for (const piece of splitQuestions(blob)) {
            const text = scrubQuestion(piece, new Set());
            if (text === null) {
              summary.questionsRejected++;
              continue;
            }
            const h = dedupeHash(deps.secret, 'SDN', `q:${t.schoolId}:${normalizeQuestion(text)}`);
            if (!hashes.has(h)) hashes.set(h, text);
          }
        }
        if (hashes.size > 0) {
          const created = await prisma.medInterviewQuestion.createMany({
            data: [...hashes].map(([dedupeHashValue, text]) => ({
              schoolId: t.schoolId,
              text,
              source: 'SDN',
              votes: null,
              cycleYear: null,
              dedupeHash: dedupeHashValue,
            })),
            skipDuplicates: true,
          });
          summary.questionsCreated += created.count;
        }
        const fields = {
          format: page.format,
          fileType: page.fileType,
          interviewStyle: page.interviewStyle,
          interviewLength: page.interviewLength,
          avgStress: page.avgStress,
          avgImpression: page.avgImpression,
          interviewCount: page.reports,
          inStateCount: page.inStateCount,
          outOfStateCount: page.outOfStateCount,
          feedbackPositive: [],
          feedbackNegative: [],
          feedbackBefore: [],
          fetchedAt: now(),
        };
        await prisma.medInterviewProfile.upsert({
          where: {
            schoolId_source: {
              schoolId: t.schoolId,
              source: 'SDN',
            },
          },
          create: {
            schoolId: t.schoolId,
            source: 'SDN',
            ...fields,
          },
          update: fields,
        });
        summary.profiles++;
        summary.fetched++;
      } catch (e) {
        incomplete = true;
        if (e instanceof SourceHaltedError) break;
        summary.failed++;
        log.warn(`sdn-interviews: ${key.code} failed: ${brief(e)}`);
      }
    }

    if (session.halted) {
      incomplete = true;
      error = brief(session.lastFailure ?? 'source halted');
    }
  } catch (e) {
    error = brief(e);
    log.error(`sdn-interviews: run failed: ${error}`);
    return await close('FAILED');
  }
  return await close(session.halted ? 'FAILED' : incomplete ? 'PARTIAL' : 'OK');

  async function close(status: SdnInterviewsSummary['status']): Promise<SdnInterviewsSummary> {
    summary.status = status;
    summary.requests = session.requests;
    finish();
    const { runId: _id, status: _s, ...counters } = summary;
    try {
      await prisma.medSourceRun.update({
        where: {
          id: run.id,
        },
        data: {
          status,
          finishedAt: now(),
          stats: counters,
          error,
        },
      });
    } catch (e) {
      log.error(`sdn-interviews: could not close run: ${brief(e)}`);
    }
    log.info(
      `sdn-interviews: ${status} schools=${summary.schools} fetched=${summary.fetched} skipped=${summary.skipped} unavailable=${summary.unavailable} failed=${summary.failed} questions=+${summary.questionsCreated}/rejected ${summary.questionsRejected}`,
    );
    return finish();
  }
}
