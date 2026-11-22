// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children }: { to: string; search?: { text: string }; children: React.ReactNode }) => (
    <a href={search ? `${to}?text=${search.text}` : to}>{children}</a>
  ),
}));
vi.mock('@/components/rmhtype/RmhTypeHeader', () => ({ default: () => null }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));

import { TextRuns, TextsList } from '../TextsPage';
import type { TextRunRow, TextSummary } from '@/lib/rmhtype/texts';

const noop = () => undefined;
const handlers = { selectedId: null, onSelect: noop, onEdit: noop, onDelete: noop };

const text = (over: Partial<TextSummary> = {}): TextSummary => ({
  id: 'abc123',
  title: 'My speech',
  bestWpm: 72.5,
  bestAccuracy: 98.2,
  runs: 3,
  lastRunAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
  ...over,
});

describe('TextsList', () => {
  it('shows the empty state with what to do next', () => {
    const html = renderToStaticMarkup(<TextsList texts={[]} {...handlers} />);
    expect(html).toContain('No saved texts yet');
    expect(html).toContain('save a pasted custom test');
    expect(html).not.toContain('<li');
  });

  it('shows each text’s figures, a practise link and its actions', () => {
    const html = renderToStaticMarkup(<TextsList texts={[text()]} {...handlers} />);
    expect(html).toContain('My speech');
    expect(html).toContain('Best 72.5 WPM');
    expect(html).toContain('Accuracy 98.2%');
    expect(html).toContain('Runs 3');
    expect(html).toContain('Last run');
    expect(html).toContain('href="/rmhtype/solo?text=abc123"');
    expect(html).toContain('Edit');
    expect(html).toContain('Delete');
  });

  it('says so for a text that has not been run', () => {
    const html = renderToStaticMarkup(
      <TextsList texts={[text({ bestWpm: null, bestAccuracy: null, runs: 0, lastRunAt: null })]} {...handlers} />,
    );
    expect(html).toContain('No best yet');
    expect(html).toContain('Runs 0');
    expect(html).toContain('Not run yet');
    expect(html).not.toContain('Accuracy');
  });

  it('gives a member-written title its own direction', () => {
    const html = renderToStaticMarkup(<TextsList texts={[text({ title: 'خطاب' })]} {...handlers} />);
    expect(html).toMatch(/<button[^>]*dir="auto"[^>]*>خطاب<\/button>/);
  });
});

describe('TextRuns', () => {
  it('says there are no runs yet', () => {
    expect(renderToStaticMarkup(<TextRuns runs={[]} />)).toContain('No runs yet');
  });

  it('draws one point per run with the table view available', () => {
    const runs: TextRunRow[] = [60, 64, 71].map((wpm, i) => ({
      id: `r${i}`,
      wpm,
      accuracy: 97,
      timeMs: 10_000,
      createdAt: `2026-11-2${i}T12:00:00.000Z`,
    }));
    const html = renderToStaticMarkup(<TextRuns runs={runs} />);
    expect(html).toContain('Your last runs on this text');
    expect(html).toContain('Show as table');
    expect(html).toContain('from 60 to 71');
  });
});

describe('the page source', () => {
  const root = path.resolve(__dirname, '../../..');
  it('renders member text with dir="auto" and uses useConfirm, not native dialogs', () => {
    const source = readFileSync(path.join(root, 'components/rmhtype/TextsPage.tsx'), 'utf8');
    expect(source).toContain('dir="auto"');
    expect(source).toContain('useConfirm');
    expect(source).not.toMatch(/window\.(confirm|prompt)|\balert\(/);
  });
});
