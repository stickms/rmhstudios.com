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
  let hooks!: { onCommit(): void; globe?: () => GlobeStartState };
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
    closed: () => log.push('closed'),
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
    hooks: () => hooks,
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

  it('is busy from confirm to settle; commit shows everting; done closes (the orb fades in the ordinary way)', async () => {
    const r = rig();
    r.confirm();
    expect(r.machine.busy()).toBe(true);
    expect(r.log).toEqual(['start']); // nothing changes on screen before the commit
    r.commit();
    r.settle({ fallback: null, end: 'done' });
    await flush();
    expect(r.log).toEqual(['start', 'everting', 'closed']);
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
      expect(r.log).toEqual(['start', 'everting', 'closed']);
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

describe('hub hand-off before the controller has loaded (amended 2026-10-18)', () => {
  it('is busy while it waits, then runs the effect the moment the controller arrives', async () => {
    const r = rig();
    let arrive!: (c: HandOffController<typeof NODE> | null) => void;
    r.machine.confirmWhenReady(
      new Promise((resolve) => (arrive = resolve)),
      NODE,
      GLOBE,
      'release',
    );
    expect(r.machine.busy()).toBe(true);
    expect(r.log).toEqual([]); // no navigation while waiting
    r.confirm(); // a second confirm meanwhile is nothing
    expect(r.log).toEqual([]);
    arrive(r.controller);
    await flush();
    expect(r.log).toEqual(['start']);
    r.commit();
    r.settle({ fallback: null, end: 'done' });
    await flush();
    expect(r.log).toEqual(['start', 'everting', 'closed']);
    expect(r.machine.busy()).toBe(false);
  });

  it('a wait that runs out (null) or rejects is today, once, and clears busy', async () => {
    for (const pending of [Promise.resolve(null), Promise.reject(new Error('chunk'))]) {
      const r = rig();
      r.machine.confirmWhenReady(pending, NODE, GLOBE, 'release');
      await flush();
      expect(r.log).toEqual(['today:/games']);
      expect(r.machine.busy()).toBe(false);
    }
  });

  it('an ineligible controller after the wait is today', async () => {
    const r = rig({ eligible: () => false });
    r.machine.confirmWhenReady(Promise.resolve(r.controller), NODE, GLOBE, 'release');
    await flush();
    expect(r.log).toEqual(['today:/games']);
  });

  it("hands the controller the globe's live pose, so the effect starts from the globe as it is at start", () => {
    const r = rig();
    const live = vi.fn(() => ({ yaw: 7 }) as GlobeStartState);
    r.machine.confirm(r.controller, NODE, GLOBE, 'release', live);
    expect(r.log).toEqual(['start']);
    // Read when the run starts, not at the confirm.
    expect(live).not.toHaveBeenCalled();
    expect(r.hooks().globe).toBe(live);
  });

  it('a run that navigated but could not animate (`abort`, never committed) just closes: no second navigation', async () => {
    const r = rig();
    r.confirm();
    r.settle({ fallback: null, end: 'abort' });
    await flush();
    expect(r.log).toEqual(['start', 'closed']);
  });
});
