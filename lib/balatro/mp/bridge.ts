/**
 * The JS half of the Lua↔JS mailbox (PLAN §3.c; the Lua half is
 * `lib/balatro/lua/rmh/net.lua`, the vocabulary `bridge-protocol.ts`).
 *
 * The love.js build exports no Lua C API, so the two sides trade NDJSON files in
 * Emscripten's in-memory filesystem, and everything runs on one thread: a JS
 * callback never runs in the middle of a Lua frame.
 *
 * **Lua → JS.** Once per frame Lua writes its batch to `out.tmp` and renames it
 * to `out`. `FS.trackingDelegate.onMovePath` fires inside that rename; the
 * mailbox reads and unlinks `out` there, writes any pending inbound lines to
 * `in` before returning (so Lua reads them in the same frame), and dispatches
 * the batch's messages to listeners in a microtask, outside the FS call.
 *
 * **JS → Lua.** `send` validates with zod, numbers the line, and queues it. A
 * microtask (or the rename above) rewrites `in` with every line Lua has not
 * consumed, capped at 256 KB; the rest waits. Lua reads `in` whole, removes it
 * (`onDeletePath` → consumed) and drops `s ≤ last`, so a rewrite that repeats a
 * line is harmless. Lua acks the last applied seq in its next batch header.
 *
 * **Without trackingDelegate** (a future engine), or across processes in the
 * conformance test, the mailbox polls `out` every 16 ms, and treats
 * `in` lines as consumed only once acked: an absent `in` with unacked lines is
 * rewritten, never assumed read. Lua holds its next batch while `out` exists.
 */
import {
  BRIDGE_LIMITS,
  BRIDGE_PATHS,
  encodeJsLine,
  parseLuaBatch,
  utf8Length,
  type J2LData,
  type J2LType,
  type L2JData,
  type L2JMessage,
  type L2JType,
} from './bridge-protocol';

/** The slice of Emscripten's FS the mailbox uses (node `fs` fits too). */
export interface MailboxFs {
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: string): void;
  unlink(path: string): void;
  analyzePath(path: string): { exists: boolean };
}

/** FS notifications; `runtime.ts` `MpHost` provides them. */
export interface MailboxHooks {
  tracking: boolean;
  onMove(fn: (from: string, to: string) => void): () => void;
  onDelete(fn: (path: string) => void): () => void;
}

export type MailboxDrop =
  | { dir: 'l2j'; error: string; t?: string; detail?: string; s?: number }
  | { dir: 'j2l'; error: 'invalid' | 'too-large'; t: string; detail?: string };

export interface MailboxOptions {
  fs: MailboxFs;
  /** Omit, or `tracking: false`, to poll. */
  hooks?: MailboxHooks | null;
  /** Prefix for the mailbox paths (tests use a temp dir). Default ''. */
  root?: string;
  /** Lua seqs at or below this were already handled (handover from the page stub). */
  lastLuaSeq?: number;
  /** Raw batches the page stub read before the mailbox existed, oldest first. */
  backlog?: string[];
  onDrop?: (drop: MailboxDrop) => void;
  onLog?: (msg: string) => void;
  /** Runs listeners outside the FS call. Default queueMicrotask. */
  defer?: (fn: () => void) => void;
  /** Starts polling in polling mode; returns a stop function. Default: a 16 ms interval. */
  poll?: (tick: () => void) => () => void;
}

type Listener = (d: never, msg: L2JMessage) => void;
type SendListener = (d: never, s: number) => void;

interface Line {
  s: number;
  text: string;
  bytes: number;
}

const decoder = new TextDecoder();

/**
 * Polling fallback only (no trackingDelegate): a 16 ms interval, stopped with
 * the mailbox. Lua holds its next batch while `out` exists, so a late poll only
 * delays, never loses. Not a rAF loop on purpose (§17.3 rAF allowlist).
 */
function defaultPoll(tick: () => void): () => void {
  const id = setInterval(tick, 16);
  return () => clearInterval(id);
}

export interface MailboxStats {
  sent: number;
  received: number;
  dropped: number;
  /** Highest Lua seq delivered. */
  lastLuaSeq: number;
  /** Highest JS seq Lua has acked. */
  ack: number;
  /** JS lines queued or written but not yet acked/consumed. */
  pending: number;
  batches: number;
}

export class Mailbox {
  readonly tracking: boolean;
  private readonly fs: MailboxFs;
  private readonly paths: { OUT: string; IN: string };
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly anyListeners = new Set<(msg: L2JMessage) => void>();
  private readonly sendListeners = new Map<string, Set<SendListener>>();
  private readonly opts: MailboxOptions;
  private readonly defer: (fn: () => void) => void;
  private readonly cleanup: (() => void)[] = [];
  /** Written to `in`, not yet known consumed. */
  private written: Line[] = [];
  /** Not yet written. */
  private queued: Line[] = [];
  private inbox: L2JMessage[] = [];
  private seq = 0;
  private flushScheduled = false;
  private dispatchScheduled = false;
  private stopped = false;
  private readonly counters = { sent: 0, received: 0, dropped: 0, lastLuaSeq: 0, ack: 0, batches: 0 };

  constructor(opts: MailboxOptions) {
    this.opts = opts;
    this.fs = opts.fs;
    const root = opts.root ?? '';
    this.paths = { OUT: root + BRIDGE_PATHS.OUT, IN: root + BRIDGE_PATHS.IN };
    this.defer = opts.defer ?? ((fn) => queueMicrotask(fn));
    this.counters.lastLuaSeq = opts.lastLuaSeq ?? 0;
    const hooks = opts.hooks;
    this.tracking = !!hooks?.tracking;
    if (hooks && this.tracking) {
      this.cleanup.push(
        hooks.onMove((_from, to) => {
          if (to === this.paths.OUT) this.drain();
        }),
        hooks.onDelete((path) => {
          if (path !== this.paths.IN) return;
          // Single-threaded: Lua read everything in the file before removing it.
          this.written = [];
          if (this.queued.length) this.scheduleFlush();
        }),
      );
    } else {
      const poll = opts.poll ?? defaultPoll;
      this.cleanup.push(
        poll(() => {
          this.drain();
          this.flush();
        }),
      );
    }
    for (const text of opts.backlog ?? []) this.ingest(text);
    // A batch Lua wrote before anyone listened.
    this.drain();
  }

  /** Queue one message for Lua. Returns its seq, or -1 when it was refused (see onDrop). */
  send<T extends J2LType>(t: T, d: J2LData<T>): number {
    if (this.stopped) return -1;
    const s = this.seq + 1;
    let text: string;
    try {
      text = encodeJsLine(s, t, d);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.drop({ dir: 'j2l', error: message.includes('exceeds') ? 'too-large' : 'invalid', t, detail: message });
      return -1;
    }
    this.seq = s;
    this.queued.push({ s, text, bytes: utf8Length(text) + 1 });
    this.counters.sent += 1;
    this.scheduleFlush();
    for (const fn of this.sendListeners.get(t) ?? []) {
      try {
        (fn as (d: J2LData<T>, s: number) => void)(d, s);
      } catch (err) {
        this.log(`send listener for ${t} failed: ${String(err)}`);
      }
    }
    return s;
  }

  /** Listen for one Lua→JS type. Returns an unsubscribe. */
  on<T extends L2JType>(t: T, fn: (d: L2JData<T>, msg: Extract<L2JMessage, { t: T }>) => void): () => void {
    let set = this.listeners.get(t);
    if (!set) this.listeners.set(t, (set = new Set()));
    set.add(fn as unknown as Listener);
    return () => void set.delete(fn as unknown as Listener);
  }

  /** Every Lua→JS message, after the typed listeners. */
  onAny(fn: (msg: L2JMessage) => void): () => void {
    this.anyListeners.add(fn);
    return () => void this.anyListeners.delete(fn);
  }

  /** Observe what JS sends to Lua (view state for the page chrome). */
  onSend<T extends J2LType>(t: T, fn: (d: J2LData<T>, s: number) => void): () => void {
    let set = this.sendListeners.get(t);
    if (!set) this.sendListeners.set(t, (set = new Set()));
    set.add(fn as unknown as SendListener);
    return () => void set.delete(fn as unknown as SendListener);
  }

  get stats(): MailboxStats {
    return { ...this.counters, pending: this.written.length + this.queued.length };
  }

  /** Read Lua's batch now, if one is waiting. Returns the messages accepted. */
  drain(): number {
    if (this.stopped || !this.exists(this.paths.OUT)) return 0;
    let text: string;
    try {
      text = decoder.decode(this.fs.readFile(this.paths.OUT));
      this.fs.unlink(this.paths.OUT);
    } catch (err) {
      this.log(`reading the Lua batch failed: ${String(err)}`);
      return 0;
    }
    const n = this.ingest(text);
    // The in-call reply: Lua reads `in` right after its rename returns.
    this.flush();
    return n;
  }

  /** Write what Lua has not consumed to `in` now (normally a microtask does it). */
  flush(): void {
    this.flushScheduled = false;
    if (this.stopped) return;
    const present = this.exists(this.paths.IN);
    if (!this.queued.length && (present || !this.written.length)) return;
    let bytes = this.written.reduce((n, l) => n + l.bytes, 0);
    let moved = 0;
    while (moved < this.queued.length && bytes + this.queued[moved].bytes <= BRIDGE_LIMITS.BATCH_MAX_BYTES) {
      bytes += this.queued[moved].bytes;
      moved += 1;
    }
    if (!moved && present) return;
    this.written.push(...this.queued.splice(0, moved));
    try {
      this.fs.writeFile(this.paths.IN, this.written.map((l) => `${l.text}\n`).join(''));
    } catch (err) {
      this.log(`writing the inbox failed: ${String(err)}`);
    }
  }

  /** Stop listening and polling. Pending lines stay unsent. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const fn of this.cleanup.splice(0)) fn();
    this.listeners.clear();
    this.anyListeners.clear();
    this.sendListeners.clear();
  }

  private ingest(text: string): number {
    const batch = parseLuaBatch(text);
    this.counters.batches += 1;
    if (batch.header) this.acked(batch.header.ack);
    for (const d of batch.dropped) this.drop({ dir: 'l2j', ...d, error: d.error });
    let accepted = 0;
    for (const msg of batch.messages) {
      if (msg.s <= this.counters.lastLuaSeq) {
        this.drop({ dir: 'l2j', error: 'duplicate', t: msg.t, s: msg.s });
        continue;
      }
      if (msg.s !== this.counters.lastLuaSeq + 1 && this.counters.lastLuaSeq > 0) {
        this.log(`Lua seq jumped from ${this.counters.lastLuaSeq} to ${msg.s}`);
      }
      this.counters.lastLuaSeq = msg.s;
      this.counters.received += 1;
      this.inbox.push(msg);
      accepted += 1;
    }
    if (accepted && !this.dispatchScheduled) {
      this.dispatchScheduled = true;
      this.defer(() => this.dispatch());
    }
    return accepted;
  }

  private dispatch(): void {
    this.dispatchScheduled = false;
    const msgs = this.inbox;
    this.inbox = [];
    for (const msg of msgs) {
      if (this.stopped) return;
      for (const fn of this.listeners.get(msg.t) ?? []) this.call(() => fn(msg.d as never, msg), msg.t);
      for (const fn of this.anyListeners) this.call(() => fn(msg), msg.t);
    }
  }

  private call(fn: () => void, t: string) {
    try {
      fn();
    } catch (err) {
      this.log(`listener for ${t} failed: ${String(err)}`);
    }
  }

  private acked(ack: number) {
    if (ack > this.counters.ack) this.counters.ack = ack;
    if (this.written.length && this.written[0].s <= ack) {
      this.written = this.written.filter((l) => l.s > ack);
    }
  }

  private scheduleFlush() {
    if (this.flushScheduled || this.stopped) return;
    this.flushScheduled = true;
    this.defer(() => this.flush());
  }

  private exists(path: string): boolean {
    try {
      return this.fs.analyzePath(path).exists;
    } catch {
      return false;
    }
  }

  private drop(drop: MailboxDrop) {
    this.counters.dropped += 1;
    this.opts.onDrop?.(drop);
  }

  private log(msg: string) {
    this.opts.onLog?.(msg);
  }
}
