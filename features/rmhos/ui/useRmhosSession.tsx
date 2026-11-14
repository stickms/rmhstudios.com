/**
 * The rmhOS session: boots the machine, tells the guest who is signed in, restores the home
 * folder from this browser's storage, and saves it back (autosave, tab hidden, guest power-off).
 * `useRmhosMachine` runs it once, in RmhosApp; everything below it (the toolbar, dialogs) reads
 * the result with `useRmhosSession()`.
 *
 * Order matters and is the point of this file:
 *   create the machine -> (running) -> prepare() puts the stored tar in the share
 *   -> cold boot only: wait for the guest's READY (a snapshot restore never prints it again)
 *   -> SESSION -> RESTORE (extracts the tar, starts the desktop) -> desktop ready.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { CDN_BASE } from '@/lib/storage/asset';
import { AgentClient, AgentError } from '../engine/agent';
import { RMHOS } from '../engine/constants';
import { openHomeStore } from '../engine/home-store';
import { HomeSync, type SaveResult } from '../engine/home-sync';
import { resolveImageManifest } from '../engine/image-manifest';
import type { RmhosNet } from '../engine/rmhos.contract';
import { createVm } from '../engine/vm';
import type { VmHandle, VmPhase, VmPhaseDetail } from '../engine/vm-types';
import { rmhosSessionQuery } from './rmhos.queries';

/** The machine's phases, plus `session` while the guest is being told who is signing in. */
export type RmhosPhase = VmPhase | 'session';

export interface RmhosSessionValue {
  phase: RmhosPhase;
  detail: VmPhaseDetail | undefined;
  bootKind: 'snapshot' | 'cold' | null;
  lastSave: { result: SaveResult; at: number } | null;
  saving: boolean;
  saveNow: () => Promise<SaveResult>;
  exportArchive: () => Promise<Uint8Array | null>;
  importArchive: (gz: Uint8Array) => Promise<void>;
  /** Starts over: a best-effort save, then a fresh machine and handshake. */
  restart: () => Promise<void>;
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
  const sessionQ = useQuery(rmhosSessionQuery());
  const sessionRef = useRef(sessionQ.data);
  sessionRef.current = sessionQ.data;
  const sessionReady = !sessionQ.isPending;

  const [phase, setPhase] = useState<RmhosPhase>('idle');
  const [detail, setDetail] = useState<VmPhaseDetail | undefined>();
  const [bootKind, setBootKind] = useState<'snapshot' | 'cold' | null>(null);
  const [lastSave, setLastSave] = useState<RmhosSessionValue['lastSave']>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (import.meta.env.DEV) window.__rmhosPhase = phase;
  }, [phase]);
  const syncRef = useRef<HomeSync | null>(null);
  const runningRef = useRef(false);
  const lastSaveRef = useRef<RmhosSessionValue['lastSave']>(null);
  const readyAtRef = useRef(0);

  const record = useCallback((result: SaveResult) => {
    const entry = { result, at: Date.now() };
    lastSaveRef.current = entry;
    setLastSave(entry);
    return result;
  }, []);

  const saveWith = useCallback(
    async (timeoutMs?: number): Promise<SaveResult> => {
      const sync = syncRef.current;
      if (!sync || !runningRef.current) return NOT_RUNNING;
      setSaving(true);
      try {
        return record(await sync.save(timeoutMs === undefined ? {} : { timeoutMs }));
      } finally {
        setSaving(false);
      }
    },
    [record],
  );
  const saveNow = useCallback(() => saveWith(), [saveWith]);

  useEffect(() => {
    if (!enabled || !userId || !sessionReady || !screenRef.current) return;
    const session = sessionRef.current;
    if (!session) {
      setPhase('failed');
      setDetail({ error: 'could not load the session' });
      return;
    }
    const screen = screenRef.current;
    const ac = new AbortController();
    const cleanups: Array<() => void> = [];
    let cancelled = false;
    setPhase('downloading');
    setDetail(undefined);
    setBootKind(null);
    setLastSave(null);
    lastSaveRef.current = null;

    const fail = (error: string) => {
      if (cancelled) return;
      setPhase('failed');
      setDetail({ error });
    };

    void (async () => {
      try {
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
        const sync = new HomeSync({ userId, vm, agent, store: openHomeStore() });
        syncRef.current = sync;
        cleanups.push(() => {
          syncRef.current = null;
          runningRef.current = false;
        });

        const handshake = async () => {
          const kind = vm.bootKind();
          setBootKind(kind);
          setPhase('session');
          try {
            // The stored tar must be in the share before the guest is told to RESTORE.
            await sync.prepare();
            if (kind === 'cold') await agent.waitReady(120_000);
            await agent.startSession(session.linuxUser);
            await agent.restore();
          } catch (e) {
            if (!cancelled)
              fail(e instanceof AgentError ? `agent: ${e.code}` : 'could not start the session');
            return;
          }
          if (cancelled) return;
          runningRef.current = true;
          readyAtRef.current = Date.now();
          setPhase('running');
          if (import.meta.env.DEV) window.__rmhosSave = () => saveWith();

          const timer = setInterval(() => void saveWith(), RMHOS.autosaveMs);
          cleanups.push(() => clearInterval(timer));
          const onVisibility = () => {
            if (document.visibilityState === 'hidden') void saveWith();
          };
          document.addEventListener('visibilitychange', onVisibility);
          cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
          // Unsaved: the last save did not land (failed or storage full), or the last good save
          // (or, before any save, the desktop becoming ready) is older than one autosave interval.
          const onBeforeUnload = (ev: BeforeUnloadEvent) => {
            const last = lastSaveRef.current;
            const ok =
              !last || last.result.status === 'saved' || last.result.status === 'unchanged';
            const since = Date.now() - (last && ok ? last.at : readyAtRef.current);
            if (!ok || since > RMHOS.autosaveMs) {
              ev.preventDefault();
              ev.returnValue = '';
            }
          };
          window.addEventListener('beforeunload', onBeforeUnload);
          cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload));
          cleanups.push(
            agent.onPoweroff(() => {
              // The guest is going down: one short, best-effort save while the agent may still answer.
              void saveWith(10_000).finally(() => {
                runningRef.current = false;
              });
            }),
          );
        };

        let started = false;
        cleanups.push(
          vm.onPhase((p, d) => {
            if (cancelled) return;
            if (p === 'running') {
              if (!started) {
                started = true;
                void handshake();
              }
              return;
            }
            setPhase(p);
            setDetail(d);
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
  }, [enabled, userId, sessionReady, attempt, screenRef, saveWith]);

  const restart = useCallback(async () => {
    if (runningRef.current) await saveWith();
    await sessionQ.refetch(); // a fresh relay ticket for the new machine
    setAttempt((n) => n + 1);
  }, [saveWith, sessionQ]);

  return {
    phase,
    detail,
    bootKind,
    lastSave,
    saving,
    saveNow,
    exportArchive: useCallback(async () => syncRef.current?.exportArchive() ?? null, []),
    importArchive: useCallback(async (gz: Uint8Array) => {
      if (!syncRef.current) throw new Error('rmhOS is not running');
      await syncRef.current.importArchive(gz);
    }, []),
    restart,
    linuxUser: sessionQ.data?.linuxUser ?? null,
    net: sessionQ.data?.net ?? null,
  };
}
