import { describe, expect, it } from 'vitest';
import { createTicketHolder, type RelayTicket } from '../relay-ticket';

const t = (n: string): RelayTicket => ({ url: 'wss://x/rmhos-net/', ticket: n });

function deferred() {
  let resolve!: (v: RelayTicket | null) => void;
  const promise = new Promise<RelayTicket | null>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createTicketHolder', () => {
  it('a cancelled run whose fetch resolves late never overwrites the live machine ticket', async () => {
    const holder = createTicketHolder();
    const slow = deferred();
    const fast = deferred();
    const first = holder.begin(() => slow.promise); // the run that gets cancelled (StrictMode, fast remount)
    const second = holder.begin(() => fast.promise); // the run that stays
    const f1 = first.fetch();
    const f2 = second.fetch();
    fast.resolve(t('newer'));
    await f2;
    expect(second.publish()).toBe(true);
    expect(holder.current?.ticket).toBe('newer');
    slow.resolve(t('older')); // resolves after the live run published
    await f1;
    expect(first.publish()).toBe(false); // superseded: nothing is published
    expect(holder.current?.ticket).toBe('newer');
  });

  it('publishes nothing until the run says its machine exists', async () => {
    const holder = createTicketHolder();
    const run = holder.begin(async () => t('a'));
    await run.fetch();
    expect(holder.current).toBeNull();
    run.publish();
    expect(holder.current?.ticket).toBe('a');
  });

  it('release forgets only the newest run\'s ticket', async () => {
    const holder = createTicketHolder();
    const a = holder.begin(async () => t('a'));
    await a.fetch();
    a.publish();
    const b = holder.begin(async () => t('b'));
    a.release(); // a is no longer newest: leaves the holder alone
    expect(holder.current?.ticket).toBe('a');
    await b.fetch();
    b.publish();
    b.release();
    expect(holder.current).toBeNull();
  });
});
