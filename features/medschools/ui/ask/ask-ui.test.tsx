import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/session/session-context', () => ({
  useSession: () => ({ data: h.session, isPending: false }),
}));
vi.mock('@/components/errors/useRefusalText', () => ({
  useRefusalText: () => Object.assign((e: unknown) => String(e), { maybe: (e: unknown) => String(e) }),
}));

import { AskPanel, signInReturnPath } from './AskPanel';
import { AnswerView } from './AnswerView';
import { AskForm } from './AskForm';
import { suggestionsFor } from './suggestions';
import { createAskRun, type AskSnapshot } from './askRun';
import { askStatusQuery } from '../../medschools.queries';
import type { ChanceDto, MedAskRes } from '../../medschools.contract';

const res = (over: Partial<MedAskRes> = {}): MedAskRes => ({
  status: 'answered',
  segments: [
    { text: 'Duke has 412 reported interview events.', cites: ['f1'] },
    { text: 'The MCAT median is 511.', cites: ['f2', 'f1'] },
  ],
  citations: [
    {
      ref: 'f1',
      label: 'Reported events',
      sourceName: 'CycleTrack',
      schoolSlug: 'duke',
      updatedAt: '2026-11-21T04:00:00.000Z',
      href: '/rmh-medschool/duke?tab=activity',
      sourceHref: 'https://example.test/duke',
    },
    {
      ref: 'f2',
      label: 'Interview profile',
      sourceName: 'Admit.org',
      schoolSlug: 'duke',
      updatedAt: null,
      href: '/rmh-medschool/duke?tab=interviews',
      sourceHref: null,
    },
  ],
  notice: null,
  decline: null,
  schools: [{ slug: 'duke', shortName: 'Duke' }],
  cycleYear: 2027,
  mine: null,
  remainingToday: 12,
  dailyCap: 15,
  ...over,
});

function panel(
  props: Parameters<typeof AskPanel>[0] = {},
  status = { configured: true, remainingToday: 12, dailyCap: 15 },
) {
  const qc = new QueryClient();
  qc.setQueryData(askStatusQuery().queryKey, status);
  // Numbers sit in bidi isolates (for `ar`); the text a reader sees has none.
  return renderToString(
    <QueryClientProvider client={qc}>
      <AskPanel {...props} />
    </QueryClientProvider>,
  ).replace(/[\u2066-\u2069]/g, '');
}

describe('AskPanel', () => {
  it('signed out: the sign-in prompt, no field', () => {
    h.session = null;
    const html = panel();
    expect(html).toContain('Sign in to ask a question');
    expect(html).not.toContain('<textarea');
  });

  it('signed in, idle: field, counter, one primary Ask, privacy line, suggestions', () => {
    h.session = { user: { id: 'u1' } };
    const html = panel();
    expect(html).toContain('<textarea');
    expect(html).toContain('maxLength="400"');
    expect(html).toContain('12 of 15 questions left today');
    expect(html).toContain('Your question is sent to our AI provider to write the answer. RMH does not keep it.');
    expect(html.match(/bg-site-accent/g)?.length).toBe(1);
    expect(html).toContain('>Ask</span>');
    // Suggestion rows fill, never submit.
    expect(html.match(/type="button"/g)?.length).toBe(suggestionsFor(false).length);
  });

  it('a pinned panel offers three suggestions and a school heading', () => {
    h.session = { user: { id: 'u1' } };
    expect(suggestionsFor(true)).toHaveLength(3);
    expect(suggestionsFor(false)).toHaveLength(5);
    const html = panel({ slug: 'duke', schoolName: 'Duke University', heading: 'section' });
    expect(html).toContain('Ask about Duke University');
  });

  it('the cap reached disables Ask', () => {
    h.session = { user: { id: 'u1' } };
    const html = panel(
      { initialQuestion: 'What is the median?' },
      { configured: true, remainingToday: 0, dailyCap: 15 },
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*Ask/);
    expect(html).toContain('0 of 15 questions left today');
  });

  it('an unconfigured site says so', () => {
    h.session = { user: { id: 'u1' } };
    expect(panel({}, { configured: false, remainingToday: 0, dailyCap: 15 })).toContain('Questions are not available');
  });
});

describe('AskForm busy', () => {
  it('pending: busy button, Cancel, nothing else submits', () => {
    const html = renderToString(
      <AskForm
        question="x question"
        onQuestion={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        pending
        configured
        remaining={5}
        cap={15}
        pinned={false}
      />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Cancel');
    expect(html).toContain('disabled');
  });
});

describe('AnswerView', () => {
  it('rows with source numbers, citations with links and dates', () => {
    const html = renderToString(<AnswerView res={res()} />);
    expect(html).toContain('Duke has 412 reported interview events.');
    expect(html).toContain('href="#cite-1"');
    expect(html).toContain('href="#cite-2"');
    expect(html).toContain('id="cite-1"');
    expect(html).toContain('pointer-coarse:min-h-11');
    expect(html).toContain('source refreshed');
    expect(html).toContain('update time unknown');
    expect(html).toContain('href="/rmh-medschool/duke?tab=activity"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Based on Duke');
  });

  it('the notice, partial', () => {
    const html = renderToString(<AnswerView res={res({ status: 'partial', notice: 'removed-ungrounded' })} />);
    expect(html).toContain('Some statements were removed because their figures could not be matched to the data.');
  });

  it('empty states', () => {
    const none = { segments: [], citations: [], schools: [], cycleYear: null };
    expect(renderToString(<AnswerView res={res({ ...none, status: 'no-data', notice: 'thin' })} />)).toContain(
      'RMH has no data for this question.',
    );
    expect(
      renderToString(<AnswerView res={res({ ...none, status: 'declined', decline: 'out-of-scope' })} />),
    ).toContain('I cannot estimate your chance of admission.');
    expect(
      renderToString(<AnswerView res={res({ ...none, status: 'no-school', decline: 'name-a-school' })} />),
    ).toContain('Name a school, or ask from its page.');
  });

  it('mine: [] links to the tracker, also when thin', () => {
    const html = renderToString(
      <AnswerView res={res({ segments: [], citations: [], status: 'no-data', notice: 'thin', mine: [] })} />,
    );
    expect(html).toContain('href="/rmh-medschool/tracker"');
    expect(html).not.toContain('RMH has no data for this question.');
  });

  it('mine rows go through ChanceLine', () => {
    const chance: ChanceDto = {
      applicationId: 'a1',
      school: { slug: 'duke', shortName: 'Duke', name: 'Duke University', active: true },
      program: 'REG',
      status: 'thin',
      completeOn: null,
      invitedOn: null,
      asOf: null,
      basis: null,
      points: [],
    };
    const html = renderToString(<AnswerView res={res({ mine: [chance], notice: 'thin' })} />);
    expect(html).toContain('data-chance="thin"');
    expect(html).toContain('Your estimate');
  });
});

describe('the sign-in return path', () => {
  it('returns to the school panel from a school page and keeps ?q= on the Ask page', () => {
    expect(signInReturnPath('duke', 'ignored')).toBe('/rmh-medschool/duke#ask');
    expect(signInReturnPath(undefined, '')).toBe('/rmh-medschool/ask');
    expect(signInReturnPath(undefined, ' Duke MCAT? & more ')).toBe('/rmh-medschool/ask?q=Duke%20MCAT%3F%20%26%20more');
  });
});

describe('notices for the member-reported text and an unavailable estimate', () => {
  it('names an estimate that could not be loaded, apart from an empty one', () => {
    const html = renderToString(<AnswerView res={res({ mine: null, notice: 'mine-unavailable' })} />);
    expect(html).toContain('Your own estimate could not be loaded');
  });
  it('says interview text is member-reported only when an answer cites it', () => {
    expect(renderToString(<AnswerView res={res()} />)).not.toContain('reported by members');
    const cited = res();
    cited.citations[1] = { ...cited.citations[1]!, label: 'Interview question' };
    expect(renderToString(<AnswerView res={cited} />)).toContain('reported by members');
  });
});

describe('askRun', () => {
  const deferred = () => {
    let resolve!: (r: MedAskRes) => void;
    let reject!: (e: unknown) => void;
    const p = new Promise<MedAskRes>((a, b) => {
      resolve = a;
      reject = b;
    });
    return { p, resolve, reject };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('cancel drops the answer and a second submit is ignored while pending', async () => {
    const d = deferred();
    const call = vi.fn((_b: unknown, _s: AbortSignal) => d.p);
    const seen: AskSnapshot[] = [];
    const run = createAskRun(call, (s) => seen.push(s));
    run.ask({ question: 'one' });
    run.ask({ question: 'two' });
    expect(call).toHaveBeenCalledTimes(1);
    run.cancel();
    d.resolve(res());
    await flush();
    expect(call.mock.calls[0]?.[1].aborted).toBe(true);
    expect(seen.map((s) => s.state)).toEqual(['pending', 'idle']);
  });

  it('reports an answer and an error', async () => {
    const seen: AskSnapshot[] = [];
    createAskRun(
      async () => res(),
      (s) => seen.push(s),
    ).ask({ question: 'q' });
    await flush();
    expect(seen.at(-1)?.state).toBe('done');
    const bad: AskSnapshot[] = [];
    createAskRun(
      async () => Promise.reject(new Error('x')),
      (s) => bad.push(s),
    ).ask({ question: 'q' });
    await flush();
    expect(bad.at(-1)?.state).toBe('error');
  });
});

describe('Steel and i18n on the new files', () => {
  const files = ['AskPanel.tsx', 'AskForm.tsx', 'AnswerView.tsx', 'Citations.tsx', 'MyChance.tsx', 'useAsk.ts'];
  it('no banned classes, no raw fetch, no comment before t()', () => {
    for (const f of files) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/shadow-|bg-gradient|backdrop-|transition-all|rounded-(xl|2xl|full|lg|md)|\bfetch\(/);
      expect(src, f).not.toMatch(/\{\/\*[^]*?\*\/\}\s*\n\s*[^\n]*\bt\(/);
    }
  });
});
