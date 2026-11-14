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
import type { RmhosNet } from '../engine/rmhos.contract';
import { acquireHomeLock } from '../engine/tab-lock';
import { createVm } from '../engine/vm';
import type { VmHandle, VmPhase, VmPhaseDetail } from '../engine/vm-types';
import { rmhosSessionQuery } from './rmhos.queries';

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
  lastSave: { result: SaveResult; at: number } | null;
  saving: boolean;
  /** 'memory': this browser blocks storage, so nothing is kept after the page closes. */
  storeKind: 'indexeddb' | 'memory';
  saveNow: () => Promise<SaveResult>;
  /** The stored archive, byte for byte (also when it is damaged). */
  exportArchive: () => Promise<Uint8Array | null>;
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

  const runnerRef = useRef<HomeSession | null>(null);

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
        const lock = await acquireHomeLock(userId);
        if (!lock) {
          fail('another tab', 'locked');
          return;
        }
        cleanups.push(() => lock.release());
        if (cancelled) return;

        const net = session.net.enabled
          ? { url: session.net.url, ticket: session.net.ticket }
          : null;
        const vm = await createVm({
          screen,
          manifest: resolveImageManifest(CDN_BASE || undefined),
          net,
          signal: ac.signal,
        });
        if (cancelled) {
          vm.destroy();
          return;
        }
        cleanups.push(() => vm.destroy());
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
    desktopReady: snap?.desktopReady ?? false,
    dirty: snap?.dirty ?? false,
    markDirty: useCallback(() => runnerRef.current?.markDirty(), []),
    lastSave: snap?.lastSave ?? null,
    saving: snap?.saving ?? false,
    storeKind: snap?.storeKind ?? 'indexeddb',
    saveNow: useCallback(async () => (await runnerRef.current?.save()) ?? NOT_RUNNING, []),
    exportArchive: useCallback(async () => runnerRef.current?.exportArchive() ?? null, []),
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
  };
}
