// @vitest-environment node
/**
 * The hub's hand-off state machine (review R6 m11): commit -> everting, fallback
 * -> today's navigation, input ignored while a run is in flight, no double
 * navigation, and the right closing for each way a run can end. The real hub is
 * covered by the slow browser suites; this pins the rules in milliseconds.
 */

import { describe, expect, it, vi } from 'vitest';
import type { EversionOutcome, GlobeStartState } from '@/lib/eversion/types';
import { createHandOff } from './hub-handoff';
import type { HandOffController } from './hub-handoff';

const NODE = { href: '/games' };
const GLOBE = {} as GlobeStartState;

function rig(opts: { eligible?: () => boolean } = {}) {
  const log: string[] = [];
  let settle!: (o: EversionOutcome) => void;
  let reject!: (e: unknown) => void;
  let hooks!: { onCommit(): void; onPopFade(): void };
  const controller: HandOffController<typeof NODE> = {
    isEligible: opts.eligible ?? (() => true),
    start: (_node, _state, _entry, options) => {
      log.push('start');
      hooks = options;
      return new Promise<EversionOutcome>((resolve, rej) => {
        settle = resolve;
        reject = rej;
      });
    },
  };
  const machine = createHandOff<typeof NODE>({
    navigateToday: (n) => log.push(`today:${n.href}`),
    everting: () => log.push('everting'),
    popFade: () => log.push('popFade'),
    closed: (orbIn) => log.push(`closed:${orbIn}`),
    dismiss: () => log.push('dismiss'),
  });
  const confirm = (c: HandOffController<typeof NODE> | null = controller) =>
    machine.confirm(c, NODE, GLOBE, 'release');
  return {
    log,
    machine,
    confirm,
    controller,
    settle: (o: EversionOutcome) => settle(o),
    reject: (e: unknown) => reject(e),
    commit: () => hooks.onCommit(),
    popFade: () => hooks.onPopFade(),
  };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('hub hand-off', () => {
  it('no controller, or an ineligible one, is today and nothing else', () => {
    const none = rig();
    none.confirm(null);
    expect(none.log).toEqual(['today:/games']);
    expect(none.machine.busy()).toBe(false);

    const no = rig({ eligible: () => false });
    no.confirm();
    expect(no.log).toEqual(['today:/games']);
    expect(no.machine.busy()).toBe(false);
  });

  it('is busy from confirm to settle; commit shows everting; done closes with the orb in', async () => {
    const r = rig();
    r.confirm();
    expect(r.machine.busy()).toBe(true);
    expect(r.log).toEqual(['start']); // nothing changes on screen before the commit
    r.commit();
    r.popFade();
    r.settle({ fallback: null, end: 'done' });
    await flush();
    expect(r.log).toEqual(['start', 'everting', 'popFade', 'closed:true']);
    expect(r.machine.busy()).toBe(false);
  });

  it('a fallback navigates today (and only then clears busy): no everting, no flash', async () => {
    const r = rig();
    r.confirm();
    r.settle({ fallback: 'before-missing' });
    await flush();
    expect(r.log).toEqual(['start', 'today:/games']);
    expect(r.machine.busy()).toBe(false);
  });

  it('a second confirm while one is in flight is ignored, even if eligibility flipped (no double navigation)', async () => {
    let eligible = true;
    const r = rig({ eligible: () => eligible });
    r.confirm();
    eligible = false; // the host dropped to 'failed' / reduced motion was toggled mid-run
    r.confirm();
    r.confirm(null);
    expect(r.log).toEqual(['start']);
    r.commit();
    r.settle({ fallback: null, end: 'done' });
    await flush();
    expect(r.log.filter((l) => l.startsWith('today'))).toEqual([]);
  });

  it('a busy-fallback is today, once', async () => {
    const r = rig();
    r.confirm();
    r.settle({ fallback: 'busy' });
    await flush();
    expect(r.log.filter((l) => l.startsWith('today'))).toHaveLength(1);
  });

  it('Back/Forward while priming only closes: the router already moved', async () => {
    const r = rig();
    r.confirm();
    r.settle({ fallback: 'traversal' });
    await flush();
    expect(r.log).toEqual(['start', 'dismiss']);
    expect(r.machine.busy()).toBe(false);
  });

  it('an aborted or context-lost run closes with the ordinary orb fade, no navigation', async () => {
    for (const end of ['abort', 'context-lost'] as const) {
      const r = rig();
      r.confirm();
      r.commit();
      r.settle({ fallback: null, end });
      await flush();
      expect(r.log).toEqual(['start', 'everting', 'closed:false']);
    }
  });

  it('a controller whose start rejects still gets the visitor where they asked', async () => {
    const r = rig();
    r.confirm();
    r.reject(new Error('boom'));
    await flush();
    expect(r.log).toEqual(['start', 'today:/games']);
    expect(r.machine.busy()).toBe(false);
  });

  it('can hand off again after one settled', async () => {
    const r = rig();
    r.confirm();
    r.settle({ fallback: null, end: 'done' });
    await flush();
    const start = vi.fn(() => new Promise<EversionOutcome>(() => {}));
    r.confirm({ isEligible: () => true, start });
    expect(start).toHaveBeenCalledTimes(1);
    expect(r.machine.busy()).toBe(true);
  });
});
