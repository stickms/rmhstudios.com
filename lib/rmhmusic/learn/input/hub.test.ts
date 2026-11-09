import { describe, expect, it } from 'vitest';
import type { InputAdapter, InputSource, NoteEvent, NoteListener } from './events';
import { createInputHub } from './hub';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeAdapter(source: InputSource, opts: { failWith?: Error; gate?: Promise<void> } = {}) {
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
      await opts.gate;
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

  describe('stop during a pending start', () => {
    it('releases the adapter once the start resolves and never reports it active', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const got: NoteEvent[] = [];
      hub.subscribe((e) => got.push(e));
      const started = hub.start('mic');
      hub.stop('mic');
      // The adapter hears about the stop at once, and again when the start settles.
      expect(mic.state.stops).toBe(1);
      gate.resolve();
      await expect(started).resolves.toBeUndefined();
      expect(mic.state.stops).toBe(2);
      expect(hub.active()).toEqual([]);
      expect(hub.lastError('mic')).toBeNull();
      expect(mic.listenerCount()).toBe(0);
      mic.emit(60);
      expect(got).toEqual([]);
    });

    it('a fresh start after the cancelled one has settled works normally', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const first = hub.start('mic');
      hub.stop('mic');
      gate.resolve();
      await first;
      await hub.start('mic');
      expect(hub.active()).toEqual(['mic']);
      expect(mic.listenerCount()).toBe(1);
    });

    it('a fresh start issued while the cancelled one is still pending waits, then starts', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      void hub.start('mic');
      hub.stop('mic');
      const second = hub.start('mic');
      gate.resolve();
      await second;
      expect(mic.state.stops).toBe(2);
      expect(mic.state.starts).toBe(2);
      expect(hub.active()).toEqual(['mic']);
    });

    it('stop, start, stop while the first start is pending ends with nothing live', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const first = hub.start('mic');
      hub.stop('mic');
      const second = hub.start('mic');
      hub.stop('mic');
      gate.resolve();
      await Promise.all([first, second]);
      expect(mic.state.starts).toBe(1);
      expect(mic.state.started).toBe(false);
      expect(hub.active()).toEqual([]);
      expect(hub.lastError('mic')).toBeNull();
      expect(mic.listenerCount()).toBe(0);
    });

    it('stop then start (no second stop) starts afresh and is active', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const first = hub.start('mic');
      hub.stop('mic');
      const second = hub.start('mic');
      gate.resolve();
      await Promise.all([first, second]);
      expect(mic.state.starts).toBe(2);
      expect(mic.state.started).toBe(true);
      expect(hub.active()).toEqual(['mic']);
    });

    it('a stop with nothing started or starting does not call the adapter', () => {
      const mic = fakeAdapter('mic');
      const hub = createInputHub([mic.adapter]);
      hub.stop('mic');
      expect(mic.state.stops).toBe(0);
    });

    it('records no error when the cancelled start rejects', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { failWith: new Error('late'), gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const started = hub.start('mic');
      hub.stop('mic');
      gate.resolve();
      await expect(started).resolves.toBeUndefined();
      expect(hub.lastError('mic')).toBeNull();
      expect(hub.active()).toEqual([]);
      expect(mic.listenerCount()).toBe(0);
    });
  });

  describe('phases', () => {
    it('reports each source moving through its lifecycle and notifies on change only', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      let changes = 0;
      hub.onChange(() => changes++);
      const before = hub.phases();
      expect(hub.phase('mic')).toBe('idle');
      const started = hub.start('mic');
      expect(hub.phase('mic')).toBe('starting');
      expect(hub.phases()).not.toBe(before);
      // A second start while pending changes nothing.
      void hub.start('mic');
      expect(changes).toBe(1);
      gate.resolve();
      await started;
      expect(hub.phase('mic')).toBe('active');
      const snapshot = hub.phases();
      expect(hub.phases()).toBe(snapshot);
      hub.stop('mic');
      expect(hub.phase('mic')).toBe('idle');
      expect(changes).toBe(3);
    });

    it('a stop during a pending start reads as stopping until the start settles', async () => {
      const gate = deferred();
      const mic = fakeAdapter('mic', { gate: gate.promise });
      const hub = createInputHub([mic.adapter]);
      const started = hub.start('mic');
      hub.stop('mic');
      expect(hub.phase('mic')).toBe('stopping');
      void hub.start('mic');
      expect(hub.phase('mic')).toBe('starting');
      hub.stop('mic');
      gate.resolve();
      await started;
      expect(hub.phase('mic')).toBe('idle');
    });

    it('sources without an adapter are idle', () => {
      expect(createInputHub([]).phase('midi')).toBe('idle');
    });
  });
});
