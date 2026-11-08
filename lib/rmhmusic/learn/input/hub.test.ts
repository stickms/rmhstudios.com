import { describe, expect, it } from 'vitest';
import type { InputAdapter, InputSource, NoteEvent, NoteListener } from './events';
import { createInputHub } from './hub';

function fakeAdapter(source: InputSource, opts: { failWith?: Error } = {}) {
  const listeners = new Set<NoteListener>();
  const state = {
    started: false,
    starts: 0,
    stops: 0,
    failWith: opts.failWith,
    onStop: undefined as (() => void) | undefined,
  };
  const adapter: InputAdapter = {
    source,
    async start() {
      state.starts++;
      if (state.failWith) throw state.failWith;
      state.started = true;
    },
    stop() {
      state.stops++;
      state.started = false;
      state.onStop?.();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const emit = (midi: number) => {
    const e: NoteEvent = { type: 'on', midi, velocity: 1, time: 0, source };
    for (const l of [...listeners]) l(e);
  };
  return { adapter, state, emit, listenerCount: () => listeners.size };
}

describe('createInputHub', () => {
  it('fans events from every started adapter into one listener', async () => {
    const mic = fakeAdapter('mic');
    const keys = fakeAdapter('keys');
    const hub = createInputHub([mic.adapter, keys.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    await hub.start('mic');
    await hub.start('keys');
    mic.emit(60);
    keys.emit(62);
    expect(got.map((e) => [e.source, e.midi])).toEqual([
      ['mic', 60],
      ['keys', 62],
    ]);
    expect(hub.active()).toEqual(['mic', 'keys']);
  });

  it('delivers nothing from an adapter that has not been started', () => {
    const mic = fakeAdapter('mic');
    const hub = createInputHub([mic.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    mic.emit(60);
    expect(got).toEqual([]);
  });

  it('stop(source) stops only that adapter and unsubscribes from it', async () => {
    const mic = fakeAdapter('mic');
    const keys = fakeAdapter('keys');
    const hub = createInputHub([mic.adapter, keys.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    await hub.start('mic');
    await hub.start('keys');
    hub.stop('mic');
    expect(mic.state.stops).toBe(1);
    expect(keys.state.stops).toBe(0);
    expect(mic.listenerCount()).toBe(0);
    mic.emit(60);
    keys.emit(64);
    expect(got.map((e) => e.source)).toEqual(['keys']);
    expect(hub.active()).toEqual(['keys']);
  });

  it('records a failed start in lastError, rethrows, and leaves others unaffected', async () => {
    const boom = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const mic = fakeAdapter('mic', { failWith: boom });
    const keys = fakeAdapter('keys');
    const hub = createInputHub([mic.adapter, keys.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    await expect(hub.start('mic')).rejects.toBe(boom);
    expect(hub.lastError('mic')).toBe(boom);
    expect(hub.lastError('mic')?.name).toBe('NotAllowedError');
    expect(hub.active()).toEqual([]);
    expect(mic.listenerCount()).toBe(0);
    await hub.start('keys');
    keys.emit(60);
    expect(got).toHaveLength(1);
    expect(hub.lastError('keys')).toBeNull();
    expect(hub.active()).toEqual(['keys']);
  });

  it('delivers events an adapter emits while stopping (held notes released)', async () => {
    const mic = fakeAdapter('mic');
    const hub = createInputHub([mic.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    await hub.start('mic');
    mic.state.onStop = () => mic.emit(60);
    hub.stop('mic');
    expect(got).toHaveLength(1);
    mic.emit(62);
    expect(got).toHaveLength(1);
  });

  it('a later successful start clears lastError', async () => {
    const mic = fakeAdapter('mic', { failWith: new Error('nope') });
    const hub = createInputHub([mic.adapter]);
    await expect(hub.start('mic')).rejects.toThrow('nope');
    mic.state.failWith = undefined;
    await hub.start('mic');
    expect(hub.lastError('mic')).toBeNull();
    expect(hub.active()).toEqual(['mic']);
  });

  it('stop on a never-started adapter is a harmless no-op', () => {
    const mic = fakeAdapter('mic');
    const hub = createInputHub([mic.adapter]);
    expect(() => hub.stop('mic')).not.toThrow();
    expect(() => hub.stop('midi')).not.toThrow();
    expect(mic.state.stops).toBe(0);
  });

  it('starting an already-started source does not double-subscribe', async () => {
    const mic = fakeAdapter('mic');
    const hub = createInputHub([mic.adapter]);
    const got: NoteEvent[] = [];
    hub.subscribe((e) => got.push(e));
    await hub.start('mic');
    await hub.start('mic');
    mic.emit(60);
    expect(got).toHaveLength(1);
  });

  it('unsubscribe stops a listener receiving events', async () => {
    const mic = fakeAdapter('mic');
    const hub = createInputHub([mic.adapter]);
    const got: NoteEvent[] = [];
    const off = hub.subscribe((e) => got.push(e));
    await hub.start('mic');
    off();
    mic.emit(60);
    expect(got).toEqual([]);
  });

  it('start for an unknown source rejects', async () => {
    const hub = createInputHub([]);
    await expect(hub.start('mic')).rejects.toThrow();
  });
});
