/**
 * The `medschools.secondaries` job: twice a week, each school's secondary prompts are read from Admit's public
 * secondary-essays page (`med.admit.org`) and SDN's essay-questions page (`www.studentdoctor.net`), deduplicated by
 * normalised wording and stored as one observation per prompt, cycle and source (`secondaries-store.ts`). No model is
 * involved, no secret is needed and a school's own website is never read: the third source is a checked-in, one-time import.
 *
 * Two passes in one run (Admit, then SDN), each with its own `MedSourceRun` row (`job 'secondaries'`) so the persisted
 * minimum interval is per source. Each pass walks the active schools' alias keys, stalest check first (never-checked
 * first), skips a school read within `SECONDARIES_FRESH_MS`, and goes through the polite host (one request at a time, at
 * least 3 s plus jitter apart, robots.txt and `Retry-After` honoured, a persisted daily budget shared with the host's
 * other jobs). Every response goes through `assertPage`, so a Cloudflare page or an error page is a failure on the
 * session and three halt the pass.
 *
 * Missing data is not zero (review focus 6): a page that gives nothing recognisable, or nothing where it gave prompts
 * before, leaves the stored rows untouched, marks the check UNAVAILABLE and is not a failure of the run. Observations are
 * never deleted. Anonymization: the adapters emit only `NormalizedPrompt`s, and `MedSourceRun.stats`, the logs and the
 * thrown errors hold counters and static labels, never a page body, a school key or a prompt.
 */
import { cycleYearOf } from '../engine/cycle';
import type { NormalizedPrompt } from '../engine/secondaries/types';
import { parseSummaryKey } from '../engine/sdn-title';
import type { MedSource } from '../engine/types';
import { AdmitPageError, parseSecondaryEssaysPage } from './adapters/admit/secondaries';
import { SdnPageError, assertPage, essayQuestionsUrl, parseEssayQuestionsPage } from './adapters/sdn';
import { SourceHaltedError, type PoliteClient, type PoliteHost } from './http';
import { brief, closeStaleRuns, lastRealRunWithin, pickWalkTargets } from './run-support';
import { recordCheck, recordPrompts, storedObservationCount } from './secondaries-store';
import { ADMIT_SECONDARY_URL, SOURCES } from './sources';
import type { Logger, MedPrisma } from './types';

/** Sunday and Wednesday, 05:35 UTC. No model is used, so DeepSeek's peak hours do not matter. */
export const SECONDARIES_CRON = '35 5 * * 0,3';
/** A non-manual run inside this window of a real one is skipped (60 h: under the 3.5 days between the two crons). */
export const SECONDARIES_MIN_INTERVAL_MS = 60 * 3_600_000;
/**
 * A school x source read inside this window is skipped. The plan said 3 days; the crons are 3 and 4 days apart, so a school
 * read a few minutes into a run would still be "fresh" at the next one and about half the schools would skip a whole
 * run. 60 h keeps the point of the window (a re-run or a resume after a halt does not read a page twice) and refreshes
 * every school at every scheduled run.
 */
export const SECONDARIES_FRESH_MS = SECONDARIES_MIN_INTERVAL_MS;
/** Owner rule (2026-11-23): at least 3 s between requests plus 0-1 s of jitter, on every host this job reads. */
export const SECONDARIES_SDN_SPACING_MS = 3000;
export const SECONDARIES_SDN_JITTER_MS = 1000;
/** A hard cap on requests per pass: the walk is about one page per school (about 240). */
export const SECONDARIES_MAX_REQUESTS_PER_PASS = 400;
/** This many unreadable pages in a row (markup changed everywhere) end the pass instead of spending the budget on all of them. */
export const SECONDARIES_MAX_CONSECUTIVE_UNREADABLE = 5;

export interface SecondariesDeps {
  prisma: MedPrisma;
  /** `SOURCES.ADMIT_WEB` (med.admit.org). */
  admitHost: PoliteHost;
  /** `SOURCES.SDN_WWW` (www.studentdoctor.net). */
  sdnHost: PoliteHost;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  maxRequestsPerPass?: number;
  /** The run ends itself this many ms after it started (the worker also passes a `shouldStop` for the queue's expiry). */
  deadlineMs?: number;
  /** Which passes run (the worker turns a pass off with its source flag); both by default. */
  passes?: { admit: boolean; sdn: boolean };
}

export interface PassCounters {
  /** Targets: active schools with an alias for this source. */
  schools: number;
  /** Pages read and stored. */
  fetched: number;
  /** Schools skipped because they were read inside `SECONDARIES_FRESH_MS`. */
  fresh: number;
  /** Pages that gave nothing recognisable (or nothing where prompts were stored): stored rows untouched. */
  unavailable: number;
  /** Pages that gave nothing for a school with nothing stored. */
  empty: number;
  failed: number;
  prompts: number;
  created: number;
  rejected: number;
  requests: number;
}

export interface SecondariesSummary {
  status: 'OK' | 'PARTIAL' | 'FAILED';
  outcome: 'ran' | 'skipped-min-interval';
  admit: PassCounters;
  sdn: PassCounters;
  durationMs: number;
}

const zero = (): PassCounters => ({
  schools: 0,
  fetched: 0,
  fresh: 0,
  unavailable: 0,
  empty: 0,
  failed: 0,
  prompts: 0,
  created: 0,
  rejected: 0,
  requests: 0,
});

interface Target {
  schoolId: string;
  url: string;
}

type PassResult = { status: 'OK' | 'PARTIAL' | 'FAILED'; skipped: boolean };

const SAFE_PART = /^[\w.-]+$/;

export async function runSecondaries(
  deps: SecondariesDeps,
  opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
): Promise<SecondariesSummary> {
  const { prisma, log } = deps;
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();
  const summary: SecondariesSummary = {
    status: 'FAILED',
    outcome: 'ran',
    admit: zero(),
    sdn: zero(),
    durationMs: 0,
  };
  const siteCycle = cycleYearOf(now(), 'SECONDARY');
  const passes = deps.passes ?? { admit: true, sdn: true };
  const results: PassResult[] = [];

  const adapters = {
    ADMIT: {
      host: deps.admitHost,
      label: 'admit',
      session: { spacingMs: SOURCES.ADMIT_WEB.spacingMs, jitterMs: SOURCES.ADMIT_WEB.jitterMs ?? 0 },
      counters: summary.admit,
      targets: (
        aliases: { schoolId: string; sourceKey: string }[],
      ): { schoolId: string; url: string; bad: boolean }[] =>
        aliases.map((a) => ({
          schoolId: a.schoolId,
          url: SAFE_PART.test(a.sourceKey) ? ADMIT_SECONDARY_URL(a.sourceKey) : '',
          bad: !SAFE_PART.test(a.sourceKey),
        })),
      parse: (html: string): NormalizedPrompt[] => parseSecondaryEssaysPage(html, { currentCycle: siteCycle }),
      isLayoutError: (e: unknown): boolean => e instanceof AdmitPageError,
    },
    SDN: {
      host: deps.sdnHost,
      label: 'sdn',
      session: { spacingMs: SECONDARIES_SDN_SPACING_MS, jitterMs: SECONDARIES_SDN_JITTER_MS },
      counters: summary.sdn,
      targets: (
        aliases: { schoolId: string; sourceKey: string }[],
      ): { schoolId: string; url: string; bad: boolean }[] =>
        aliases
          .filter((a) => a.sourceKey.startsWith('summary:'))
          .map((a) => {
            const key = parseSummaryKey(a.sourceKey);
            const ok = key !== null && SAFE_PART.test(key.code) && SAFE_PART.test(key.slug);
            return { schoolId: a.schoolId, url: ok ? essayQuestionsUrl(key.code, key.slug) : '', bad: !ok };
          }),
      parse: (html: string): NormalizedPrompt[] => parseEssayQuestionsPage(html, { currentCycle: siteCycle }),
      // The page guard's errors carry a status; a parser's "this is not the shape I know" has none.
      isLayoutError: (e: unknown): boolean => e instanceof SdnPageError && e.status === undefined,
    },
  } as const;

  async function runPass(source: 'ADMIT' | 'SDN'): Promise<PassResult> {
    const a = adapters[source];
    const counters = a.counters;
    const medSource: MedSource = source;
    const tag = `secondaries ${a.label}`;
    await closeStaleRuns(prisma, medSource, 'secondaries', now, log);
    let run: { id: string };
    try {
      run = await prisma.medSourceRun.create({
        data: { source: medSource, job: 'secondaries', trigger: opts.trigger, status: 'RUNNING', startedAt: now() },
      });
    } catch (e) {
      log.error(`${tag}: could not open run: ${brief(e)}`);
      return { status: 'FAILED', skipped: false };
    }
    let error: string | null = null;
    let outcome: SecondariesSummary['outcome'] = 'ran';
    const close = async (status: PassResult['status']): Promise<PassResult> => {
      try {
        await prisma.medSourceRun.update({
          where: { id: run.id },
          data: {
            status,
            finishedAt: now(),
            // Counters and a label only: nothing a page or a school could put there.
            stats: { outcome, ...counters, durationMs: now().getTime() - t0 },
            error,
          },
        });
      } catch (e) {
        log.error(`${tag}: could not close run: ${brief(e)}`);
      }
      log.info(
        `${tag}: ${status} ${outcome} schools=${counters.schools} fetched=${counters.fetched} fresh=${counters.fresh} unavailable=${counters.unavailable} empty=${counters.empty} failed=${counters.failed} prompts=${counters.prompts} created=${counters.created} rejected=${counters.rejected} requests=${counters.requests}`,
      );
      return { status, skipped: outcome === 'skipped-min-interval' };
    };

    // A persisted minimum interval: a restart, a duplicate trigger or a mistyped cron cannot run this more than about
    // twice a week. A ledger read error fails closed (a background job spends unattended). A person's manual run bypasses it.
    if (opts.trigger !== 'MANUAL') {
      let recent = true;
      try {
        recent = await lastRealRunWithin(prisma, medSource, 'secondaries', SECONDARIES_MIN_INTERVAL_MS, now());
      } catch (e) {
        log.warn(`${tag}: could not read the last run: ${brief(e)}`);
      }
      if (recent) {
        outcome = 'skipped-min-interval';
        return close('OK');
      }
    }

    const session: PoliteClient = a.host.session(a.session);
    let incomplete = false;
    let unreadableRun = 0;
    const cap = deps.maxRequestsPerPass ?? SECONDARIES_MAX_REQUESTS_PER_PASS;
    try {
      const aliases = await prisma.medSchoolAlias.findMany({ where: { source: medSource } });
      const activeRows = await prisma.medSchool.findMany({ where: { active: true } });
      const active = new Set(activeRows.map((s) => s.id));
      const mapped = a.targets(aliases.filter((x) => active.has(x.schoolId)));
      const malformed = mapped.filter((t) => t.bad).length;
      if (malformed > 0) {
        counters.failed += malformed;
        incomplete = true;
        log.warn(`${tag}: ${malformed} malformed alias key(s) skipped`);
      }
      // One key per school: the first (sorted) wins, as in the other walks. The page URL stands in as the key here.
      const { targets: picked } = pickWalkTargets(
        mapped.filter((t) => !t.bad).map((t) => ({ schoolId: t.schoolId, sourceKey: t.url })),
        active,
      );
      const targets: Target[] = picked.map((t) => ({ schoolId: t.schoolId, url: t.sourceKey }));
      counters.schools = targets.length;

      const checks = await prisma.medSecondaryCheck.findMany({ where: { source } });
      const checkedAt = new Map(checks.map((c) => [c.schoolId, c.checkedAt.getTime()] as const));
      // Stalest first, never-checked before any: a run that stops early has still read the schools that waited longest.
      targets.sort((x, y) => (checkedAt.get(x.schoolId) ?? -Infinity) - (checkedAt.get(y.schoolId) ?? -Infinity));

      /** The page gave nothing: EMPTY for a school with nothing stored, UNAVAILABLE where rows exist (left untouched). */
      const settleNothing = async (schoolId: string): Promise<void> => {
        const stored = await storedObservationCount(prisma, schoolId, source);
        const status = stored > 0 ? 'UNAVAILABLE' : 'EMPTY';
        await recordCheck(prisma, { schoolId, source, now: now(), status, promptCount: 0 });
        if (status === 'UNAVAILABLE') counters.unavailable++;
        else counters.empty++;
      };

      for (const t of targets) {
        if (deps.shouldStop() || session.halted) {
          incomplete = true;
          break;
        }
        if (deps.deadlineMs !== undefined && now().getTime() - t0 > deps.deadlineMs) {
          incomplete = true;
          log.warn(`${tag}: deadline reached`);
          break;
        }
        if (session.requests >= cap) {
          incomplete = true;
          log.warn(`${tag}: request cap reached`);
          break;
        }
        const seen = checkedAt.get(t.schoolId);
        if (seen !== undefined && now().getTime() - seen < SECONDARIES_FRESH_MS) {
          counters.fresh++;
          continue;
        }
        try {
          const res = await session.get(t.url);
          let body: string;
          try {
            body = assertPage(res, session, `${a.label} page`);
          } catch (e) {
            // A missing page is "nothing here", not a failure (the host and `assertPage` already counted anything worse).
            if (e instanceof SdnPageError && e.status === 404) {
              await settleNothing(t.schoolId);
              continue;
            }
            throw e;
          }
          let prompts: NormalizedPrompt[];
          try {
            prompts = a.parse(body);
          } catch (e) {
            if (!a.isLayoutError(e)) throw e;
            // The host answered; the page is not a shape we know. Rows stay as they are, nothing is marked gone.
            session.noteSuccess();
            await settleNothing(t.schoolId);
            if (++unreadableRun >= SECONDARIES_MAX_CONSECUTIVE_UNREADABLE) {
              incomplete = true;
              log.warn(
                `${tag}: ${unreadableRun} unreadable pages in a row; the markup has probably changed, pass stopped`,
              );
              break;
            }
            continue;
          }
          session.noteSuccess();
          unreadableRun = 0;
          if (prompts.length === 0) {
            await settleNothing(t.schoolId);
            continue;
          }
          const r = await recordPrompts(prisma, {
            schoolId: t.schoolId,
            source,
            now: now(),
            siteCycle,
            prompts: prompts.map((p) => ({ ...p, sourceRef: t.url })),
          });
          counters.rejected += r.rejected;
          if (r.prompts === 0) {
            await settleNothing(t.schoolId);
            continue;
          }
          await recordCheck(prisma, { schoolId: t.schoolId, source, now: now(), status: 'OK', promptCount: r.prompts });
          counters.fetched++;
          counters.prompts += r.prompts;
          counters.created += r.created;
        } catch (e) {
          incomplete = true;
          if (e instanceof SourceHaltedError) break; // a spent daily budget is one of these
          counters.failed++;
          log.warn(`${tag}: a page failed: ${brief(e)}`);
        }
      }
      if (session.halted) {
        incomplete = true;
        error = brief(session.lastFailure ?? 'source halted');
      }
    } catch (e) {
      error = brief(e);
      log.error(`${tag}: run failed: ${error}`);
      counters.requests = session.requests;
      return close('FAILED');
    }
    counters.requests = session.requests;
    return close(incomplete ? 'PARTIAL' : 'OK');
  }

  if (passes.admit) results.push(await runPass('ADMIT'));
  if (passes.sdn) results.push(await runPass('SDN'));

  if (results.length > 0 && results.every((r) => r.skipped)) summary.outcome = 'skipped-min-interval';
  summary.status =
    results.length === 0 || results.every((r) => r.status === 'OK')
      ? 'OK'
      : results.every((r) => r.status === 'FAILED')
        ? 'FAILED'
        : 'PARTIAL';
  summary.durationMs = now().getTime() - t0;
  return summary;
}
