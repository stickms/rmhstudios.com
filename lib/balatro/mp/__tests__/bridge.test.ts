/**
 * bridge.ts (WS3) against an in-memory filesystem that behaves like
 * Emscripten's MEMFS with FS.trackingDelegate: rename and unlink call the
 * delegates synchronously, inside the FS call. `FakeLua` does exactly what
 * lib/balatro/lua/rmh/net.lua does each frame (the real Lua runs against this
 * bridge in bridge-lua.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { BRIDGE_LIMITS, BRIDGE_PATHS } from '../bridge-protocol';
import { Mailbox, type MailboxDrop, type MailboxFs, type MailboxHooks } from '../bridge';
import { loadFixture } from '../__fixtures__/load';

const enc = new TextEncoder();
const dec = new TextDecoder();

class MemFs implements MailboxFs {
  files = new Map<string, Uint8Array>();
  moveFns = new Set<(from: string, to: string) => void>();
  deleteFns = new Set<(path: string) => void>();
  writes = 0;
  readFile(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT ${path}`);
    return f;
  }
  writeFile(path: string, data: string) {
    this.writes += 1;
    this.files.set(path, enc.encode(data));
  }
  unlink(path: string) {
    if (!this.files.delete(path)) throw new Error(`ENOENT ${path}`);
    for (const fn of this.deleteFns) fn(path);
  }
  rename(from: string, to: string) {
    const f = this.files.get(from);
    if (!f) throw new Error(`ENOENT ${from}`);
    this.files.delete(from);
    this.files.set(to, f);
    for (const fn of this.moveFns) fn(from, to);
  }
  analyzePath(path: string) {
    return { exists: this.files.has(path) };
  }
  text(path: string) {
    const f = this.files.get(path);
    return f ? dec.decode(f) : null;
  }
  hooks(tracking = true): MailboxHooks {
    return {
      tracking,
      onMove: (fn) => (this.moveFns.add(fn), () => void this.moveFns.delete(fn)),
      onDelete: (fn) => (this.deleteFns.add(fn), () => void this.deleteFns.delete(fn)),
    };
  }
}

/** rmh/net.lua, transcribed: flush (unless `out` is still there), then receive. */
class FakeLua {
  seq = 0;
  last = 0;
  acked = 0;
  frame = 0;
  queue: string[] = [];
  got: { s: number; t: string; d: unknown }[] = [];
  constructor(private fs: MemFs) {}
  send(t: string, d: unknown = {}) {
    this.seq += 1;
    this.queue.push(JSON.stringify({ s: this.seq, t, d }));
    return this.seq;
  }
  raw(line: string) {
    this.queue.push(line);
  }
  pump() {
    this.frame += 1;
    if ((this.queue.length || this.acked !== this.last) && !this.fs.analyzePath(BRIDGE_PATHS.OUT).exists) {
      const lines = [JSON.stringify({ h: 1, ack: this.last, fr: this.frame }), ...this.queue];
      this.fs.files.set(BRIDGE_PATHS.OUT_TMP, enc.encode(lines.join('\n') + '\n'));
      this.fs.rename(BRIDGE_PATHS.OUT_TMP, BRIDGE_PATHS.OUT);
      this.acked = this.last;
      this.queue = [];
    }
    const inbox = this.fs.text(BRIDGE_PATHS.IN);
    if (inbox === null) return;
    this.fs.unlink(BRIDGE_PATHS.IN);
    for (const line of inbox.split('\n').filter(Boolean)) {
      const m = JSON.parse(line) as { s: number; t: string; d: unknown };
      if (m.s <= this.last) continue;
      this.last = m.s;
      this.got.push(m);
    }
  }
}

/** Synchronous defer queue, run explicitly ("end of the rAF task"). */
function deferQueue() {
  const q: (() => void)[] = [];
  return {
    defer: (fn: () => void) => void q.push(fn),
    run() {
      while (q.length) q.shift()!();
    },
  };
}

function setup(opts: { tracking?: boolean; lastLuaSeq?: number; backlog?: string[] } = {}) {
  const fs = new MemFs();
  const lua = new FakeLua(fs);
  const q = deferQueue();
  const drops: MailboxDrop[] = [];
  const logs: string[] = [];
  let tick: (() => void) | null = null;
  const mb = new Mailbox({
    fs,
    hooks: fs.hooks(opts.tracking ?? true),
    defer: q.defer,
    poll: (fn) => ((tick = fn), () => (tick = null)),
    onDrop: (d) => drops.push(d),
    onLog: (m) => logs.push(m),
    lastLuaSeq: opts.lastLuaSeq,
    backlog: opts.backlog,
  });
  /** One browser frame: Lua's frame, then the task's microtasks, then (poll mode) the poll. */
  const frame = () => {
    lua.pump();
    q.run();
    tick?.();
    q.run();
  };
  return { fs, lua, q, mb, drops, logs, frame, poll: () => tick?.() };
}

const toast = (key: string) => ({ key });

describe('Mailbox — Lua to JS', () => {
  it('reads the batch inside the rename and dispatches outside it, in order', () => {
    const { lua, mb, q, fs } = setup();
    const seen: string[] = [];
    mb.on('mp_open', (d, msg) => seen.push(`${msg.s}:${d.intent}`));
    mb.on('ui_ready', (d) => seen.push(`ready:${d.ready}`));
    lua.send('mp_open', { intent: 'menu' });
    lua.send('ui_ready', { ready: true });
    lua.pump();
    expect(fs.analyzePath(BRIDGE_PATHS.OUT).exists).toBe(false);
    expect(seen).toEqual([]); // not inside the FS call
    q.run();
    expect(seen).toEqual(['1:menu', 'ready:true']);
    expect(mb.stats.lastLuaSeq).toBe(2);
  });

  it('drops duplicates and logs a gap, keeping order', () => {
    const { lua, mb, q, drops, logs } = setup();
    const seen: number[] = [];
    mb.onAny((m) => seen.push(m.s));
    lua.raw(JSON.stringify({ s: 1, t: 'ui_start', d: {} }));
    lua.raw(JSON.stringify({ s: 1, t: 'ui_start', d: {} }));
    lua.raw(JSON.stringify({ s: 4, t: 'ui_start', d: {} }));
    lua.raw(JSON.stringify({ s: 3, t: 'ui_start', d: {} }));
    lua.pump();
    q.run();
    expect(seen).toEqual([1, 4]);
    expect(drops.filter((d) => d.error === 'duplicate')).toHaveLength(2);
    expect(logs.some((l) => l.includes('jumped'))).toBe(true);
  });

  it('drops malformed, unknown and invalid lines with a reason, keeping the rest', () => {
    const { lua, mb, q, drops } = setup();
    const seen: string[] = [];
    mb.onAny((m) => seen.push(m.t));
    lua.raw('{broken');
    lua.raw(JSON.stringify({ s: 1, t: 'nope', d: {} }));
    lua.raw(JSON.stringify({ s: 2, t: 'ui_ready', d: { ready: 'yes' } }));
    lua.raw(JSON.stringify({ s: 3, t: 'ui_chat', d: { text: 'x'.repeat(501) } }));
    lua.raw(JSON.stringify({ t: 'ui_start', d: {} }));
    lua.raw(JSON.stringify({ s: 4, t: 'ui_start', d: [] }));
    lua.pump();
    q.run();
    expect(seen).toEqual(['ui_start']);
    expect(drops.map((d) => d.error)).toEqual(['json', 'unknown-type', 'data', 'data', 'line']);
  });

  it('drops a line over 64 KB and a batch over 256 KB', () => {
    const { lua, mb, q, drops } = setup();
    const seen: number[] = [];
    mb.onAny((m) => seen.push(m.s));
    lua.raw(JSON.stringify({ s: 1, t: 'mp_log', d: { level: 'info', msg: 'x'.repeat(BRIDGE_LIMITS.LINE_MAX_BYTES) } }));
    lua.raw(JSON.stringify({ s: 2, t: 'ui_start', d: {} }));
    lua.pump();
    q.run();
    expect(seen).toEqual([2]);
    expect(drops[0].error).toBe('too-large');
    for (let i = 0; i < 5; i += 1) lua.raw('x'.repeat(60_000));
    lua.pump();
    expect(drops.at(-1)?.error).toBe('too-large');
  });

  it('isolates a throwing listener', () => {
    const { lua, mb, q, logs } = setup();
    const seen: number[] = [];
    mb.on('ui_start', () => {
      throw new Error('boom');
    });
    mb.on('ui_start', (_d, m) => seen.push(m.s));
    lua.send('ui_start');
    lua.send('ui_start');
    lua.pump();
    q.run();
    expect(seen).toEqual([1, 2]);
    expect(logs.filter((l) => l.includes('boom'))).toHaveLength(2);
  });

  it('takes over from the page stub: backlog first, nothing re-delivered', () => {
    const backlog = [
      [JSON.stringify({ h: 1, ack: 0, fr: 3 }), JSON.stringify({ s: 2, t: 'mp_log', d: { level: 'info', msg: 'a' } })].join('\n'),
    ];
    const { lua, mb, q } = setup({ lastLuaSeq: 1, backlog });
    const seen: number[] = [];
    mb.onAny((m) => seen.push(m.s));
    lua.seq = 1;
    lua.raw(JSON.stringify({ s: 1, t: 'mp_open', d: { intent: 'menu' } }));
    lua.send('ui_start');
    lua.pump();
    q.run();
    expect(seen).toEqual([2]);
    // s=2 came from the backlog; Lua's own s=2 now is a duplicate, s=1 is old.
    expect(mb.stats.lastLuaSeq).toBe(2);
  });

  it('reads a batch that was waiting before the mailbox existed', () => {
    const fs = new MemFs();
    fs.files.set(BRIDGE_PATHS.OUT, enc.encode(`${JSON.stringify({ s: 1, t: 'ui_start', d: {} })}\n`));
    const q = deferQueue();
    const mb = new Mailbox({ fs, hooks: fs.hooks(), defer: q.defer });
    const seen: string[] = [];
    mb.onAny((m) => seen.push(m.t));
    q.run();
    expect(seen).toEqual(['ui_start']);
  });
});

describe('Mailbox — JS to Lua', () => {
  it('validates, numbers and writes lines; Lua consumes them next frame', () => {
    const { lua, mb, q, fs } = setup();
    expect(mb.send('toast', toast('a'))).toBe(1);
    expect(mb.send('toast', toast('b'))).toBe(2);
    expect(fs.analyzePath(BRIDGE_PATHS.IN).exists).toBe(false); // coalesced in a microtask
    q.run();
    expect(fs.writes).toBe(1);
    lua.pump();
    expect(lua.got.map((m) => m.s)).toEqual([1, 2]);
    expect(mb.stats.pending).toBe(0); // onDeletePath = consumed
  });

  it('refuses invalid data without using a seq', () => {
    const { mb, drops } = setup();
    // @ts-expect-error — wrong on purpose
    expect(mb.send('toast', { key: 5 })).toBe(-1);
    // @ts-expect-error — not a JS→Lua type
    expect(mb.send('ui_start', {})).toBe(-1);
    expect(drops.map((d) => d.error)).toEqual(['invalid', 'invalid']);
    expect(mb.send('toast', toast('ok'))).toBe(1);
  });

  it('refuses a line over 64 KB', () => {
    const { mb, drops } = setup();
    const huge = Array.from({ length: 300 }, (_, i) => ({ d: { i, pad: 'p'.repeat(240) }, i, op: 'buy' as const, t: i }));
    expect(mb.send('replay_feed', { pov: 'u1', events: huge })).toBe(-1);
    expect(drops[0].error).toBe('too-large');
  });

  it('answers inside the rename: lines queued before Lua flushes reach Lua that frame', () => {
    const { lua, mb, q } = setup();
    mb.send('toast', toast('early'));
    // No microtask ran (e.g. sent from a socket callback just before the frame).
    lua.send('ui_start');
    lua.pump();
    expect(lua.got.map((m) => (m.d as { key: string }).key)).toEqual(['early']);
    q.run();
  });

  it('rewrites the whole inbox while Lua has not read it, and caps it at 256 KB', () => {
    const { lua, mb, q, fs } = setup();
    const events = Array.from({ length: 180 }, (_, i) => ({ d: { pad: 'p'.repeat(240) }, i, op: 'buy' as const, t: i }));
    for (let i = 0; i < 7; i += 1) expect(mb.send('replay_feed', { pov: `u${i}`, events })).toBe(i + 1);
    q.run();
    const first = fs.text(BRIDGE_PATHS.IN)!;
    expect(enc.encode(first).length).toBeLessThanOrEqual(BRIDGE_LIMITS.BATCH_MAX_BYTES);
    expect(first.split('\n').filter(Boolean)).toHaveLength(5);
    lua.pump(); // reads 5, removes → the rest is written
    q.run();
    lua.pump();
    expect(lua.got.map((m) => m.s)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('notifies send listeners', () => {
    const { mb } = setup();
    const codes: string[] = [];
    mb.onSend('lobby_error', (d) => codes.push(d.code));
    mb.send('lobby_error', { code: 'full' });
    expect(codes).toEqual(['full']);
  });

  it('stop() ends delivery both ways', () => {
    const { lua, mb, q, fs } = setup();
    const seen: string[] = [];
    mb.onAny((m) => seen.push(m.t));
    mb.stop();
    lua.send('ui_start');
    lua.pump();
    q.run();
    expect(seen).toEqual([]);
    expect(fs.analyzePath(BRIDGE_PATHS.OUT).exists).toBe(true);
    expect(mb.send('toast', toast('x'))).toBe(-1);
    expect(fs.moveFns.size + fs.deleteFns.size).toBe(0);
  });
});

describe('Mailbox — polling mode (no trackingDelegate)', () => {
  it('delivers both ways and only forgets inbox lines once acked', () => {
    const { lua, mb, frame, fs } = setup({ tracking: false });
    const seen: number[] = [];
    mb.onAny((m) => seen.push(m.s));
    mb.send('toast', toast('a'));
    lua.send('ui_start');
    frame(); // Lua flushes (JS polls after), Lua reads nothing yet; JS writes `in`
    expect(seen).toEqual([1]);
    frame(); // Lua reads `in` (s=1) and acks next frame
    expect(lua.got.map((m) => m.s)).toEqual([1]);
    expect(mb.stats.pending).toBe(1); // not acked yet: an absent file is not proof
    frame(); // ack-only batch
    expect(mb.stats.ack).toBe(1);
    expect(mb.stats.pending).toBe(0);
    frame();
    expect(fs.analyzePath(BRIDGE_PATHS.OUT).exists).toBe(false);
    expect(lua.got).toHaveLength(1);
  });

  it('Lua holds its batch while `out` is still there', () => {
    const { lua, mb, fs, poll, q } = setup({ tracking: false });
    const seen: number[] = [];
    mb.onAny((m) => seen.push(m.s));
    lua.send('ui_start');
    lua.pump();
    lua.send('ui_start');
    lua.pump(); // out still present: held
    expect(lua.queue).toHaveLength(1);
    poll();
    q.run();
    lua.pump();
    poll();
    q.run();
    expect(seen).toEqual([1, 2]);
    expect(fs.analyzePath(BRIDGE_PATHS.OUT).exists).toBe(false);
  });
});

describe('Mailbox — ordering at volume', () => {
  it('round-trips 1 000 messages each way in order with no loss (tracking)', () => {
    const { lua, mb, frame } = setup();
    const fromLua: number[] = [];
    mb.on('mp_log', (d) => fromLua.push(Number(d.msg)));
    let toLua = 0;
    let fromLuaSent = 0;
    for (let f = 0; f < 400 && (lua.got.length < 1000 || fromLua.length < 1000); f += 1) {
      for (let k = 0; k < 7 && toLua < 1000; k += 1) mb.send('toast', toast(String(toLua++)));
      for (let k = 0; k < 5 && fromLuaSent < 1000; k += 1) lua.send('mp_log', { level: 'info', msg: String(fromLuaSent++) });
      frame();
    }
    expect(fromLua).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    expect(lua.got.map((m) => Number((m.d as { key: string }).key))).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it('round-trips 1 000 messages each way in order with no loss (polling)', () => {
    const { lua, mb, frame } = setup({ tracking: false });
    const fromLua: number[] = [];
    mb.on('mp_log', (d) => fromLua.push(Number(d.msg)));
    for (let i = 0; i < 1000; i += 1) {
      mb.send('toast', toast(String(i)));
      lua.send('mp_log', { level: 'info', msg: String(i) });
      if (i % 13 === 0) frame();
    }
    for (let f = 0; f < 50; f += 1) frame();
    expect(fromLua).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    expect(lua.got.map((m) => Number((m.d as { key: string }).key))).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });
});

describe('Mailbox — shared NDJSON fixtures (l2j)', () => {
  const fx = loadFixture('mailbox.json' as 'bridge.json') as unknown as {
    l2j: { name: string; text: string; header: unknown; messages: { s: number; t: string }[]; dropped: number }[];
  };
  for (const c of fx.l2j) {
    it(c.name, () => {
      const fs = new MemFs();
      const q = deferQueue();
      const drops: MailboxDrop[] = [];
      const mb = new Mailbox({ fs, hooks: fs.hooks(), defer: q.defer, onDrop: (d) => drops.push(d) });
      const seen: { s: number; t: string }[] = [];
      mb.onAny((m) => seen.push({ s: m.s, t: m.t }));
      fs.files.set(BRIDGE_PATHS.OUT_TMP, enc.encode(c.text));
      fs.rename(BRIDGE_PATHS.OUT_TMP, BRIDGE_PATHS.OUT);
      q.run();
      expect(seen).toEqual(c.messages);
      expect(drops).toHaveLength(c.dropped);
      const h = c.header as { ack: number };
      expect(mb.stats.ack).toBe(h.ack);
    });
  }
});
