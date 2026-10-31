/**
 * The lazy multiplayer loader (PLAN §0.5, WS3): the first module of the MP JS
 * chunk. The page's entry stub (components/balatro/BalatroPage.tsx) imports it
 * when Lua sends `mp_open`, or at boot for an invite / rejoin / continued run.
 *
 * It takes the mailbox over from the stub, fetches the MP pack (IndexedDB
 * cache kind `mp`, then the network; `runtime.loadPack`), writes it into the
 * game directory and `/rmh/mp/ready`, tells Lua (`mp_pack` progress → ready, on
 * which Lua requires `rmh_mp`), and then starts the session runtime
 * (`lib/balatro/mp/index.ts`, WS5) with `startMultiplayer`. It also owns the
 * browser-only parts of the lobby UI that Lua cannot do: the clipboard
 * (`ui_join_clipboard`, `ui_copy_code`), the React Invite popover
 * (`ui_invite`), the page chrome's view state, and `visibilitychange`.
 */
import { BALATRO_LIMITS } from '../net/limits';
import { MP_PACK, loadPack, mountMpFiles, unpackPack, type MpAutoload, type MpHost } from '../runtime';
import { Mailbox, type MailboxDrop } from './bridge';
import type { J2LData } from './bridge-protocol';

/** Why multiplayer was opened: Lua's `mp_open` intents, plus `sp` (mount only, no session). */
export type MpIntent = 'menu' | 'join' | 'rejoin' | 'invite' | 'sp';

/** What the session runtime gives back (WS5 `startMultiplayer`); everything but stop is optional. */
export interface MpSession {
  stop(): void;
  /** Join a lobby by code (clipboard join, a later invite link). */
  join?(code: string): void;
  /** The tab was hidden or shown (NET-09: TS keeps heartbeats; the peers see "away"). */
  setHidden?(hidden: boolean): void;
}

export interface StartMultiplayerOptions {
  bridge: Mailbox;
  session: MpHost;
  intent: Exclude<MpIntent, 'sp'>;
  /** The `?lobby=` code the page was opened with, if any. */
  invite: string | null;
}

/** The contract `lib/balatro/mp/index.ts` (WS5) exports. */
export interface MpSessionModule {
  startMultiplayer(opts: StartMultiplayerOptions): MpSession | Promise<MpSession>;
}

/** What the page stub hands over: the last Lua seq it consumed and the batches it read after. */
export interface StubHandover {
  lastLuaSeq: number;
  backlog: string[];
}

export interface MpViewState {
  /** A session is running (the MP toolbar shows). */
  active: boolean;
  pack: 'idle' | 'loading' | 'ready' | 'error';
  hub: J2LData<'net_status'>['hub'] | null;
  /** The current lobby's code, while in one. */
  code: string | null;
  isHost: boolean;
  inviteOpen: boolean;
}

export interface MpController {
  readonly mailbox: Mailbox;
  getState(): MpViewState;
  subscribe(fn: () => void): () => void;
  /** Open (or re-open) multiplayer with an intent; idempotent. */
  open(intent: MpIntent, invite?: string | null): Promise<void>;
  setInviteOpen(open: boolean): void;
  stop(): void;
}

export interface OpenOptions {
  handover?: StubHandover;
  onLog?: (line: string, isError: boolean) => void;
  /** For tests: replaces the pack fetch and the session module lookup. */
  fetchPack?: (onProgress: (f: number) => void) => Promise<{ name: string; data: Uint8Array }[]>;
  loadSession?: () => Promise<MpSessionModule | null>;
  clipboard?: Pick<Clipboard, 'readText' | 'writeText'> | null;
}

/** The MP pack's files, from IndexedDB or the network (verified by sha-256). */
export async function fetchMpPack(onProgress?: (fraction: number) => void) {
  if (!MP_PACK) throw new Error('mp-pack-missing');
  return unpackPack(await loadPack('mp', MP_PACK, (f) => onProgress?.(f * 0.9)), (f) => onProgress?.(0.9 + f * 0.1));
}

// The session runtime is WS5's `index.ts`. A glob, not `import('./index')`, so
// this chunk builds before that module exists; Vite turns it into a lazy import.
const sessionModules = import.meta.glob<MpSessionModule>('./index.ts');

async function loadSessionModule(): Promise<MpSessionModule | null> {
  const load = sessionModules['./index.ts'];
  return load ? load() : null;
}

/** A lobby code from clipboard text: the code itself, or an invite link carrying it. */
export function codeFromClipboard(text: string): string | null {
  let raw = text.trim();
  const m = /[?&]lobby=([^&#\s]+)/.exec(raw);
  if (m) raw = decodeURIComponent(m[1]);
  const code = raw.trim().toUpperCase();
  return BALATRO_LIMITS.CODE_RE.test(code) ? code : null;
}

export function openMultiplayer(host: MpHost, opts: OpenOptions = {}): MpController {
  const log = (line: string, isError = false) => opts.onLog?.(line, isError);
  const mailbox = new Mailbox({
    fs: host.fs,
    hooks: host,
    lastLuaSeq: opts.handover?.lastLuaSeq,
    backlog: opts.handover?.backlog,
    onLog: (m) => log(`[mp] ${m}`, true),
    onDrop: (d: MailboxDrop) => log(`[mp] dropped ${d.dir} ${d.t ?? ''}: ${d.error}${d.detail ? ` (${d.detail})` : ''}`, true),
  });
  const clipboard = opts.clipboard === undefined ? (globalThis.navigator?.clipboard ?? null) : opts.clipboard;

  let state: MpViewState = {
    active: false,
    pack: host.mounted ? 'ready' : 'idle',
    hub: null,
    code: null,
    isHost: false,
    inviteOpen: false,
  };
  const subs = new Set<() => void>();
  const set = (patch: Partial<MpViewState>) => {
    state = { ...state, ...patch };
    for (const fn of subs) fn();
  };

  let packLoad: Promise<boolean> | null = null;
  let session: MpSession | null = null;
  let starting: Promise<void> | null = null;
  let stopped = false;
  const cleanup: (() => void)[] = [];

  const ensurePack = (): Promise<boolean> => {
    if (state.pack === 'ready') {
      mailbox.send('mp_pack', { status: 'ready' });
      return Promise.resolve(true);
    }
    packLoad ??= (async () => {
      set({ pack: 'loading' });
      mailbox.send('mp_pack', { status: 'loading', progress: 0 });
      let last = 0;
      try {
        const files = await (opts.fetchPack ?? fetchMpPack)((f) => {
          if (f - last < 0.05 && f < 1) return;
          last = f;
          mailbox.send('mp_pack', { status: 'loading', progress: Math.min(1, Math.max(0, f)) });
        });
        if (stopped) return false;
        const n = mountMpFiles(host.fs, files, MP_PACK?.sha256.slice(0, 12) ?? 'dev');
        log(`[mp] pack mounted (${n} files)`, false);
        set({ pack: 'ready' });
        mailbox.send('mp_pack', { status: 'ready' });
        return true;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        log(`[mp] pack failed: ${error}`, true);
        set({ pack: 'error' });
        mailbox.send('mp_pack', { status: 'error', error: error.slice(0, 256) });
        packLoad = null; // the next open retries
        return false;
      }
    })();
    return packLoad;
  };

  const startSession = (intent: Exclude<MpIntent, 'sp'>, invite: string | null) => {
    if (session) {
      if (invite) session.join?.(invite);
      return Promise.resolve();
    }
    starting ??= (async () => {
      const mod = await (opts.loadSession ?? loadSessionModule)();
      if (stopped) return;
      if (!mod) {
        log('[mp] the session runtime is not in this build', true);
        return;
      }
      const s = await mod.startMultiplayer({ bridge: mailbox, session: host, intent, invite });
      if (stopped) {
        s.stop();
        return;
      }
      session = s;
      set({ active: true });
    })().catch((err) => {
      log(`[mp] session failed to start: ${String(err)}`, true);
    }).finally(() => {
      starting = null;
    });
    return starting;
  };

  const open = async (intent: MpIntent, invite: string | null = null) => {
    if (stopped) return;
    if (!(await ensurePack())) return;
    if (intent !== 'sp') await startSession(intent, invite);
  };

  // Lua asks again (another click, or the entry's retry after an error).
  cleanup.push(mailbox.on('mp_open', (d) => void open(d.intent)));
  cleanup.push(mailbox.on('mp_log', (d) => log(`[lua:${d.level}] ${d.msg}`, d.level === 'error' || d.level === 'warn')));

  // What the page chrome shows, read off what the session tells Lua.
  cleanup.push(mailbox.onSend('net_status', (d) => set({ hub: d.hub })));
  cleanup.push(mailbox.onSend('lobby_view', (d) => set({ code: d.state.code, isHost: d.isHost })));
  cleanup.push(mailbox.on('ui_leave', () => set({ code: null, isHost: false, inviteOpen: false })));
  cleanup.push(mailbox.on('ui_invite', () => set({ inviteOpen: true })));

  // LOB-03: join from the clipboard; copy the code. Lua cannot reach either.
  cleanup.push(
    mailbox.on('ui_join_clipboard', () => {
      if (!clipboard) return void mailbox.send('lobby_error', { code: 'clipboard-denied' });
      clipboard.readText().then(
        (text) => {
          const code = codeFromClipboard(text);
          if (!code) mailbox.send('lobby_error', { code: 'clipboard-empty' });
          else if (session?.join) session.join(code);
          else mailbox.send('lobby_error', { code: 'offline' });
        },
        () => mailbox.send('lobby_error', { code: 'clipboard-denied' }),
      );
    }),
  );
  cleanup.push(
    mailbox.on('ui_copy_code', () => {
      const code = state.code;
      if (!code || !clipboard) return;
      clipboard.writeText(code).catch(() => mailbox.send('lobby_error', { code: 'clipboard-denied' }));
    }),
  );

  // NET-09: the transport keeps heartbeats while hidden; Lua drains its backlog on return.
  if (typeof document !== 'undefined') {
    const onVisibility = () => session?.setHidden?.(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  return {
    mailbox,
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    open,
    setInviteOpen: (inviteOpen) => set({ inviteOpen }),
    stop() {
      if (stopped) return;
      stopped = true;
      for (const fn of cleanup.splice(0)) fn();
      session?.stop();
      session = null;
      mailbox.stop();
      set({ active: false });
    },
  };
}

export type { MpAutoload };
