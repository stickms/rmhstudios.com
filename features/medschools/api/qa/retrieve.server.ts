/**
 * Retrieval for the Q&A (plan R5): figures come only through the public readers in `read.server.ts` (the k floor, the
 * published RMH snapshot, the primary-source rule and the 404 for an inactive school are inherited, not re-implemented),
 * and pure builders turn their DTOs into facts. No user id reaches this module and it reads no tracker table; a test
 * pins that on this file's source.
 */
import { clampCycle, type RouteResult } from '../../engine/qa/route';
import {
  activityFacts,
  capFacts,
  forecastFacts,
  historyFacts,
  numberRefs,
  schoolFacts,
  FACT_LABELS,
  type DraftFact,
  type SchoolHead,
} from '../../engine/qa/facts';
import type { RetrievedFact } from '../../engine/qa/types';
import { getActivity, getForecast, getHistory, getSchool, siteCycleYear } from '../read.server';
import { stampsFor } from './freshness.server';

export interface Retrieval {
  cycleYear: number;
  schools: { slug: string; shortName: string }[];
  facts: RetrievedFact[];
  /** True when nothing beyond the schools' own header rows was found: there is no figure or interview text to answer from. */
  thin: boolean;
}

const MAX_FACTS = 40;
const MAX_FACT_CHARS = 12_000;

/**
 * Facts for the resolved `slugs` and the route's intent. `facts` and `compare`: header, statistics, profile and activity
 * totals. `interviews`: profile, statistics and questions (8, or 5 per school when the schools came from filters).
 * `timing` and `my-chance`: header, forecast, activity and history, MD (REG) and MD-PhD kept separate.
 */
export async function retrieve(
  route: RouteResult,
  slugs: readonly string[],
  now: Date = new Date(),
): Promise<Retrieval> {
  const cycleYear = clampCycle(route.cycle, await siteCycleYear(now));
  const intent = route.intent;
  const byFilter = route.schools.length === 0 && (route.filters.state !== null || route.filters.format !== null);
  const questions = intent === 'interviews' ? (byFilter ? 5 : 8) : 0;
  const wantsActivity = intent === 'facts' || intent === 'compare' || intent === 'timing' || intent === 'my-chance';
  const wantsTiming = intent === 'timing' || intent === 'my-chance';

  const perSchool = await Promise.all(
    slugs.map(async (slug) => {
      const detail = await getSchool(slug, now);
      if (!detail) return null;
      const head: SchoolHead = {
        slug: detail.school.slug,
        name: detail.school.name,
        shortName: detail.school.shortName,
        degree: detail.school.degree,
      };
      const stamps = await stampsFor(slug);
      const programs: ('REG' | 'PHD')[] = detail.programsWithData.includes('PHD') ? ['REG', 'PHD'] : ['REG'];
      const drafts: DraftFact[] = [];

      const own = schoolFacts(detail, stamps, { questions });
      drafts.push(...(wantsTiming ? own.filter((f) => f.label === FACT_LABELS.school) : own));

      const parts = await Promise.all(
        programs.map(async (program) => {
          const [activity, history, forecast] = await Promise.all([
            wantsActivity ? getActivity(slug, { program, cycle: cycleYear }, now) : null,
            wantsTiming ? getHistory(slug, { program, type: 'INTERVIEW' }, now) : null,
            wantsTiming ? getForecast(slug, { program, type: 'INTERVIEW' }, now) : null,
          ]);
          return [
            ...(activity ? activityFacts(head, activity, stamps, detail.links) : []),
            ...(forecast ? forecastFacts(head, forecast, stamps) : []),
            ...(history ? historyFacts(head, history, stamps, detail.links) : []),
          ];
        }),
      );
      for (const p of parts) drafts.push(...p);
      return { head, drafts };
    }),
  );

  const found = perSchool.filter((x): x is NonNullable<typeof x> => x !== null);
  const facts = capFacts(numberRefs(found.flatMap((x) => x.drafts)), MAX_FACTS, MAX_FACT_CHARS);
  return {
    cycleYear,
    schools: found.map((x) => ({ slug: x.head.slug, shortName: x.head.shortName })),
    facts,
    thin: !facts.some((f) => f.label !== FACT_LABELS.school),
  };
}
