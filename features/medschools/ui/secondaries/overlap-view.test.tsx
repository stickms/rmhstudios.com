import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) => {
      const tpl =
        o.count === 1 && typeof o.defaultValue_one === 'string' ? (o.defaultValue_one as string) : o.defaultValue;
      return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? ''));
    },
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string;
    params?: { slug: string };
    search?: { tab?: string; program?: string };
    children: ReactNode;
  }) => (
    <a href={`${to.replace('$slug', params?.slug ?? '')}?tab=${search?.tab ?? ''}&program=${search?.program ?? ''}`}>
      {children}
    </a>
  ),
}));

import { overlapQuery } from '../../medschools.queries';
import type { MedSecondaryOverlapRes } from '../../medschools.contract';
import { OverlapSection } from './OverlapSection';
import { OverlapView } from './OverlapView';
import { useSecondaryLabels } from './labels';

const entry = (slug: string, over: Partial<MedSecondaryOverlapRes['groups'][number]['entries'][number]> = {}) => ({
  slug,
  schoolName: `${slug} School`,
  program: 'REG' as const,
  promptId: `${slug}-1`,
  text: `A prompt from ${slug}.`,
  limit: { kind: 'WORDS' as const, value: 250 },
  optional: false,
  basis: 'current' as const,
  ...over,
});

const data = (o: Partial<MedSecondaryOverlapRes> = {}): MedSecondaryOverlapRes => ({
  cycleYear: 2027,
  source: 'list',
  groups: [
    {
      theme: 'diversity',
      schools: 2,
      shortestWords: 250,
      longestWords: 300,
      entries: [
        entry('duke'),
        entry('wake', { limit: { kind: 'WORDS', value: 300 }, basis: 'last-cycle', optional: true }),
      ],
    },
    {
      theme: 'research',
      schools: 1,
      shortestWords: null,
      longestWords: null,
      entries: [entry('yale', { limit: null })],
    },
  ],
  withoutPrompts: [{ slug: 'nova', name: 'Nova School' }],
  schoolCount: 4,
  ...o,
});

function View({ d }: { d: MedSecondaryOverlapRes }) {
  const labels = useSecondaryLabels();
  return (
    <OverlapView
      data={d}
      labels={labels}
      school={(slug, program, name) => <a href={`/${slug}?p=${program}`}>{name}</a>}
    />
  );
}
const view = (d: MedSecondaryOverlapRes) => renderToString(<View d={d} />);

describe('OverlapView', () => {
  it('renders groups in the response order with their school counts', () => {
    const html = view(data());
    expect(html.indexOf('Diversity · 2 schools')).toBeGreaterThan(-1);
    expect(html).toContain('Research · 1 school');
    expect(html.indexOf('Diversity')).toBeLessThan(html.indexOf('Research'));
  });

  it('a group of two or more schools shows the shortest limit, a single-school group is collapsed', () => {
    const html = view(data());
    expect(html).toContain('Shortest limit: 250 words. Writing to that limit covers all 2.');
    const single = html.indexOf('Asked by one school');
    expect(single).toBeGreaterThan(-1);
    expect(html.indexOf('Research')).toBeGreaterThan(single);
    expect(html.indexOf('Diversity')).toBeLessThan(single);
    expect(html.slice(html.lastIndexOf('<details', single), single)).not.toContain(' open');
  });

  it('marks prompts from last cycle and optional ones, and lists schools with no prompts', () => {
    const html = view(data());
    expect(html).toContain('From last cycle');
    expect(html).toContain('Optional');
    expect(html).toContain('No prompts found yet: Nova School');
  });

  it('says what is missing when there is nothing to group', () => {
    expect(view(data({ groups: [], withoutPrompts: [], schoolCount: 0 }))).toContain(
      'Add schools to see their prompts grouped by theme.',
    );
    expect(view(data({ groups: [], withoutPrompts: [], schoolCount: 3 }))).toContain(
      'None of these schools has prompts on file yet.',
    );
  });

  it('links each school by the render prop and takes no input', () => {
    const html = view(data());
    expect(html).toContain('<a href="/duke?p=REG">duke School</a>');
    expect(html).not.toMatch(/<(input|textarea)\b|contenteditable/);
  });

  it('writes each row as school, then prompt, then limit, so the order reads the same in a right-to-left page', () => {
    const row = view(data()).split('<li')[1] ?? '';
    expect(row.indexOf('duke School')).toBeLessThan(row.indexOf('A prompt from duke.'));
    expect(row.indexOf('A prompt from duke.')).toBeLessThan(row.indexOf('250 words'));
  });
});

describe('OverlapSection', () => {
  const qFor = (source: Parameters<typeof overlapQuery>[0]) => overlapQuery(source);

  it('is a closed native disclosure that has asked for nothing', () => {
    const qc = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <OverlapSection source={{ source: 'list', list: 'L1' }} />
      </QueryClientProvider>,
    );
    expect(html).toContain('<details');
    expect(html).toContain('Essay overlap');
    expect(html).not.toContain('Diversity');
    const state = qc.getQueryCache().find({ queryKey: qFor({ source: 'list', list: 'L1' }).queryKey })?.state;
    expect(state?.fetchStatus ?? 'idle').toBe('idle');
    expect(state?.data).toBeUndefined();
    expect(readFileSync(new URL('./OverlapSection.tsx', import.meta.url), 'utf8')).toContain('enabled: open');
  });

  it('opened, it shows the grouped prompts for the list it was given, linking to the Secondaries tab', () => {
    const qc = new QueryClient();
    qc.setQueryData(qFor({ source: 'list', list: 'L1' }).queryKey, data());
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <OverlapSection source={{ source: 'list', list: 'L1' }} defaultOpen />
      </QueryClientProvider>,
    );
    expect(html).toContain('Diversity · 2 schools');
    expect(html).toContain('/med/duke?tab=secondaries');
  });

  it('opened and loading it shows a skeleton, and the tracker source has its own key', () => {
    const qc = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <OverlapSection source={{ source: 'tracker' }} defaultOpen />
      </QueryClientProvider>,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(qFor({ source: 'tracker' }).queryKey).not.toEqual(qFor({ source: 'list', list: 'L1' }).queryKey);
  });
});
