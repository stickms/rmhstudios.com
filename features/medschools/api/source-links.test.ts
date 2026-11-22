import { describe, expect, it } from 'vitest';
import { buildSourceLinks } from './source-links';
import { canonicalThreadUrl, summaryPageUrl } from '../scrape/adapters/sdn/urls';

const base = { aliases: [], threads: [], currentCycle: 2027 };

describe('buildSourceLinks', () => {
  it('links CycleTrack to the school page', () => {
    const [l] = buildSourceLinks({ ...base, aliases: [{ source: 'CYCLETRACK', sourceKey: 'Texas A&M' }] });
    expect(l).toMatchObject({
      href: 'https://cycletrack.org/explorer/school/Texas%20A%26M',
      name: 'CycleTrack',
      scope: 'school',
    });
  });

  it('links SDN threads and the summary page, thread level only', () => {
    const links = buildSourceLinks({
      aliases: [{ source: 'SDN', sourceKey: 'summary:ABC/duke' }],
      threads: [
        { threadId: 11, slug: 'duke-2026', cycleYear: 2026, archive: true },
        { threadId: 22, slug: 'duke-2027', cycleYear: 2027, archive: false },
      ],
      currentCycle: 2027,
    });
    expect(links.find((l) => l.cycleYear === 2027)).toMatchObject({
      scope: 'thread',
      href: canonicalThreadUrl('duke-2027', 22),
    });
    expect(links.find((l) => l.cycleYear === 2026)).toMatchObject({
      scope: 'thread',
      href: canonicalThreadUrl('duke-2026', 11),
    });
    expect(links.find((l) => l.scope === 'summary')?.href).toBe(summaryPageUrl('ABC', 'duke'));
    for (const l of links) expect(l.href).not.toMatch(/\/post-|#post|\/goto\/|\/members\//);
  });

  it('ignores sources outside the three and unparseable SDN keys', () => {
    expect(
      buildSourceLinks({
        ...base,
        aliases: [
          { source: 'MDAPPLICANTS', sourceKey: 'x' },
          { source: 'RMH', sourceKey: 'y' },
          { source: 'SDN', sourceKey: 'not-a-summary' },
        ],
      }),
    ).toEqual([]);
  });

  it('emits an Admit link only when a school-page URL builder exists', () => {
    const input = { ...base, aliases: [{ source: 'ADMIT', sourceKey: 'duke-university' }] };
    expect(buildSourceLinks(input, undefined)).toEqual([]);
    const [l] = buildSourceLinks(input, (k) => `https://example.test/${k}`);
    expect(l).toMatchObject({
      source: 'ADMIT',
      name: 'Admit.org',
      href: 'https://example.test/duke-university',
      scope: 'school',
    });
  });
});
