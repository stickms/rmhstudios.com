import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
  }),
}));

import type { SourceLinkDto } from '../medschools.contract';
import { SourceLinks } from './SourceLinks';

const sdn: SourceLinkDto = {
  source: 'SDN',
  name: 'Student Doctor Network',
  href: 'https://forums.studentdoctor.net/threads/example.1/',
  scope: 'thread',
  cycleYear: 2026,
};
const ct: SourceLinkDto = {
  source: 'CYCLETRACK',
  name: 'CycleTrack',
  href: 'https://cycletrack.example/school/x',
  scope: 'school',
  cycleYear: null,
};

describe('SourceLinks', () => {
  it('names the source in the attribution line and links to the DTO href', () => {
    const html = renderToString(<SourceLinks links={[sdn]} />);
    expect(html).toContain('Source: Student Doctor Network');
    expect(html).toContain(`href="${sdn.href}"`);
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(html).toContain('target="_blank"');
  });
  it('renders a CycleTrack link', () => {
    expect(renderToString(<SourceLinks links={[ct]} />)).toContain('Source: CycleTrack');
  });
  it('tells apart links to the same source: cycle thread vs feedback summary', () => {
    const html = renderToString(
      <SourceLinks links={[sdn, { ...sdn, href: 'https://x.test/summary', scope: 'summary', cycleYear: null }]} />,
    );
    expect(html).toContain('Source: Student Doctor Network, 2026 cycle');
    expect(html).toContain('Source: Student Doctor Network, interview feedback');
  });
  it('renders nothing for no links', () => {
    expect(renderToString(<SourceLinks links={[]} />)).toBe('');
  });
  it('shows a cycle year only when asked to filter by it', () => {
    const html = renderToString(
      <SourceLinks links={[sdn, { ...sdn, href: 'https://x.test/old', cycleYear: 2025 }]} cycleYear={2026} />,
    );
    expect(html).toContain(sdn.href);
    expect(html).not.toContain('https://x.test/old');
  });
});
