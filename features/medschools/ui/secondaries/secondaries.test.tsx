import type { ReactNode } from 'react';
import { globSync, readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  session: null as null | { user: { id: string } },
}));

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
  Link: ({ to, children, className, id }: { to: string; children: ReactNode; className?: string; id?: string }) => (
    <a href={to} className={className} id={id}>
      {children}
    </a>
  ),
  useNavigate: () => () => undefined,
  useSearch: () => h.search,
  useParams: () => ({ slug: 'duke' }),
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('./../SaveToList', () => ({ SaveToList: () => null }));
vi.mock('@/components/feed/PageLayout', () => ({
  PageLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

import { SchoolPage } from '../SchoolPage';
import { schoolQuery, secondariesQuery } from '../../medschools.queries';
import { THEME_IDS } from '../../engine/secondaries/theme-ids';
import type { MedSchoolDetailDto, MedSchoolSecondariesRes, MedSecondaryPromptDto } from '../../medschools.contract';
import { SecondaryPromptRow } from './SecondaryPromptRow';
import { useSecondaryLabels, type SecondaryLabels } from './labels';

const detail: MedSchoolDetailDto = {
  school: {
    slug: 'duke',
    name: 'Duke University School of Medicine',
    shortName: 'Duke',
    degree: 'MD',
    city: 'Durham',
    state: 'NC',
    website: null,
    interviewFormat: null,
    interviewType: null,
  },
  cycleYear: 2027,
  programsWithData: ['REG'],
  links: [],
  stats: [],
  profiles: [],
  questions: [],
};

const prompt = (o: Partial<MedSecondaryPromptDto> = {}): MedSecondaryPromptDto => ({
  id: 'p1',
  text: 'Describe a challenge you faced and how you responded to it.',
  limit: { kind: 'WORDS', value: 250 },
  optional: false,
  themes: ['challenge'],
  status: 'same',
  previousText: null,
  cycles: [2024, 2025, 2026, 2028],
  sources: ['ADMIT', 'SDN'],
  lastCheckedAt: '2026-11-20T05:35:00.000Z',
  ...o,
});

const res = (o: Partial<MedSchoolSecondariesRes> = {}): MedSchoolSecondariesRes => ({
  cycleYear: 2027,
  groups: [{ program: 'REG', state: 'current', shownCycle: 2027, comparedWith: 2026, prompts: [prompt()] }],
  sources: [
    {
      source: 'ADMIT',
      url: 'https://med.admit.org/secondary-essays/duke',
      checkedAt: '2026-11-20T05:35:00.000Z',
      status: 'OK',
    },
    { source: 'SCHOOL', url: 'https://med.duke.edu/secondary', checkedAt: '2026-11-23T00:00:00.000Z', status: 'OK' },
  ],
  admissions: [],
  turnaround: [],
  ...o,
});

function renderRow(p: MedSecondaryPromptDto, showStatus = true): string {
  function Row() {
    const labels: SecondaryLabels = useSecondaryLabels();
    return (
      <ul>
        <SecondaryPromptRow prompt={p} labels={labels} schoolName="Duke" showStatus={showStatus} />
      </ul>
    );
  }
  return renderToString(<Row />);
}

function renderPage(data: MedSchoolSecondariesRes | null, program: 'ALL' | 'PHD' = 'ALL'): string {
  const qc = new QueryClient();
  qc.setQueryData(schoolQuery('duke').queryKey, detail);
  if (data) qc.setQueryData(secondariesQuery('duke', { program }).queryKey, data);
  h.search = { tab: 'secondaries', ...(program === 'PHD' ? { program: 'PHD' } : {}) };
  return renderToString(
    <QueryClientProvider client={qc}>
      <SchoolPage />
    </QueryClientProvider>,
  );
}

describe('SecondaryPromptRow', () => {
  it('renders the text, the limit and the cycle range with en dashes (isolated, left to right)', () => {
    const html = renderRow(prompt());
    expect(html).toContain('Describe a challenge you faced and how you responded to it.');
    expect(html).toContain('250 words');
    expect(html).toContain('Seen in');
    // A run collapses, a gap starts a new range, each cycle is a left-to-right isolate.
    expect(html).toContain('⁦2023–2024⁩ to ⁦2025–2026⁩');
    expect(html).toContain('⁦2027–2028⁩');
    expect(html).toContain('Admit.org, Student Doctor Network, checked Nov 20, 2026');
  });

  it('writes character limits with a separator and a single word in the singular', () => {
    expect(renderRow(prompt({ limit: { kind: 'CHARS', value: 1500 } }))).toContain('1,500 characters');
    expect(renderRow(prompt({ limit: { kind: 'WORDS', value: 1 } }))).toContain('1 word<');
  });

  it('says Optional only when the prompt is', () => {
    expect(renderRow(prompt({ optional: true }))).toContain('Optional');
    expect(renderRow(prompt())).not.toContain('Optional');
  });

  it('names each year-over-year status in words and none for null', () => {
    const word: Record<string, string> = {
      same: 'Same as last cycle',
      reworded: 'Reworded',
      new: 'New',
      gone: 'Not seen this cycle',
    };
    for (const [status, text] of Object.entries(word))
      expect(renderRow(prompt({ status: status as MedSecondaryPromptDto['status'] }))).toContain(text);
    const none = renderRow(prompt({ status: null }));
    for (const text of Object.values(word)) expect(none).not.toContain(text);
    expect(renderRow(prompt(), false)).not.toContain('Same as last cycle');
  });

  it("shows last cycle's wording only for a reworded prompt", () => {
    const reworded = renderRow(prompt({ status: 'reworded', previousText: 'An earlier wording.' }));
    expect(reworded).toContain('Last cycle: An earlier wording.');
    expect(renderRow(prompt({ status: 'same', previousText: 'An earlier wording.' }))).not.toContain('Last cycle:');
  });
});

describe('labels', () => {
  it('every theme id has a distinct, non-empty label', () => {
    let labels: SecondaryLabels | null = null;
    function Probe() {
      labels = useSecondaryLabels();
      return null;
    }
    renderToString(<Probe />);
    const seen = THEME_IDS.map((id) => (labels as SecondaryLabels | null)?.theme(id) ?? '');
    for (const s of seen) expect(s).not.toBe('');
    expect(new Set(seen).size).toBe(THEME_IDS.length);
  });
});

describe('Secondaries tab on the school page', () => {
  it('server-renders the prompts with scripting off, split by program, with the source lines', () => {
    const html = renderPage(
      res({
        groups: [
          { program: 'REG', state: 'current', shownCycle: 2027, comparedWith: 2026, prompts: [prompt()] },
          {
            program: 'PHD',
            state: 'current',
            shownCycle: 2027,
            comparedWith: null,
            prompts: [prompt({ id: 'p2', text: 'Why do you want an MD-PhD?', status: null })],
          },
        ],
      }),
    );
    expect(html).toContain('Describe a challenge you faced and how you responded to it.');
    expect(html).toContain('Regular prompts');
    expect(html).toContain('MD-PhD prompts');
    expect(html).toContain('These are in addition to or instead of the regular prompts.');
    expect(html).toContain('Compared with the \u20662025\u20132026\u2069 cycle.');
    expect(html).toContain('Source: Admit.org, checked Nov 20, 2026');
    expect(html).toContain('Source: Duke website, checked Nov 23, 2026');
    // The sources are icons at the end of each group's heading: the deep link rides on the button, the attribution is text.
    expect(html).toContain('data-href="https://med.duke.edu/secondary"');
  });

  it('a not-yet group says so, and shows no status words', () => {
    const html = renderPage(
      res({
        groups: [
          {
            program: 'REG',
            state: 'not-yet',
            shownCycle: 2026,
            comparedWith: null,
            prompts: [prompt({ status: 'last-cycle' })],
          },
        ],
      }),
    );
    expect(html).toContain('This cycle&#x27;s prompts are not out yet.');
    expect(html).not.toContain('From last cycle');
    expect(html).not.toContain('Not seen this cycle');
  });

  it('a first year of data shows no status words and no comparison line', () => {
    const html = renderPage(
      res({
        groups: [
          {
            program: 'REG',
            state: 'current',
            shownCycle: 2027,
            comparedWith: null,
            prompts: [prompt({ status: null })],
          },
        ],
      }),
    );
    expect(html).not.toContain('Same as last cycle');
    expect(html).not.toContain('Compared with');
  });

  it('an empty school shows the empty state, and still the sources that were checked', () => {
    const html = renderPage(
      res({
        groups: [],
        sources: [{ source: 'ADMIT', url: null, checkedAt: '2026-11-20T05:35:00.000Z', status: 'EMPTY' }],
      }),
    );
    expect(html).toContain('No secondary prompts on file for this school yet.');
    expect(html).toContain('Source: Admit.org, checked Nov 20, 2026, nothing found');
  });

  it('shows rolling admissions or set dates with the quote and a dated source link', () => {
    const html = renderPage(
      res({
        admissions: [
          {
            program: 'REG',
            rolling: true,
            evidence: 'Admissions decisions are made on a rolling basis.',
            url: 'https://med.duke.edu/admissions',
            checkedOn: '2026-11-23',
          },
          {
            program: 'PHD',
            rolling: false,
            evidence: 'MD-PhD decisions are sent on March 1.',
            url: 'https://med.duke.edu/admissions',
            checkedOn: '2026-11-23',
          },
        ],
      }),
    );
    expect(html).toContain('Rolling admissions');
    expect(html).toContain('Decisions on set dates');
    expect(html).toContain('“Admissions decisions are made on a rolling basis.”');
    expect(html).toContain('Source: Duke admissions page, checked Nov 23, 2026');
  });

  it('shows the turnaround with its member count and date', () => {
    const html = renderPage(
      res({
        turnaround: [{ program: 'REG', members: 24, p25Days: 5, medianDays: 9, p75Days: 14, asOf: '2026-11-22' }],
      }),
    );
    expect(html).toContain('a median of 9 days');
    expect(html).toContain('5 to 14 days, from 24 members who shared. Updated Nov 22, 2026.');
  });

  it('shows a skeleton while loading, and no input of any kind', () => {
    const loading = renderPage(null);
    expect(loading).toContain('aria-hidden="true"');
    for (const html of [loading, renderPage(res())]) expect(html).not.toMatch(/<(input|textarea)\b|contenteditable/);
  });
});

describe('Steel, i18n and the client bundle', () => {
  const files = ['../SecondariesTab.tsx', './SecondaryPromptRow.tsx', './labels.tsx', './useCycleRangeText.ts'].map(
    (f) => [f, readFileSync(new URL(f, import.meta.url), 'utf8')] as const,
  );

  it('is flat: no rounded box, shadow, gradient or raw palette class', () => {
    for (const [f, src] of files) {
      expect(src, f).not.toMatch(
        /rounded-|shadow|gradient|bg-(red|blue|green|gray|slate|zinc|amber)|text-(red|blue|green)-/,
      );
    }
  });

  it('imports only the pure, client-safe parts of the secondaries engine', () => {
    for (const [f, src] of files) {
      const engine = [...src.matchAll(/engine\/secondaries\/([\w-]+)/g)].map((m) => m[1]);
      for (const name of engine) expect(['cycle-ranges', 'theme-ids'], `${f}: ${name}`).toContain(name);
    }
    expect(globSync('features/medschools/ui/secondaries/*.tsx').length).toBeGreaterThan(0);
  });
});
