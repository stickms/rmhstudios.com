import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: { defaultValue: string; [k: string]: unknown }) =>
      (o.count === 1 && typeof o.defaultValue_one === 'string' ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => String(o[k] ?? ''),
      ),
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
vi.mock('@/components/feed/PageLayout', () => ({
  PageLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

import { GENERAL_QUESTIONS } from '../../engine/general-questions';
import { askStatusQuery } from '../../medschools.queries';
import { PracticePage } from '../PracticePage';
import { FollowupsSection } from './FollowupsSection';
import { PracticePanel } from './PracticePanel';
import { PracticeTimer } from './PracticeTimer';

const wrap = (node: ReactNode, seed?: (qc: QueryClient) => void) => {
  const qc = new QueryClient();
  seed?.(qc);
  return renderToString(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

describe('PracticeTimer', () => {
  it('starts at 2:00 with the three lengths, Start the ink button and Reset disabled', () => {
    const html = wrap(<PracticeTimer resetKey="a" />);
    expect(html).toContain('role="timer"');
    expect(html).toContain('2:00');
    for (const l of ['1 minute', '2 minutes', '3 minutes']) expect(html).toContain(l);
    expect(html).toContain('Start');
    expect(html).toContain('Reset');
    expect(html).not.toContain('Time is up.');
  });
});

describe('PracticePanel', () => {
  const qs = [
    { key: 'a', text: 'First question?' },
    { key: 'b', text: 'Second question?' },
  ];
  it('offers random and next, and waits for a pick', () => {
    const html = wrap(<PracticePanel questions={qs} />);
    expect(html).toContain('Random question');
    expect(html).toContain('Next question');
    expect(html).toContain('Pick a question to start.');
    expect(html).not.toContain('role="timer"');
  });
  it('renders nothing for no questions', () => {
    expect(wrap(<PracticePanel questions={[]} />)).toBe('');
  });
});

describe('FollowupsSection', () => {
  it('signed out sends nothing and says to sign in', () => {
    h.session = null;
    const html = wrap(<FollowupsSection question="Why medicine?" notes="" />);
    expect(html).toContain('Sign in to get follow-up questions.');
    expect(html).not.toContain('Suggest follow-ups');
  });
  it('signed in shows the button and the questions left, and says nothing is stored', () => {
    h.session = { user: { id: 'u1' } };
    const html = wrap(<FollowupsSection question="Why medicine?" notes="" />, (qc) =>
      qc.setQueryData(askStatusQuery().queryKey, {
        configured: true,
        tier: 'free',
        remainingToday: 7,
        dailyCap: 25,
        thinkingAvailable: false,
      }),
    );
    expect(html).toContain('Suggest follow-ups');
    expect(html).toContain('7 questions left today');
    expect(html).toContain('are not stored');
  });
});

describe('PracticePage', () => {
  it('lists the REG questions first, with the program toggle, and works signed out', () => {
    h.session = null;
    const html = wrap(<PracticePage />);
    expect(html).toContain('Interview practice');
    expect(html).toContain('MD or DO');
    expect(html).toContain('MD-PhD or DO-PhD');
    for (const q of GENERAL_QUESTIONS.filter((x) => x.program === 'REG'))
      expect(html).toContain(q.text.replace(/’/g, '’'));
    expect(html).not.toContain('Why an MD-PhD and not just one of the two?');
  });
  it('is a thin noindex route', () => {
    const src = readFileSync('app/routes/rmh-medschool/practice.tsx', 'utf8');
    expect(src).toContain('noIndex: true');
    expect(src).not.toMatch(/loader:|validateSearch:/);
  });
});
