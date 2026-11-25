/**
 * The one-off "Export calendar" download writes no application notes (s13-09): the file is stored by whatever opens it.
 * Prisma and auth are mocked; the handler is driven directly.
 */
import { describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ladderApplication: {
      findMany: vi.fn(async () => [
        {
          id: 'app1',
          userId: 'u1',
          notes: 'secret-note-text',
          contactEmail: 'private@contact.example',
          referralName: 'Referrer Person',
          followUpDate: new Date('2026-03-15T12:00:00Z'),
          interviewDates: [new Date('2026-03-10T14:00:00Z')],
          job: {
            id: 'job1',
            title: 'Analyst',
            originalPostingUrl: 'https://jobs.example/analyst',
            applicationDeadline: new Date('2026-03-20T12:00:00Z'),
            company: { name: 'Acme' },
          },
        },
      ]),
    },
  },
}));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (config: unknown) => ({ options: config }) }));

import { route } from '@/lib/rmhladder/api/rmhladder.calendar.server';

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

describe('the RMHLadder calendar download', () => {
  it('has the events and none of the private application fields', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's' } });
    const res = await handlersOf<H>(route).GET!({
      params: {},
      request: new Request('https://x.test/api/rmhladder/calendar', {
        headers: { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': '1.2.3.4' },
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('SUMMARY:Follow up: Analyst at Acme');
    expect(text).toContain('SUMMARY:Interview: Analyst at Acme');
    expect(text).toContain('RMHLadder follow-up reminder');
    for (const secret of ['secret-note-text', 'private@contact.example', 'Referrer Person']) {
      expect(text, secret).not.toContain(secret);
    }
  });
});
