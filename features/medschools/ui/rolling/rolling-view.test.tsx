import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
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

import { rollingQuery } from '../../medschools.queries';
import type { MedRollingEntryDto, MedRollingGuidanceRes } from '../../medschools.contract';
import { RollingSection } from './RollingSection';
import { RollingView } from './RollingView';

const entry = (slug: string, over: Partial<MedRollingEntryDto> = {}): MedRollingEntryDto => ({
  slug,
  schoolName: `${slug} School`,
  degree: 'MD',
  program: 'REG',
  kind: 'rolling',
  evidence: `We review ${slug} applications as they arrive.`,
  url: `https://${slug}.example/admissions`,
  checkedOn: '2026-11-20',
  submitted: null,
  ...over,
});
const data = (over: Partial<MedRollingGuidanceRes> = {}): MedRollingGuidanceRes => ({
  cycleYear: 2027,
  source: 'list',
  entries: [
    entry('duke'),
    entry('wake', { kind: 'set-dates', evidence: 'Decisions go out in March.' }),
    entry('yale', { program: 'PHD', kind: 'unknown', evidence: null, url: null, checkedOn: null }),
  ],
  schoolCount: 3,
  ...over,
});
const view = (d: MedRollingGuidanceRes) =>
  renderToString(<RollingView data={d} school={(slug, _p, name) => <a href={`/${slug}`}>{name}</a>} />);

describe('RollingView', () => {
  it('says what the school says, quotes it, and links the page with the day it was checked', () => {
    const html = view(data());
    expect(html).toContain('Rolling: the school says offers are made on a rolling basis.');
    expect(html).toContain('Set dates: the school says decisions are made on set dates.');
    expect(html).toContain('“We review duke applications as they arrive.”');
    // The source is the icon at the end of the school's line: it opens the page at the quote (a text fragment).
    expect(html).toContain(
      'data-href="https://duke.example/admissions#:~:text=We%20review%20duke%20applications%20as%20they%20arrive."',
    );
    expect(html).toContain('Source: duke School admissions page, checked Nov 20, 2026');
    expect(html).toContain('data-slot="med-source-ref"');
  });

  it('keeps the order it is given', () => {
    const html = view(data());
    expect(html.indexOf('duke School')).toBeLessThan(html.indexOf('wake School'));
    expect(html.indexOf('wake School')).toBeLessThan(html.indexOf('yale School'));
  });

  it('an MD-PhD row with no fact names the program and quotes nothing', () => {
    const html = view(data());
    expect(html.replace(/<!--.*?-->/g, '')).toContain('yale School</a></span> · MD-PhD');
    expect(html).toContain('The school’s MD-PhD page does not say.');
    expect(html.split('<li')[3]).not.toContain('“');
    expect(html.split('<li')[3]).not.toContain('Source:');
  });

  it('a regular row with no fact says the page does not say, and a DO school names its own degree', () => {
    const html = view(
      data({ entries: [entry('nova', { degree: 'DO', kind: 'unknown', evidence: null, url: null, checkedOn: null })] }),
    );
    expect(html).toContain('The school’s page does not say.');
    expect(html.replace(/<!--.*?-->/g, '')).toContain('nova School</a></span> · DO');
  });

  it('flags a tracker school with no step recorded, and never a list one', () => {
    const t = view(data({ source: 'tracker', entries: [entry('duke', { submitted: false })] }));
    expect(t).toContain('No step recorded here yet.');
    expect(view(data())).not.toContain('No step recorded here yet.');
  });

  it('gives no instruction and no exclamation mark', () => {
    const html = view(data());
    expect(html.replace(/<!--.*?-->/g, '')).not.toMatch(/!|you must|should|submit now|hurry/i);
  });

  it('says what is missing when there is nothing to show', () => {
    expect(view(data({ entries: [], schoolCount: 0 }))).toContain(
      'Add schools to see what each one says about rolling decisions.',
    );
  });
});

describe('RollingSection', () => {
  it('is a closed native disclosure that has asked for nothing', () => {
    const qc = new QueryClient();
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <RollingSection source={{ source: 'list', list: 'L1' }} />
      </QueryClientProvider>,
    );
    expect(html).toContain('<details');
    expect(html).toContain('Where applying early matters');
    expect(html).not.toContain('Rolling:');
    const state = qc.getQueryCache().find({ queryKey: rollingQuery({ source: 'list', list: 'L1' }).queryKey })?.state;
    expect(state?.fetchStatus ?? 'idle').toBe('idle');
    expect(readFileSync(new URL('./RollingSection.tsx', import.meta.url), 'utf8')).toContain('enabled: open');
  });

  it('opened, it shows the context sentence and the rows, linking to the school', () => {
    const qc = new QueryClient();
    qc.setQueryData(rollingQuery({ source: 'list', list: 'L1' }).queryKey, data());
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <RollingSection source={{ source: 'list', list: 'L1' }} defaultOpen />
      </QueryClientProvider>,
    );
    expect(html).toContain('seats can fill as the cycle goes on.');
    expect(html).toContain('Rolling: the school says offers are made on a rolling basis.');
    expect(html).toContain('/med/duke?tab=secondaries');
    expect(html).toContain('/med/yale?tab=secondaries&amp;program=PHD');
  });

  it('the tracker source has its own key', () => {
    expect(rollingQuery({ source: 'tracker' }).queryKey).not.toEqual(
      rollingQuery({ source: 'list', list: 'L1' }).queryKey,
    );
  });
});
