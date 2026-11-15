import { describe, expect, it, vi } from 'vitest';
import { accountChange, leaveAccount } from '../session-loss';

describe('accountChange', () => {
  it.each([
    ['same account', 'u1', 'u1', false, 'none'],
    ['signed out in another tab', null, 'u1', false, 'follow'],
    ['another account signed in', 'u2', 'u1', false, 'follow'],
    ['session still being asked: no user yet is not a sign-out', null, 'u1', true, 'none'],
    ['the first user arrives after a pending start', 'u1', null, true, 'follow'],
    ['nothing before, nothing now', null, null, false, 'none'],
  ] as const)('%s', (_n, user, machine, pending, want) => {
    expect(accountChange(user, machine, pending)).toBe(want);
  });
});

describe('leaveAccount', () => {
  it('saves for the old account first, and hands over only after the save', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const runner = {
      saveBeforeLeaving: vi.fn(async (ms: number) => {
        order.push(`save ${ms}`);
        await new Promise<void>((r) => (finish = r));
        order.push('saved');
        return true;
      }),
    };
    const done = leaveAccount(runner, 15_000, () => false, () => order.push('machine goes'));
    await Promise.resolve();
    expect(order).toEqual(['save 15000']); // the machine is still up while it saves
    finish();
    expect(await done).toEqual({ saved: true });
    expect(order).toEqual(['save 15000', 'saved', 'machine goes']);
  });

  it('a save that fails or throws still lets the machine go', async () => {
    const handOver = vi.fn();
    expect(await leaveAccount({ saveBeforeLeaving: async () => false }, 1, () => false, handOver)).toEqual({ saved: false });
    expect(await leaveAccount({ saveBeforeLeaving: async () => Promise.reject(new Error('x')) }, 1, () => false, handOver)).toEqual({ saved: false });
    expect(handOver).toHaveBeenCalledTimes(2);
  });

  it('with no machine there is nothing to save', async () => {
    const handOver = vi.fn();
    expect(await leaveAccount(null, 1, () => false, handOver)).toEqual({ saved: null });
    expect(handOver).toHaveBeenCalled();
  });

  it('a newer change of account supersedes it', async () => {
    const handOver = vi.fn();
    await leaveAccount({ saveBeforeLeaving: async () => true }, 1, () => true, handOver);
    expect(handOver).not.toHaveBeenCalled();
  });
});
