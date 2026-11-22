import type { SourceLinkDto } from '../medschools.contract';
import { SOURCE_NAMES } from '../engine/public-read';
import { parseSummaryKey } from '../engine/sdn-title';
import { schoolUrl } from '../scrape/adapters/cycletrack/urls';
import { canonicalThreadUrl, summaryPageUrl } from '../scrape/adapters/sdn/urls';
import { ADMIT_SCHOOL_URL } from '../scrape/sources';

/**
 * Attribution links for one school (owner O3). Thread-level or school-level only: never a post, a member or a
 * `/goto/` redirect (spec §6). Sources outside CycleTrack, Admit and SDN get no link.
 */
export function buildSourceLinks(
  a: {
    aliases: { source: string; sourceKey: string }[];
    threads: { threadId: number; slug: string; cycleYear: number; archive: boolean }[];
    currentCycle: number;
  },
  admitSchoolUrl: ((aliasKey: string) => string) | undefined = ADMIT_SCHOOL_URL,
): SourceLinkDto[] {
  const links: SourceLinkDto[] = [];
  for (const al of a.aliases) {
    if (al.source === 'CYCLETRACK') {
      links.push({
        source: 'CYCLETRACK',
        name: SOURCE_NAMES.CYCLETRACK,
        href: schoolUrl(al.sourceKey),
        scope: 'school',
        cycleYear: null,
      });
    } else if (al.source === 'ADMIT' && admitSchoolUrl) {
      links.push({
        source: 'ADMIT',
        name: SOURCE_NAMES.ADMIT,
        href: admitSchoolUrl(al.sourceKey),
        scope: 'school',
        cycleYear: null,
      });
    } else if (al.source === 'SDN') {
      const k = parseSummaryKey(al.sourceKey);
      if (k) {
        links.push({
          source: 'SDN',
          name: SOURCE_NAMES.SDN,
          href: summaryPageUrl(k.code, k.slug),
          scope: 'summary',
          cycleYear: null,
        });
      }
    }
  }
  // Newest cycle first; the live (non-archive) thread of the current cycle leads.
  const threads = [...a.threads].sort((x, y) => y.cycleYear - x.cycleYear || Number(x.archive) - Number(y.archive));
  for (const t of threads) {
    links.push({
      source: 'SDN',
      name: SOURCE_NAMES.SDN,
      href: canonicalThreadUrl(t.slug, t.threadId),
      scope: 'thread',
      cycleYear: t.cycleYear,
    });
  }
  return links;
}
