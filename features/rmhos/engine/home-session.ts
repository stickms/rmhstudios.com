/**
 * The orchestration around the home folder, with every side effect injected so it can be tested
 * without a browser or a machine. HomeSession owns: the handshake order, the rule that nothing is
 * saved before the guest's RESTORE succeeded (an early save could replace the stored archive with
 * an empty home), the autosave timer, the tab-hidden save, the unload prompt, the guest's
 * power-off, and taking all of that down again when the machine stops or the page leaves.
 *
 * Order: prepare() puts the stored tar in the share -> SESSION -> RESTORE -> running. The runner
 * starts only once the machine is running, which on a cold boot means the guest already said READY. A stored archive that cannot be read stops the boot (`corrupt`):
 * the person decides; nothing is overwritten.
 */
import { AgentError, type AgentClient } from './agent';
import type { HomeSync, SaveOptions, SaveResult } from './home-sync';

export type SessionStage = 'idle' | 'handshake' | 'running' | 'failed' | 'stopped';
export type SessionFailure = 'handshake' | 'corrupt';

export interface SessionSnapshot {
  stage: SessionStage;
  failure: SessionFailure | null;
  error: string | null;
  /** The Linux name the guest reported for this session (when it says one). */
  linuxName: string | null;
  /** RESTORE succeeded and the machine is still up: saving is allowed. */
  desktopReady: boolean;
  saving: boolean;
  /** The guest was used since the last good save. */
  dirty: boolean;
  lastSave: {
    result: SaveResult;
    at: number;
  } | null;
  storeKind: 'indexeddb' | 'memory';
  /** After a failed handshake: a home that a restored backup replaced is still there to put back. */
  previousAvailable: boolean;
  /** When the files that could be put back were saved (set with `previousAvailable`). */
  previousSavedAt: number | null;
}

interface Listenable {
  addEventListener(type: string, cb: (ev: Event) => void): void;
  removeEventListener(type: string, cb: (ev: Event) => void): void;
}

export interface SessionEnv {
  now(): number;
  setInterval(cb: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  doc: Listenable & {
    readonly visibilityState: string;
  };
  win: Listenable;
}

export function browserEnv(): SessionEnv {
  return {
    now: () => Date.now(),
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    doc: document,
    win: window,
  };
}

export interface SessionDeps {
  agent: Pick<AgentClient, 'startSession' | 'restore' | 'onPoweroff' | 'onSavedOnPoweroff'>;
  sync: Pick<
    HomeSync,
    | 'prepare'
    | 'save'
    | 'importArchive'
    | 'discardDamaged'
    | 'exportLive'
    | 'suspend'
    | 'previousOffer'
    | 'putPreviousBack'
    | 'storeKind'
  >;
  linuxUser: string;
  autosaveMs: number;
  env: SessionEnv;
  onChange: (s: SessionSnapshot) => void;
}

const NOT_RUNNING: SaveResult = {
  status: 'failed',
  code: 'not-running',
};
const POWEROFF_SAVE_TIMEOUT_MS = 10_000;
/** A good save younger than this share of the autosave interval makes a scheduled save redundant. */
const SAVED_RECENTLY = 0.9;
/** Leaving the page (navigation, sign-out) waits this long for one last save. */
export const LEAVE_SAVE_TIMEOUT_MS = 15_000;

export class HomeSession {
  private snap: SessionSnapshot = {
    stage: 'idle',
    failure: null,
    error: null,
    linuxName: null,
    desktopReady: false,
    saving: false,
    dirty: false,
    lastSave: null,
    storeKind: 'indexeddb',
    previousAvailable: false,
    previousSavedAt: null,
  };
  private running = false;
  private disposed = false;
  private inputEpoch = 0;
  private saveGeneration = 0;
  private readyAt = 0;
  private teardowns: Array<() => void> = [];

  constructor(private readonly d: SessionDeps) {}

  get snapshot(): SessionSnapshot {
    return this.snap;
  }

  private set(patch: Partial<SessionSnapshot>) {
    if (this.disposed) return;
    this.snap = {
      ...this.snap,
      ...patch,
    };
    this.d.onChange(this.snap);
  }

  async start(): Promise<void> {
    const { sync, agent } = this.d;
    this.set({
      stage: 'handshake',
    });
    // The machine can stop while the handshake awaits (machineStopped sets `stopped`/`failed`):
    // whatever then settles must not overwrite that, nor start a session on a dead machine.
    const stillStarting = () => !this.disposed && this.snap.stage === 'handshake';
    try {
      const outcome = await sync.prepare();
      this.set({
        storeKind: sync.storeKind,
      });
      if (!stillStarting()) return;
      if (outcome === 'corrupt') {
        this.set({
          stage: 'failed',
          failure: 'corrupt',
          error: 'stored home unreadable',
        });
        return;
      }
      const { user } = await agent.startSession(this.d.linuxUser);
      if (user && stillStarting())
        this.set({
          linuxName: user,
        });
      await agent.restore();
    } catch (e) {
      if (!stillStarting()) return;
      const offer = await sync.previousOffer().catch(() => null);
      if (!stillStarting()) return;
      this.set({
        stage: 'failed',
        failure: 'handshake',
        error: e instanceof AgentError ? `agent: ${e.code}` : 'could not start the session',
        previousAvailable: !!offer,
        previousSavedAt: offer?.savedAt ?? null,
      });
      return;
    }
    if (!stillStarting()) return;
    this.begin();
  }

  private begin() {
    const { env, agent } = this.d;
    this.running = true;
    this.readyAt = env.now();
    this.set({
      stage: 'running',
      desktopReady: true,
    });

    const timer = env.setInterval(() => {
      if (!this.savedRecently()) void this.save();
    }, this.d.autosaveMs);
    this.teardowns.push(() => env.clearInterval(timer));

    const onVisibility = () => {
      if (env.doc.visibilityState === 'hidden' && !this.savedRecently()) void this.save();
    };
    env.doc.addEventListener('visibilitychange', onVisibility);
    this.teardowns.push(() => env.doc.removeEventListener('visibilitychange', onVisibility));

    // Unsaved: the toolbar says "Unsaved changes" (dirty) or a save is still running, the last
    // save did not land, or the last good save (before any save: the desktop becoming ready) is
    // older than one autosave interval.
    const onBeforeUnload = (ev: Event) => {
      if (this.isUnsaved()) {
        ev.preventDefault();
        (ev as BeforeUnloadEvent).returnValue = '';
      }
    };
    env.win.addEventListener('beforeunload', onBeforeUnload);
    this.teardowns.push(() => env.win.removeEventListener('beforeunload', onBeforeUnload));

    // The guest is going down. When it already saved its home on the way (`saved-on-poweroff`,
    // announced before or after POWEROFF) that tar is stored without a SAVE round trip;
    // otherwise one short, best-effort SAVE while the agent may still answer. Either way with
    // its own 10 s bound, also when it joins a save already in flight.
    let poweroffSave: Promise<SaveResult> | null = null;
    this.teardowns.push(
      agent.onSavedOnPoweroff((bytes) => {
        poweroffSave ??= this.save({
          timeoutMs: POWEROFF_SAVE_TIMEOUT_MS,
          alreadySaved: {
            bytes,
          },
        });
      }),
    );
    this.teardowns.push(
      agent.onPoweroff(() => {
        void (
          poweroffSave ??
          this.save({
            timeoutMs: POWEROFF_SAVE_TIMEOUT_MS,
          })
        ).finally(() => this.stop('stopped'));
      }),
    );
  }

  /**
   * Nothing to do for the scheduled saves (the autosave tick, a tab going hidden): no input since
   * the last good save, and that save is less than 90 % of an interval old. The margin keeps the
   * tick, which fires exactly one interval after the previous one, from skipping every other
   * round; programs that change files without input are still picked up at the next tick. A save
   * reads and compresses the whole home, which on a phone or tablet is the memory peak.
   */
  private savedRecently(): boolean {
    const last = this.snap.lastSave;
    const good = last && (last.result.status === 'saved' || last.result.status === 'unchanged');
    if (!good || this.snap.dirty || this.snap.saving) return false;
    return this.d.env.now() - last.at < this.d.autosaveMs * SAVED_RECENTLY;
  }

  /** What the unload prompt asks about. */
  isUnsaved(): boolean {
    const last = this.snap.lastSave;
    const ok = !last || last.result.status === 'saved' || last.result.status === 'unchanged';
    const since = this.d.env.now() - (last && ok ? last.at : this.readyAt);
    // With storage blocked (the in-memory fallback) closing the tab discards the home whatever
    // `dirty` says.
    const volatile = this.snap.storeKind === 'memory' && this.snap.desktopReady;
    return volatile || this.snap.dirty || this.snap.saving || !ok || since > this.d.autosaveMs;
  }

  /** The machine is no longer running (stopped, failed, powered off): nothing may save or prompt. */
  machineStopped(stage: 'stopped' | 'failed' = 'stopped') {
    if (this.running || this.snap.stage === 'handshake') this.stop(stage);
  }

  private stop(stage: 'stopped' | 'failed') {
    this.running = false;
    this.runTeardowns();
    this.set({
      stage,
      desktopReady: false,
    });
  }

  private runTeardowns() {
    for (const t of this.teardowns.splice(0).reverse()) t();
  }

  /**
   * `timeoutMs` bounds the whole call, not only the guest's answer: a save that joins one already
   * in flight (HomeSync runs one at a time) gets the same bound instead of inheriting that
   * save's own 120 s. A save that outlives its bound keeps running, but its late answer is
   * dropped here: it must not report anything once the caller has moved on.
   */
  async save(opts: SaveOptions = {}): Promise<SaveResult> {
    if (!this.running) return NOT_RUNNING;
    this.set({
      saving: true,
    });
    const epoch = this.inputEpoch;
    const generation = ++this.saveGeneration;
    let result: SaveResult;
    try {
      result = await this.bounded(this.d.sync.save(opts), opts.timeoutMs);
    } catch {
      result = {
        status: 'failed',
        code: 'share',
      };
    }
    // Stopped, disposed or superseded while it ran (power-off, a newer bounded save): say nothing.
    if (!this.running || generation !== this.saveGeneration) {
      if (generation === this.saveGeneration)
        this.set({
          saving: false,
        });
      return result;
    }
    const good = result.status === 'saved' || result.status === 'unchanged';
    this.set({
      saving: false,
      lastSave: {
        result,
        at: this.d.env.now(),
      },
      // Input that arrived while the save ran may not be in it: stay unsaved.
      ...(good && epoch === this.inputEpoch
        ? {
            dirty: false,
          }
        : {}),
    });
    return result;
  }

  private bounded(p: Promise<SaveResult>, ms: number | undefined): Promise<SaveResult> {
    if (ms === undefined) return p;
    const { env } = this.d;
    return new Promise<SaveResult>((resolve, reject) => {
      const timer = env.setTimeout(
        () =>
          resolve({
            status: 'failed',
            code: 'timeout',
          }),
        ms,
      );
      p.then(
        (r) => {
          env.clearTimeout(timer);
          resolve(r);
        },
        (e) => {
          env.clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  /**
   * The page is going away without a browser unload (a router navigation, a sign-out, an account
   * switch), so `beforeunload` will not ask: one bounded save, then say whether leaving loses
   * anything. True: nothing unsaved remains (or there was nothing to save). False: the person
   * should be asked. With storage blocked a "save" lands in memory that dies with the page, so it
   * never counts.
   */
  async saveBeforeLeaving(timeoutMs: number = LEAVE_SAVE_TIMEOUT_MS): Promise<boolean> {
    if (!this.running || !this.isUnsaved()) return true;
    if (this.snap.storeKind === 'memory') return false;
    const r = await this.save({
      timeoutMs,
    });
    // An empty home over a stored one is refused on purpose: nothing of value is lost by leaving.
    return r.status === 'saved' || r.status === 'unchanged' || (r.status === 'failed' && r.code === 'empty_home');
  }

  markDirty() {
    if (!this.running) return;
    this.inputEpoch += 1;
    if (!this.snap.dirty)
      this.set({
        dirty: true,
      });
  }

  /** The desktop's home straight from the guest (null when it is not running). Writes nothing. */
  async exportLive(): Promise<Uint8Array | null> {
    return this.running ? this.d.sync.exportLive() : null;
  }

  /**
   * Stores a backup (validated) in place of the home. This session's saves are suspended from
   * then on; the caller restarts the machine, which loads the backup.
   */
  async importBackup(gz: Uint8Array): Promise<void> {
    await this.d.sync.importArchive(gz);
  }

  /** After `corrupt`: keep the unreadable entry aside; the next start has an empty home. */
  startEmpty(): Promise<void> {
    return this.d.sync.discardDamaged();
  }

  /** Put the home a restored backup replaced back (then restart). */
  async putPreviousBack(): Promise<void> {
    try {
      await this.d.sync.putPreviousBack();
    } catch (e) {
      // Stale: it can never be put back now, so the button must not stay on screen.
      if (
        (
          e as {
            code?: unknown;
          }
        ).code === 'previous_stale'
      ) {
        this.set({
          previousAvailable: false,
          previousSavedAt: null,
        });
      }
      throw e;
    }
  }

  dispose() {
    if (this.disposed) return;
    // A save still in flight must not write after the next machine has loaded its own state.
    this.d.sync.suspend();
    this.running = false;
    this.runTeardowns();
    this.disposed = true;
  }
}
