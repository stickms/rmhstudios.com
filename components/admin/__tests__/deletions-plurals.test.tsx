/**
 * s14-20 (d): /admin/deletions says "1 account" for one (count plurals), and "No attempt failed yet" is muted, not
 * red. No DOM: the page renders to markup with the list preloaded into the query cache.
 */
import { describe, expect, it, vi } from 'vitest';

// A stand-in for i18next that applies the English `_one` form when `count` is 1, as the real runtime does.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; defaultValue_one?: string; count?: number; [k: string]: unknown }) =>
      (o.count === 1 && o.defaultValue_one ? o.defaultValue_one : o.defaultValue).replace(
        /\{\{(\w+)\}\}/g,
        (_m, name: string) => String(o[name]),
      ),
    i18n: { language: 'en' },
  }),
}));
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { DeletionsAdmin } from '@/components/admin/DeletionsAdmin';
import { listAdminDeletionsApi } from '@/lib/admin/deletions.contract';
import type { AdminDeletions, OverdueDeletionRow, WaitingDeletionRow } from '@/lib/admin/deletions';

const none = { keys: 0, webhooks: 0, subscriptions: 0 };
const waiting = (i: number): WaitingDeletionRow => ({
  userId: `w${i}`,
  handle: `waiting${i}`,
  requestedAt: '2026-11-01T00:00:00.000Z',
  dueAt: '2026-12-01T00:00:00.000Z',
  held: none,
  billing: 'none',
});
const overdue = (over: Partial<OverdueDeletionRow> = {}): OverdueDeletionRow => ({
  ...waiting(9),
  userId: 'o1',
  handle: 'late',
  attempts: 0,
  lastErrorName: null,
  lastAttemptAt: null,
  running: false,
  ...over,
});

function page(data: Partial<AdminDeletions>): string {
  const client = new QueryClient();
  const full: AdminDeletions = {
    waiting: [],
    waitingTotal: 0,
    overdue: [],
    overdueTotal: 0,
    finished: [],
    finishedTotal: 0,
    ...data,
  };
  client.setQueryData([listAdminDeletionsApi.path], full);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <DeletionsAdmin />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

describe('the deletions page counts', () => {
  it('says "1 account" for one waiting and one overdue', () => {
    const html = page({ waiting: [waiting(1)], waitingTotal: 1, overdue: [overdue()], overdueTotal: 1 });
    expect(html).toContain('1 account in its grace period');
    expect(html).toContain('1 account due more than 24 hours ago and not erased');
    expect(html).not.toContain('1 accounts');
  });

  it('says "1 erasure" for one finished, in the count and the chart summary', () => {
    const html = page({ finished: [{ day: '2026-11-20', count: 1 }], finishedTotal: 1 });
    expect(html).toContain('1 erasure in the last 30 days');
    expect(html).toContain('1 erasure finished in the last 30 days, per day');
    expect(html).not.toContain('1 erasures');
  });

  it('keeps the plural for zero and for many', () => {
    const html = page({ waitingTotal: 0, overdueTotal: 3 });
    expect(html).toContain('0 accounts in their grace period');
    expect(html).toContain('3 accounts due more than 24 hours ago and not erased');
  });
});

describe('the last-error cell', () => {
  it('is muted when no attempt failed yet', () => {
    const html = page({ overdue: [overdue()], overdueTotal: 1 });
    const cell = html.slice(html.lastIndexOf('<td', html.indexOf('No attempt failed yet')));
    expect(cell.slice(0, cell.indexOf('>'))).toContain('text-site-text-muted');
    expect(cell.slice(0, cell.indexOf('>'))).not.toContain('text-site-danger');
  });

  it('stays danger for a real error name', () => {
    const html = page({
      overdue: [overdue({ attempts: 2, lastErrorName: 'PrismaClientKnownRequestError' })],
      overdueTotal: 1,
    });
    const cell = html.slice(html.lastIndexOf('<td', html.indexOf('PrismaClientKnownRequestError')));
    expect(cell.slice(0, cell.indexOf('>'))).toContain('text-site-danger');
  });
});
