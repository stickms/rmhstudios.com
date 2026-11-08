import { describe, expect, it } from 'vitest';
import type { InputAdapter, InputSource } from './events';
import { createInputHub } from './hub';
import { switchInput } from './switch';

function adapter(source: InputSource, opts: { fail?: Error; hang?: boolean } = {}) {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const a: InputAdapter = {
    source,
    start: () => {
      calls.push('start');
      if (opts.fail) return Promise.reject(opts.fail);
      if (opts.hang) return new Promise<void>((r) => (release = r));
      return Promise.resolve();
    },
    stop: () => {
      calls.push('stop');
    },
    subscribe: () => () => {},
  };
  return { a, calls, finish: () => release?.() };
}

describe('switchInput', () => {
  it('a failed switch keeps the old input running (finding e)', async () => {
    const keys = adapter('keys');
    const mic = adapter('mic', {
      fail: Object.assign(new Error('no'), { name: 'NotAllowedError' }),
    });
    const hub = createInputHub([keys.a, mic.a, adapter('midi').a, adapter('screen').a]);
    await hub.start('keys');
    expect(await switchInput(hub, 'keys', 'mic')).toBe(false);
    expect(hub.phase('keys')).toBe('active');
    expect(keys.calls).toEqual(['start']);
    expect(hub.lastError('mic')?.name).toBe('NotAllowedError');
  });

  it('a successful switch starts the new input before stopping the old one', async () => {
    const order: string[] = [];
    const keys = adapter('keys');
    const midi = adapter('midi');
    keys.a.stop = () => order.push('keys:stop');
    midi.a.start = () => (order.push('midi:start'), Promise.resolve());
    const hub = createInputHub([keys.a, midi.a, adapter('mic').a, adapter('screen').a]);
    await hub.start('keys');
    expect(await switchInput(hub, 'keys', 'midi')).toBe(true);
    expect(order).toEqual(['midi:start', 'keys:stop']);
    expect(hub.active()).toEqual(['midi']);
  });

  it('stops every other started interactive source, never the on-screen keys', async () => {
    const hub = createInputHub([
      adapter('keys').a,
      adapter('mic').a,
      adapter('midi').a,
      adapter('screen').a,
    ]);
    await hub.start('screen');
    await hub.start('mic');
    await hub.start('midi');
    expect(await switchInput(hub, 'midi', 'keys')).toBe(true);
    expect(hub.active().sort()).toEqual(['keys', 'screen']);
  });

  it('a start cancelled while pending reports false and stops nothing', async () => {
    const keys = adapter('keys');
    const mic = adapter('mic', { hang: true });
    const hub = createInputHub([keys.a, mic.a, adapter('midi').a, adapter('screen').a]);
    await hub.start('keys');
    const switching = switchInput(hub, 'keys', 'mic');
    hub.stop('mic');
    mic.finish();
    expect(await switching).toBe(false);
    expect(hub.phase('keys')).toBe('active');
  });

  it('choosing the input already in use keeps it', async () => {
    const hub = createInputHub([
      adapter('keys').a,
      adapter('mic').a,
      adapter('midi').a,
      adapter('screen').a,
    ]);
    await hub.start('mic');
    expect(await switchInput(hub, 'mic', 'mic')).toBe(true);
    expect(hub.active()).toEqual(['mic']);
  });
});
