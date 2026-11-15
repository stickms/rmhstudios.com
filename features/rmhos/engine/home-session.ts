/**
 * The orchestration around the home folder, with every side effect injected so it can be tested
 * without a browser or a machine. HomeSession owns: the handshake order, the rule that nothing is
 * saved before the guest's RESTORE succeeded (an early save could replace the stored archive with
 * an empty home), the autosave timer, the tab-hidden save, the unload prompt, the guest's
 * power-off, and taking all of that down again when the machine stops or the page leaves.
 *
 * Order: prepare() puts the stored tar in the share -> (cold boot only) wait for the guest's READY
 * -> SESSION -> RESTORE -> running. A stored archive that cannot be read stops the boot (`corrupt`):
 * the person decides; nothing is overwritten.
 */
import { AgentError, type AgentClient } from './agent';
import type { HomeSync, SaveResult } from './home-sync';

export type SessionStage = 'idle' | 'handshake' | 'running' | 'failed' | 'stopped';
export type SessionFailure = 'handshake' | 'corrupt';

export interface SessionSnapshot {
  stage: SessionStage;
  failure: SessionFailure | null;
  error: string | null;
  /** RESTORE succeeded and the machine is still up: saving is allowed. */
  desktopReady: boolean;
  saving: boolean;
  /** The guest was used since the last good save. */
  dirty: boolean;
  lastSave: { result: SaveResult; at: number } | null;
  storeKind: 'indexeddb' | 'memory';
  /** After a failed handshake: a home that a restored backup replaced is still there to put back. */
  previousAvailable: boolean;
}

interface Listenable {
  addEventListener(type: string, cb: (ev: Event) => void): void;
  removeEventListener(type: string, cb: (ev: Event) => void): void;
}

export interface SessionEnv {
  now(): number;
  setInterval(cb: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  doc: Listenable & { readonly visibilityState: string };
  win: Listenable;
}

export function browserEnv(): SessionEnv {
  return {
    now: () => Date.now(),
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    doc: document,
    win: window,
  };
}

export interface SessionDeps {
  agent: Pick<AgentClient, 'waitReady' | 'startSession' | 'restore' | 'onPoweroff'>;
  sync: Pick<
    HomeSync,
    | 'prepare'
    | 'save'
    | 'importArchive'
    | 'discardDamaged'
    | 'exportArchive'
    | 'exportLive'
    | 'storedInfo'
    | 'suspend'
    | 'hasReplaced'
    | 'putPreviousBack'
    | 'storeKind'
  >;
  bootKind: 'snapshot' | 'cold';
  linuxUser: string;
  autosaveMs: number;
  env: SessionEnv;
  onChange: (s: SessionSnapshot) => void;
}

const NOT_RUNNING: SaveResult = { status: 'failed', code: 'not-running' };
const READY_TIMEOUT_MS = 120_000;
const POWEROFF_SAVE_TIMEOUT_MS = 10_000;

export class HomeSession {
  private snap: SessionSnapshot = {
    stage: 'idle',
    failure: null,
    error: null,
    desktopReady: false,
    saving: false,
    dirty: false,
    lastSave: null,
    storeKind: 'indexeddb',
    previousAvailable: false,
  };
  private running = false;
  private disposed = false;
  private inputEpoch = 0;
  private readyAt = 0;
  private teardowns: Array<() => void> = [];

  constructor(private readonly d: SessionDeps) {}

  get snapshot(): SessionSnapshot {
    return this.snap;
  }

  private set(patch: Partial<SessionSnapshot>) {
    if (this.disposed) return;
    this.snap = { ...this.snap, ...patch };
    this.d.onChange(this.snap);
  }

  async start(): Promise<void> {
    const { sync, agent } = this.d;
    this.set({ stage: 'handshake' });
    try {
      const outcome = await sync.prepare();
      this.set({ storeKind: sync.storeKind });
      if (this.disposed) return;
      if (outcome === 'corrupt') {
        this.set({ stage: 'failed', failure: 'corrupt', error: 'stored home unreadable' });
        return;
      }
      if (this.d.bootKind === 'cold') await agent.waitReady(READY_TIMEOUT_MS);
      await agent.startSession(this.d.linuxUser);
      await agent.restore();
    } catch (e) {
      const previousAvailable = await sync.hasReplaced().catch(() => false);
      this.set({
        stage: 'failed',
        failure: 'handshake',
        error: e instanceof AgentError ? `agent: ${e.code}` : 'could not start the session',
        previousAvailable,
      });
      return;
    }
    if (this.disposed) return;
    this.begin();
  }

  private begin() {
    const { env, agent } = this.d;
    this.running = true;
    this.readyAt = env.now();
    this.set({ stage: 'running', desktopReady: true });

    const timer = env.setInterval(() => void this.save(), this.d.autosaveMs);
    this.teardowns.push(() => env.clearInterval(timer));

    const onVisibility = () => {
      if (env.doc.visibilityState === 'hidden') void this.save();
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

    // The guest is going down: one short, best-effort save while the agent may still answer.
    this.teardowns.push(
      agent.onPoweroff(() => {
        void this.save({ timeoutMs: POWEROFF_SAVE_TIMEOUT_MS }).finally(() => this.stop('stopped'));
      }),
    );
  }

  /** What the unload prompt asks about. */
  isUnsaved(): boolean {
    const last = this.snap.lastSave;
    const ok = !last || last.result.status === 'saved' || last.result.status === 'unchanged';
    const since = this.d.env.now() - (last && ok ? last.at : this.readyAt);
    return this.snap.dirty || this.snap.saving || !ok || since > this.d.autosaveMs;
  }

  /** The machine is no longer running (stopped, failed, powered off): nothing may save or prompt. */
  machineStopped(stage: 'stopped' | 'failed' = 'stopped') {
    if (this.running || this.snap.stage === 'handshake') this.stop(stage);
  }

  private stop(stage: 'stopped' | 'failed') {
    this.running = false;
    this.runTeardowns();
    this.set({ stage, desktopReady: false });
  }

  private runTeardowns() {
    for (const t of this.teardowns.splice(0).reverse()) t();
  }

  async save(opts: { timeoutMs?: number; allowEmpty?: boolean } = {}): Promise<SaveResult> {
    if (!this.running) return NOT_RUNNING;
    this.set({ saving: true });
    const epoch = this.inputEpoch;
    let result: SaveResult;
    try {
      result = await this.d.sync.save(opts);
    } catch {
      result = { status: 'failed', code: 'share' };
    }
    const good = result.status === 'saved' || result.status === 'unchanged';
    this.set({
      saving: false,
      lastSave: { result, at: this.d.env.now() },
      // Input that arrived while the save ran may not be in it: stay unsaved.
      ...(good && epoch === this.inputEpoch ? { dirty: false } : {}),
    });
    return result;
  }

  markDirty() {
    if (!this.running) return;
    this.inputEpoch += 1;
    if (!this.snap.dirty) this.set({ dirty: true });
  }

  exportArchive(): Promise<Uint8Array | null> {
    return this.d.sync.exportArchive();
  }

  /** The stored archive with its save time (for offering a stale copy by name). */
  storedInfo(): Promise<{ archive: Uint8Array; savedAt: number } | null> {
    return this.d.sync.storedInfo();
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
  putPreviousBack(): Promise<void> {
    return this.d.sync.putPreviousBack();
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
