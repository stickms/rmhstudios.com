/**
 * The AI school-list builder (phase D, owner 2026-11-24). The Ask's gates and pattern, not a second set:
 * `admitQuestion` (the shared monthly pause, the member's own allowance, one of the day's questions and the in-flight
 * lease; an admin bypasses the per-member ceilings), `runUnderLease` with the question deadline and the request's
 * signal, and the thinking switch for the answer call only.
 *
 * 1. The route call reads the request into filters (`parseBuilderRoute` re-checks them).
 * 2. Candidates are chosen in code from public data only (`readPublicSchools`, `selectCandidates`).
 * 3. Labels are computed in code (`labelFor`) from the member's MCAT and GPA, only when "Use my stats" is ticked.
 * 4. The answer call may only pick among the candidates and write one reason each; `groundPicks` keeps a reason only
 *    when every number in it is in a cited fact (the member's own figures are facts labelled "your").
 *
 * Nothing about the request, the stats sent or the answer is stored, cached or logged: they live in memory for this
 * call. Logs carry counts and a status. The one trace is the text-free `AiUsage` row the provider writes per call. The
 * model sees the request, the candidates' public figures and, with "Use my stats", the member's few figures
 * (`statsForBuilder`: never a note or activity title), never another member's data, a tracker row or a list.
 */
import { MEDSCHOOLS_LIST_ANSWER, MEDSCHOOLS_LIST_ROUTE, asData, systemFor } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { qaDeadlineMs } from '../../ai-budget';
import { selectCandidates, type PublicSchool } from '../../engine/builder/candidates';
import {
  candidateFigures,
  groundPicks,
  memberDtos,
  memberFacts,
  type BuilderMemberStats,
  type ModelCandidate,
} from '../../engine/builder/facts';
import { LABEL_ORDER, labelFor, type MemberFigures } from '../../engine/builder/label';
import { parseBuilderRoute, type BuilderRoute } from '../../engine/builder/route';
import { cleanForPrompt } from '../../engine/qa/sanitize';
import type { Mission } from '../../engine/applicant';
import type { MedBuildRes, MedBuildSchoolDto } from '../../medschools.contract';
import { admitQuestion } from '../qa/budget.server';
import { assertLive, runUnderLease } from '../qa/lease.server';
import { aiBuilderRunner, type QaRunner } from '../qa/runner.server';
import { thinkingAvailable } from '../qa/thinking.server';
import { statsForBuilder } from '../stats.server';
import { readPublicSchools } from './candidates.server';

export interface BuildInput {
  userId: string;
  isAdmin?: boolean | undefined;
  request: string;
  useStats?: boolean | undefined;
  think?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

export interface BuildDeps {
  runner?: QaRunner;
  now?: Date;
  readSchools?: () => Promise<PublicSchool[]>;
  readStats?: (userId: string) => Promise<BuilderMemberStats | null>;
}

const MAX_REQUEST = 400;
type Base = Pick<MedBuildRes, 'tier' | 'remainingToday' | 'dailyCap'>;

const filtersOf = (r: BuilderRoute, unused: Mission[] = []): MedBuildRes['filters'] => ({
  states: r.states,
  degree: r.degree,
  mdphd: r.mdphd,
  size: r.size,
  missions: r.missions,
  unused,
  count: r.count,
});

function log(status: string, extra: Record<string, number> = {}): void {
  console.warn('[medschools-builder]', JSON.stringify({ status, ...extra }));
}

export async function buildList(i: BuildInput, deps: BuildDeps = {}): Promise<MedBuildRes> {
  const now = deps.now ?? new Date();
  const gate = await admitQuestion(i.userId, now, { isAdmin: i.isAdmin === true });
  const think = i.think === true && thinkingAvailable();
  return runUnderLease(gate, qaDeadlineMs(think), i.signal, async (signal) => {
    const base: Base = { tier: gate.tier, remainingToday: gate.remainingToday, dailyCap: gate.dailyCap };
    const res = await run(i, deps, base, signal, think);
    if (res === 'unreadable') {
      // The model answered with nothing usable: not the member's doing, so the day's question goes back (the import's rule).
      await gate.refund();
      throw new AppError('AI_UNAVAILABLE');
    }
    return res;
  });
}

async function run(
  i: BuildInput,
  deps: BuildDeps,
  base: Base,
  signal: AbortSignal,
  think: boolean,
): Promise<MedBuildRes | 'unreadable'> {
  const runner = deps.runner ?? aiBuilderRunner;
  const live = () => assertLive(signal);
  const request = cleanForPrompt(i.request, MAX_REQUEST);
  const routeSystem = systemFor(MEDSCHOOLS_LIST_ROUTE);
  const route = parseBuilderRoute(await runner.route(routeSystem, asData(JSON.stringify({ request })), i.userId, signal));
  live();
  const empty = (over: Partial<MedBuildRes>): MedBuildRes => ({
    status: 'no-candidates',
    usedStats: false,
    statsMissing: false,
    schools: [],
    member: [],
    filters: filtersOf(route),
    notice: null,
    thinking: false,
    ...base,
    ...over,
  });
  if (route.intent === 'other') {
    log('declined');
    return empty({ status: 'declined' });
  }

  // The member's own figures, only when asked for. A home state the request states is the member's own word, too.
  const stored = i.useStats === true ? await (deps.readStats ?? statsForBuilder)(i.userId) : null;
  live();
  const stats: BuilderMemberStats | null =
    stored || route.homeState
      ? {
          mcat: stored?.mcat ?? null,
          gpaCumulative: stored?.gpaCumulative ?? null,
          gpaScience: stored?.gpaScience ?? null,
          homeState: route.homeState ?? stored?.homeState ?? null,
          hours: stored?.hours ?? [],
          missions: stored?.missions ?? [],
        }
      : null;
  const compare: MemberFigures | null =
    i.useStats === true
      ? {
          mcat: stats?.mcat ? { latest: stats.mcat.total, earlier: stats.mcat.earlier } : null,
          gpa: stats?.gpaCumulative ?? null,
        }
      : null;
  const usedStats = compare !== null && (compare.mcat !== null || compare.gpa !== null);
  const statsMissing = i.useStats === true && !usedStats;
  // The request's missions, and the member's chips when their stats are used.
  const missions = [...new Set([...route.missions, ...(i.useStats === true ? (stats?.missions ?? []) : [])])];

  const schools = await (deps.readSchools ?? readPublicSchools)();
  live();
  const { candidates, unused } = selectCandidates(schools, {
    states: route.states,
    degree: route.degree,
    mdphd: route.mdphd,
    size: route.size,
    missions,
  });
  const filters = { ...filtersOf(route, unused), missions };
  if (candidates.length === 0) {
    log('no-candidates', { schools: schools.length });
    return empty({ status: 'no-candidates', filters, usedStats, statsMissing });
  }

  // Without "Use my stats" the model sees none of the stored figures: at most the home state the request itself states.
  const shown: BuilderMemberStats | null =
    i.useStats === true
      ? stats
      : route.homeState
        ? { mcat: null, gpaCumulative: null, gpaScience: null, homeState: route.homeState, hours: [], missions: [] }
        : null;
  const member = memberFacts(shown);
  const rows = candidates.map((c, n) => {
    const { label, comparisons } = labelFor(usedStats ? compare : null, c.figures);
    const { figures, texts } = candidateFigures(c, n + 1);
    return { c, label, comparisons, figures, texts };
  });
  const model: ModelCandidate[] = rows.map((r, n) => ({
    id: `c${n + 1}`,
    name: r.c.school.name,
    state: r.c.school.state,
    label: r.label,
    facts: r.figures.map((f, k) => ({ ref: f.ref, label: f.kind, text: r.texts[k] ?? '' })),
  }));

  const answerSystem = systemFor(MEDSCHOOLS_LIST_ANSWER);
  const raw = await runner.answer(
    answerSystem,
    asData(
      JSON.stringify({
        request,
        count: route.count,
        candidates: model,
        member: member.map(({ ref, kind, text }) => ({ ref, label: kind, text })),
      }),
    ),
    i.userId,
    signal,
    { think },
  );
  live();
  const checked = groundPicks(raw, model, member, route.count, { secrets: [answerSystem, routeSystem] });
  if (!checked) {
    log('unreadable', { candidates: candidates.length });
    return 'unreadable';
  }
  if (checked.picks.length === 0) {
    log('no-picks', { candidates: candidates.length, ignored: checked.ignored });
    return empty({ status: 'no-picks', filters, usedStats, statsMissing, member: memberDtos(member), thinking: think });
  }
  const home = shown?.homeState ?? null;
  const out: MedBuildSchoolDto[] = checked.picks.map((p) => {
    const r = rows[p.index]!;
    const s = r.c.school;
    // The MD-PhD program and an MSTP listing are cited figures of the row; only the home state is a note.
    const notes: MedBuildSchoolDto['notes'] = home && s.state === home ? ['home-state'] : [];
    return {
      slug: s.slug,
      name: s.name,
      shortName: s.shortName,
      state: s.state,
      city: s.city,
      degree: s.degree,
      program: route.mdphd ? 'PHD' : 'ANY',
      label: r.label,
      comparisons: r.comparisons,
      figures: r.figures,
      notes,
      reason: p.reason,
    };
  });
  // Grouped by label in a fixed order; within a group, the model's order.
  out.sort((a, b) => LABEL_ORDER.indexOf(a.label) - LABEL_ORDER.indexOf(b.label));
  const status = checked.reasonsDropped > 0 ? 'partial' : 'built';
  log(status, {
    candidates: candidates.length,
    picked: out.length,
    reasonsDropped: checked.reasonsDropped,
    ignored: checked.ignored,
    ...(usedStats ? { stats: 1 } : {}),
    ...(think ? { think: 1 } : {}),
  });
  return {
    ...base,
    status,
    usedStats,
    statsMissing,
    schools: out,
    member: memberDtos(member),
    filters,
    notice: checked.reasonsDropped > 0 ? 'removed-ungrounded' : null,
    thinking: think,
  };
}
