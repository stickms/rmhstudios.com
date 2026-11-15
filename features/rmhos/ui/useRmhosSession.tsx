/**
 * The rmhOS session as React state: boots the machine, and hands the home-folder orchestration
 * (identity handshake, RESTORE, saves, unload prompt, power-off) to HomeSession
 * (../engine/home-session.ts), which is where the rules and their tests live.
 * `useRmhosMachine` runs it once, in RmhosApp; everything below it (the toolbar, dialogs) reads
 * the result with `useRmhosSession()`.
 *
 * Guards that protect the stored archive (the only copy of the person's files):
 *  - one machine per account per browser: a Web Lock is taken before anything boots;
 *  - one IndexedDB store per mount, closed on unmount (a restart keeps the same store);
 *  - the session's saves are suspended after a backup import, so a restart (a new HomeSync) is
 *    the only way on.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { CDN_BASE } from '@/lib/storage/asset';
import { AgentClient } from '../engine/agent';
import { RMHOS } from '../engine/constants';
import { browserEnv, HomeSession, type SessionSnapshot } from '../engine/home-session';
import { openHomeStore, type HomeStore } from '../engine/home-store';
import { HomeSync, type SaveResult } from '../engine/home-sync';
import { resolveImageManifest } from '../engine/image-manifest';
import { createTicketHolder } from '../engine/relay-ticket';
import type { RmhosNet } from '../engine/rmhos.contract';
import { holdHomeLock } from '../engine/tab-lock';
import { createVm } from '../engine/vm';
import type { VmHandle, VmPhase, VmPhaseDetail } from '../engine/vm-types';
import { rmhosSessionQuery } from './rmhos.queries';
import { initialTracker, POLL_MS, statusUrl, trackNet } from './net-status';

/** The machine's phases, plus `session` while the guest is being told who is signing in. */
export type RmhosPhase = VmPhase | 'session';

/**
 * Why the machine is in `failed`: `load` (image, emulator or session request), `handshake` (the
 * guest started but the sign-in/restore did not finish), `corrupt` (the stored home cannot be
 * read), `locked` (another tab of this account is running rmhOS).
 */
export type RmhosFailure = 'load' | 'handshake' | 'corrupt' | 'locked';

export interface RmhosSessionValue {
  phase: RmhosPhase;
  detail: VmPhaseDetail | undefined;
  bootKind: 'snapshot' | 'cold' | null;
  failure: RmhosFailure | null;
  /** The guest's RESTORE succeeded: the desktop is up and saving is safe. False again after power-off. */
  desktopReady: boolean;
  /** The guest was used (keys, pointer) since the last good save. */
  dirty: boolean;
  /** Call on input to the guest screen. */
  markDirty: () => void;
  /** Keys go to the guest only while the screen has focus (v86 would otherwise take them page-wide). */
  setKeyboardCapture: (on: boolean) => void;
  /** Key-up for every modifier: call when focus leaves the screen mid-chord. */
  releaseModifiers: () => void;
  lastSave: { result: SaveResult; at: number } | null;
  saving: boolean;
  /** 'memory': this browser blocks storage, so nothing is kept after the page closes. */
  storeKind: 'indexeddb' | 'memory';
  /** `allowEmpty`: store an empty home over a non-empty one (only on the person's say-so). */
  saveNow: (opts?: { allowEmpty?: boolean }) => Promise<SaveResult>;
  /** The stored archive, byte for byte (also when it is damaged). */
  exportArchive: () => Promise<Uint8Array | null>;
  /** The stored archive with when it was saved. */
  exportStored: () => Promise<{ bytes: Uint8Array; savedAt: number } | null>;
  /** After a failed handshake: the home a restored backup replaced can be put back. */
  previousAvailable: boolean;
  /** Puts the replaced home back as the stored one; restart (without saving) afterwards. */
  putPreviousBack: () => Promise<void>;
  /** The desktop's home straight from the guest, writing nothing: a backup when saving is refused. */
  exportLive: () => Promise<Uint8Array | null>;
  /** Validates and stores a backup. Saves are suspended afterwards: restart (without saving). */
  importArchive: (gz: Uint8Array) => Promise<void>;
  /** After `corrupt`: keeps the unreadable entry aside; the next start has an empty home. */
  startEmpty: () => Promise<void>;
  /**
   * Starts over: a best-effort save (unless `save: false`, which an imported backup needs: a save
   * would replace it with the current home), then a fresh machine and handshake.
   */
  restart: (opts?: { save?: boolean }) => Promise<void>;
  linuxUser: string | null;
  net: RmhosNet | null;
  /** From the hub's status endpoint (see net-status.ts); only meaningful when `net.enabled`. */
  netState: 'connecting' | 'on' | 'error';
  /** The hub no longer accepts this session's ticket (12 h cap, idle, evicted): restart to reconnect. */
  netEnded: boolean;
}

declare global {
  interface Window {
    /** Development only: lets a browser test drive the guest. */
    __rmhosVm?: VmHandle;
    __rmhosPhase?: RmhosPhase;
    __rmhosSave?: () => Promise<SaveResult>;
  }
}

const Ctx = createContext<RmhosSessionValue | null>(null);
export const RmhosSessionProvider = Ctx.Provider;

export function useRmhosSession(): RmhosSessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRmhosSession must be used inside RmhosApp');
  return v;
}

const NOT_RUNNING: SaveResult = { status: 'failed', code: 'not-running' };

export function useRmhosMachine(
  screenRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
): RmhosSessionValue {
  const { data: account } = useSession();
  const userId = account?.user?.id ?? null;
  const sessionQ = useQuery(rmhosSessionQuery(userId));
  const sessionRef = useRef(sessionQ.data);
  sessionRef.current = sessionQ.data;
  const sessionReady = !sessionQ.isPending;

  const [phase, setPhase] = useState<RmhosPhase>('idle');
  const [detail, setDetail] = useState<VmPhaseDetail | undefined>();
  const [bootKind, setBootKind] = useState<'snapshot' | 'cold' | null>(null);
  const [failure, setFailure] = useState<RmhosFailure | null>(null);
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (import.meta.env.DEV) window.__rmhosPhase = phase;
  }, [phase]);

  /** The ticket the running machine was built with: the status poll uses the same credential. */
  const tickets = useRef(createTicketHolder());
  const [netState, setNetState] = useState<'connecting' | 'on' | 'error'>('connecting');
  const [netEnded, setNetEnded] = useState(false);

  const runnerRef = useRef<HomeSession | null>(null);
  const vmRef = useRef<VmHandle | null>(null);

  // One store for the life of the page, so a restart keeps the in-memory fallback's contents and
  // no restart leaks an IndexedDB connection. Closed on unmount.
  const storeRef = useRef<HomeStore | null>(null);
  const getStore = () => (storeRef.current ??= openHomeStore());
  useEffect(
    () => () => {
      storeRef.current?.close();
      storeRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !userId || !sessionReady || !screenRef.current) return;
    const session = sessionRef.current;
    const screen = screenRef.current;
    const ac = new AbortController();
    const cleanups: Array<() => void> = [];
    let cancelled = false;
    setDetail(undefined);
    setBootKind(null);
    setFailure(null);
    setSnap(null);

    const fail = (error: string, kind: RmhosFailure = 'load') => {
      if (cancelled) return;
      setFailure(kind);
      setPhase('failed');
      setDetail({ error });
    };

    if (!session) {
      fail('could not load the session');
      return;
    }
    setPhase('downloading');

    void (async () => {
      try {
        // One machine per account per browser, held for the life of this one.
        // Released by the cleanup even when that runs while the request is still pending.
        const held = holdHomeLock(userId);
        cleanups.push(() => held.release());
        const lock = await held.ready;
        if (!lock) {
          fail('another tab', 'locked');
          return;
        }
        if (cancelled) return;

        // The relay ticket is good for 60 s of first use and v86 bakes it in when the machine is
        // built, so it is fetched when createVm asks (after the emulator module has loaded), not
        // at page load. Whether the relay is on at all is the page-load answer.
        // The run keeps its ticket to itself and publishes it for the status poll only once its
        // machine exists and it is still the newest run.
        const run = tickets.current.begin();
        const getNet = async () => (session.net.enabled ? run.fetch() : null);
        const vm = await createVm({
          screen,
          manifest: resolveImageManifest(CDN_BASE || undefined),
          net: getNet,
          signal: ac.signal,
        });
        if (cancelled) {
          vm.destroy();
          return;
        }
        run.publish();
        cleanups.push(() => run.release());
        vmRef.current = vm;
        cleanups.push(() => {
          if (vmRef.current === vm) vmRef.current = null;
          vm.destroy();
        });
        if (import.meta.env.DEV) {
          window.__rmhosVm = vm;
          cleanups.push(() => delete window.__rmhosVm);
        }
        // Subscribed before the guest can say anything: READY and later lines are latched/parsed.
        const agent = new AgentClient(vm);
        cleanups.push(() => agent.dispose());
        const sync = new HomeSync({ userId, vm, agent, store: getStore() });

        let runner: HomeSession | null = null;
        const startRunner = () => {
          setBootKind(vm.bootKind());
          runner = new HomeSession({
            agent,
            sync,
            bootKind: vm.bootKind(),
            linuxUser: session.linuxUser,
            autosaveMs: RMHOS.autosaveMs,
            env: browserEnv(),
            onChange: (s) => {
              if (cancelled) return;
              setSnap(s);
              if (s.stage === 'handshake') setPhase('session');
              else if (s.stage === 'running') setPhase('running');
              else if (s.stage === 'failed' && s.failure) {
                setFailure(s.failure);
                setPhase('failed');
                setDetail({ error: s.error ?? '' });
              } else if (s.stage === 'stopped') setPhase('stopped');
            },
          });
          runnerRef.current = runner;
          cleanups.push(() => {
            runner?.dispose();
            if (runnerRef.current === runner) runnerRef.current = null;
          });
          if (import.meta.env.DEV) window.__rmhosSave = () => runner!.save();
          void runner.start();
        };

        let started = false;
        cleanups.push(
          vm.onPhase((p, d) => {
            if (cancelled) return;
            if (p === 'running') {
              if (!started) {
                started = true;
                startRunner();
              }
              return;
            }
            // The machine went away after running: nothing may save or prompt any more.
            if (started && (p === 'stopped' || p === 'failed')) runner?.machineStopped(p);
            setPhase(p);
            setDetail(d);
            if (p === 'failed') setFailure('load');
          }),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        fail(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      for (const c of cleanups.reverse()) c();
    };
  }, [enabled, userId, sessionReady, attempt, screenRef]);

  // Network state from the hub: once the desktop is up, then every 15 s while the tab is visible.
  const desktopReady = snap?.desktopReady ?? false;
  useEffect(() => {
    setNetState('connecting');
    setNetEnded(false);
    if (!desktopReady || !tickets.current.current) return;
    let tracker = initialTracker;
    let stopped = false;
    const poll = async () => {
      const n = tickets.current.current;
      if (!n || stopped || document.visibilityState !== 'visible') return;
      let result: { connected: boolean } | 'failed' | 'ended' = 'failed';
      try {
        const r = await fetch(statusUrl(n.url, n.ticket), { cache: 'no-store' });
        if (r.ok) {
          const body = (await r.json()) as { connected?: unknown };
          result = { connected: body.connected === true };
        } else if (r.status === 401) {
          result = 'ended'; // the hub dropped this ticket; v86's reconnects will be refused too
        }
      } catch {
        // counted as a failed poll
      }
      if (stopped) return;
      const next = trackNet(tracker, { at: Date.now(), result });
      tracker = next.tracker;
      setNetState(next.state);
      if (next.ended) {
        setNetEnded(true);
        stopped = true;
        clearInterval(timer);
      }
    };
    void poll();
    const timer: ReturnType<typeof setInterval> = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [desktopReady, attempt]);

  const restart = useCallback(
    async (opts?: { save?: boolean }) => {
      if (opts?.save !== false) await runnerRef.current?.save();
      await sessionQ.refetch(); // a fresh relay ticket for the new machine
      setAttempt((n) => n + 1);
    },
    [sessionQ],
  );

  return {
    phase,
    detail,
    bootKind,
    failure,
    desktopReady,
    dirty: snap?.dirty ?? false,
    markDirty: useCallback(() => runnerRef.current?.markDirty(), []),
    setKeyboardCapture: useCallback((on: boolean) => vmRef.current?.setKeyboardCapture(on), []),
    releaseModifiers: useCallback(() => vmRef.current?.releaseModifiers(), []),
    lastSave: snap?.lastSave ?? null,
    saving: snap?.saving ?? false,
    storeKind: snap?.storeKind ?? 'indexeddb',
    saveNow: useCallback(
      async (opts?: { allowEmpty?: boolean }) =>
        (await runnerRef.current?.save(opts ?? {})) ?? NOT_RUNNING,
      [],
    ),
    exportArchive: useCallback(async () => runnerRef.current?.exportArchive() ?? null, []),
    exportStored: useCallback(async () => {
      const info = await runnerRef.current?.storedInfo();
      return info ? { bytes: info.archive, savedAt: info.savedAt } : null;
    }, []),
    previousAvailable: snap?.previousAvailable ?? false,
    putPreviousBack: useCallback(async () => {
      if (!runnerRef.current) throw new Error('rmhOS is not running');
      await runnerRef.current.putPreviousBack();
    }, []),
    exportLive: useCallback(async () => runnerRef.current?.exportLive() ?? null, []),
    importArchive: useCallback(async (gz: Uint8Array) => {
      if (!runnerRef.current) throw new Error('rmhOS is not running');
      await runnerRef.current.importBackup(gz);
    }, []),
    startEmpty: useCallback(async () => {
      if (!runnerRef.current) throw new Error('rmhOS is not running');
      await runnerRef.current.startEmpty();
    }, []),
    restart,
    linuxUser: sessionQ.data?.linuxUser ?? null,
    net: sessionQ.data?.net ?? null,
    netState,
    netEnded,
  };
}
