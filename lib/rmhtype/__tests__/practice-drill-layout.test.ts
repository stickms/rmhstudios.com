import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/contract/client', () => ({
  api: vi.fn(async (_contract: unknown, input: unknown) => {
    calls.push(input);
    return { test: { text: 'a' }, layout: 'dvorak' };
  }),
  contractQuery: vi.fn(),
}));

import { buildPracticeDrill } from '@/lib/rmhtype/rmhtype.queries';

// Key statistics are stored per layout, by character, so the worst-keys drill must ask for the layout the runs were
// recorded under, never the server's QWERTY default.
describe('buildPracticeDrill', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('asks the server for the remembered layout', async () => {
    await buildPracticeDrill(20, 'dvorak');
    expect(calls[0]).toEqual({ body: { length: 20, layout: 'dvorak' } });
  });

  it('keeps the old request when no layout is given', async () => {
    await buildPracticeDrill(20);
    expect(calls[0]).toEqual({ body: { length: 20 } });
  });
});
