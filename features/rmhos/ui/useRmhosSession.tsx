/**
 * The rmhOS session as React state: boots the machine, and hands the home-folder orchestration
 * (identity handshake, RESTORE, saves, unload prompt, power-off) to HomeSession
 * (../engine/home-session.ts), which is where the rules and their tests live.
 * `useRmhosMachine` runs it once, in RmhosApp, which passes what its children need as props.
 *
 * Guards that protect the stored archive (the only copy of the person's files):
 *  - one machine per account per browser: a Web Lock is taken before anything boots;
 *  - one IndexedDB store per mount, closed on unmount (a restart keeps the same store);
 *  - the session's saves are suspended after a backup import, so a restart (a new HomeSync) is
 *    the only way on.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { CDN_BASE } from '@/lib/storage/asset';
import { AgentClient } from '../engine/agent';
import { RMHOS } from '../engine/constants';
import {
  browserEnv,
  HomeSession,
  LEAVE_SAVE_TIMEOUT_MS,
  type SessionSnapshot,
} from '../engine/home-session';
import {
  HomeSync,
  importWithoutMachine,
  type CopyKind,
  type SaveResult,
  type StoredCopies,
} from '../engine/home-sync';
import { resolveImageManifest } from '../engine/image-manifest';
import { createTicketHolder } from '../engine/relay-ticket';
import {
  accountChange,
  leaveAccount,
  machineStep,
} from '../engine/session-loss';
import type { RmhosSession as RmhosSessionAnswer } from '../engine/rmhos.contract';
import {
  holdHomeLock,
  type HomeLock,
} from '../engine/tab-lock';
import {
  BootFailure,
  createVm,
} from '../engine/vm';
import type {
  BootFailureReason,
  VmHandle,
  VmPhase,
  VmPhaseDetail,
} from '../engine/vm-types';
import { displayLinuxUser } from './about-facts';
import { rmhosSessionQuery } from './rmhos.queries';
import { useStoredHome } from './useStoredHome';
import {
  createPollGate,
  initialTracker,
  POLL_MS,
  type PolledNet,
  statusSample,
  statusUrl,
  trackNet,
} from './net-status';

/** The machine's phases, plus `session` while the guest is being told who is signing in. */
export type RmhosPhase =
  | VmPhase
  | 'session';

/**
 * Why the machine is in `failed`: `load` (image, emulator or session request), `handshake` (the
 * guest started but the sign-in/restore did not finish), `corrupt` (the stored home cannot be
 * read), `locked` (another tab of this account is running rmhOS).
 */
export type RmhosFailure =
  | 'load'
  | 'handshake'
  | 'corrupt'
  | 'locked';

export interface RmhosSessionValue {
  phase: RmhosPhase;
  detail:
    | VmPhaseDetail
    | undefined;
  failure: RmhosFailure | null;
  /** The guest's RESTORE succeeded: the desktop is up and saving is safe. False again after power-off. */
  desktopReady: boolean;
  /** The guest was used (keys, pointer) since the last good save. */
  dirty: boolean;
  /** Call on input to the guest screen. */
  markDirty: () => void;
  /** Keys go to the guest only while the screen has focus (v86 would otherwise take them page-wide). */
  setKeyboardCapture: (
    on: boolean,
  ) => void;
  /** Key-up for every modifier: call when focus leaves the screen mid-chord. */
  releaseModifiers: () => void;
  lastSave: {
    result: SaveResult;
    at: number;
  } | null;
  saving: boolean;
  /** 'memory': this browser blocks storage, so nothing is kept after the page closes. */
  storeKind:
    | 'indexeddb'
    | 'memory';
  /** `allowEmpty`: store an empty home over a non-empty one (only on the person's say-so). */
  saveNow: (opts?: {
    allowEmpty?: boolean;
  }) => Promise<SaveResult>;
  /** The stored archive, byte for byte (also when it is damaged). Needs no machine. */
  exportArchive: () => Promise<Uint8Array | null>;
  /** The stored archive with when it was saved. */
  exportStored: () => Promise<{
    bytes: Uint8Array;
    savedAt: number;
  } | null>;
  /** After a failed handshake: the home a restored backup replaced can be put back. */
  previousAvailable: boolean;
  /** When the files that could be put back were saved (with `previousAvailable`). */
  previousSavedAt:
    | number
    | null;
  /** What is stored for this account: the current archive and the two extra copies. */
  storedCopies: () => Promise<StoredCopies | null>;
  exportCopy: (
    kind: CopyKind,
  ) => Promise<Uint8Array | null>;
  removeCopy: (
    kind:
      | 'replaced'
      | 'damaged',
  ) => Promise<void>;
  /** Puts the replaced home back as the stored one; restart (without saving) afterwards. */
  putPreviousBack: () => Promise<void>;
  /**
   * Stops this tab's machine (no save) and deletes everything stored for the account: the current
   * archive, the replaced copy and the damaged copy. "Restart" brings the machine back, empty.
   */
  deleteAllFiles: () => Promise<void>;
  /** The desktop's home straight from the guest, writing nothing: a backup when saving is refused. */
  exportLive: () => Promise<Uint8Array | null>;
  /** Validates and stores a backup. Saves are suspended afterwards: restart (without saving). */
  importArchive: (
    gz: Uint8Array,
  ) => Promise<void>;
  /** After `corrupt`: keeps the unreadable entry aside; the next start has an empty home. */
  startEmpty: () => Promise<void>;
  /**
   * Starts over with a fresh machine and handshake. It never saves first: every caller either has
   * no machine, or is leaving the current home behind on purpose (an imported backup would be
   * replaced by a save of the current one).
   */
  restart: () => Promise<void>;
  /** The session ended (or there never was one) and no machine is left: show the sign-in panel. */
  signedOut: boolean;
  /** Unsaved changes would be lost by leaving now (the unload prompt's rule). */
  isUnsaved: () => boolean;
  /**
   * One bounded save (15 s), for a navigation the browser will not warn about. True: safe to
   * leave. False: the save did not land and the person should be asked.
   */
  saveBeforeLeaving: () => Promise<boolean>;
  linuxUser:
    | string
    | null;
  net:
    | RmhosSessionAnswer['net']
    | null;
  /** From the hub's status endpoint (see net-status.ts); only meaningful when `net.enabled`. */
  netState: PolledNet;
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

const NOT_RUNNING: SaveResult =
  {
    status:
      'failed',
    code: 'not-running',
  };

export function useRmhosMachine(
  screenRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
): RmhosSessionValue {
  const {
    data: account,
    isPending:
      accountPending,
  } =
    useSession();
  const userId =
    account
      ?.user
      ?.id ??
    null;
  // The account the machine runs for. It follows `userId` only after the old machine has had one
  // bounded save (see the effect below), so a sign-out or account switch cannot tear a running
  // machine down under its own unsaved files.
  const [
    machineUser,
    setMachineUser,
  ] =
    useState<
      | string
      | null
    >(
      userId,
    );
  const sessionQ =
    useQuery(
      {
        ...rmhosSessionQuery(
          machineUser,
        ),
        enabled:
          !!machineUser,
      },
    );
  const sessionRef =
    useRef(
      sessionQ.data,
    );
  sessionRef.current =
    sessionQ.data;
  const sessionReady =
    !sessionQ.isPending;

  const [
    phase,
    setPhase,
  ] =
    useState<RmhosPhase>(
      'idle',
    );
  const [
    detail,
    setDetail,
  ] =
    useState<
      | VmPhaseDetail
      | undefined
    >();
  const [
    failure,
    setFailure,
  ] =
    useState<RmhosFailure | null>(
      null,
    );
  const [
    snap,
    setSnap,
  ] =
    useState<SessionSnapshot | null>(
      null,
    );
  const [
    attempt,
    setAttempt,
  ] =
    useState(
      0,
    );
  /** The machine was stopped on purpose (deleting the files): nothing runs until Restart. */
  const [
    halted,
    setHalted,
  ] =
    useState(
      false,
    );
  useEffect(() => {
    if (
      import.meta
        .env
        .DEV
    )
      window.__rmhosPhase =
        phase;
  }, [
    phase,
  ]);

  /** The ticket the running machine was built with: the status poll uses the same credential. */
  const tickets =
    useRef(
      createTicketHolder(),
    );
  const [
    netState,
    setNetState,
  ] =
    useState<PolledNet>(
      'connecting',
    );
  const [
    netEnded,
    setNetEnded,
  ] =
    useState(
      false,
    );

  const runnerRef =
    useRef<HomeSession | null>(
      null,
    );
  const vmRef =
    useRef<VmHandle | null>(
      null,
    );
  // The account lock this tab holds right now (set once granted, cleared when the attempt is torn
  // down). A failed boot keeps it until the page leaves the failure; a restore on that screen must
  // use it, not ask for a second one and be refused by this very tab.
  const heldLockRef =
    useRef<{
      userId: string;
      lock: HomeLock;
    } | null>(
      null,
    );

  // One store for the life of the page, so a restart keeps the in-memory fallback's contents and
  // no restart leaks an IndexedDB connection. The stored files are read from it directly, so they
  // stay reachable whatever state the machine is in.
  const {
    getStore,
    stored,
  } =
    useStoredHome(
      userId,
    );

  // The session ended or the account changed (another tab signed out, the cookie expired, a
  // different account signed in): one bounded save for the OLD account, then the machine goes.
  // Without a browser unload nothing else would ask, and the effect below would dispose the
  // machine on the spot.
  useEffect(() => {
    if (
      accountChange(
        userId,
        machineUser,
        accountPending,
      ) ===
      'none'
    )
      return;
    let cancelled = false;
    void leaveAccount(
      runnerRef.current,
      LEAVE_SAVE_TIMEOUT_MS,
      () =>
        cancelled,
      () =>
        setMachineUser(
          userId,
        ),
    );
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    machineUser,
    accountPending,
  ]);
  const signedOut =
    !accountPending &&
    !userId &&
    machineUser ===
      null;

  useEffect(() => {
    const step =
      machineStep(
        {
          machineUser,
          halted,
          enabled,
          sessionReady,
          hasScreen:
            !!screenRef.current,
        },
      );
    if (
      step ===
      'idle'
    ) {
      // No account (signed out, or not known yet): nothing runs, and nothing stale stays on
      // screen. The previous machine was torn down by the cleanup of the run before this one.
      setPhase(
        'idle',
      );
      setDetail(
        undefined,
      );
      setFailure(
        null,
      );
      setSnap(
        null,
      );
      return;
    }
    if (
      step ===
      'stopped'
    ) {
      setPhase(
        'stopped',
      );
      setDetail(
        undefined,
      );
      setSnap(
        null,
      );
      return;
    }
    if (
      step ===
      'wait'
    ) {
      // Not started yet, and what is on screen is not this account's: after a switch A to B the
      // phase and snapshot are still A's until B's session answers. Back to neutral at once.
      setPhase(
        'idle',
      );
      setDetail(
        undefined,
      );
      setFailure(
        null,
      );
      setSnap(
        null,
      );
      return;
    }
    const screen =
      screenRef.current;
    // `machineStep` said `run`: both exist (this narrows them for the compiler).
    if (
      !machineUser ||
      !screen
    )
      return;
    const userId =
      machineUser;
    const session =
      sessionRef.current;
    const ac =
      new AbortController();
    const cleanups: Array<
      () => void
    > =
      [];
    let cancelled = false;
    setDetail(
      undefined,
    );
    setFailure(
      null,
    );
    setSnap(
      null,
    );

    const fail =
      (
        error: string,
        kind: RmhosFailure = 'load',
        reason?: BootFailureReason,
      ) => {
        if (
          cancelled
        )
          return;
        setFailure(
          kind,
        );
        setPhase(
          'failed',
        );
        setDetail(
          reason
            ? {
                error,
                reason,
              }
            : {
                error,
              },
        );
      };

    if (
      !session
    ) {
      fail(
        'could not load the session',
      );
      return;
    }
    // RmhosApp shows the coming-soon panel instead of this machine when nothing is published.
    const manifest =
      resolveImageManifest(
        CDN_BASE ||
          undefined,
      );
    if (
      !manifest
    ) {
      fail(
        'no image published',
      );
      return;
    }
    setPhase(
      'downloading',
    );

    void (async () => {
      try {
        // One machine per account per browser, held for the life of this one.
        // Released by the cleanup even when that runs while the request is still pending.
        const held =
          holdHomeLock(
            userId,
          );
        cleanups.push(
          () =>
            held.release(),
        );
        const lock =
          await held.ready;
        if (
          !lock
        ) {
          fail(
            'another tab',
            'locked',
          );
          return;
        }
        heldLockRef.current =
          {
            userId,
            lock,
          };
        cleanups.push(
          () => {
            if (
              heldLockRef
                .current
                ?.lock ===
              lock
            )
              heldLockRef.current =
                null;
          },
        );
        if (
          cancelled
        )
          return;

        // The relay ticket is good for 60 s of first use and v86 bakes it in when the machine is
        // built, so it is fetched when createVm asks (after the emulator module has loaded), not
        // at page load. Whether the relay is on at all is the page-load answer.
        // The run keeps its ticket to itself and publishes it for the status poll only once its
        // machine exists and it is still the newest run.
        const run =
          tickets.current.begin();
        const getNet =
          async () =>
            session
              .net
              .enabled
              ? run.fetch()
              : null;
        const vm =
          await createVm(
            {
              screen,
              manifest,
              net: getNet,
              signal:
                ac.signal,
            },
          );
        if (
          cancelled
        ) {
          vm.destroy();
          return;
        }
        run.publish();
        cleanups.push(
          () =>
            run.release(),
        );
        vmRef.current =
          vm;
        cleanups.push(
          () => {
            if (
              vmRef.current ===
              vm
            )
              vmRef.current =
                null;
            vm.destroy();
          },
        );
        if (
          import.meta
            .env
            .DEV
        ) {
          window.__rmhosVm =
            vm;
          cleanups.push(
            () =>
              delete window.__rmhosVm,
          );
        }
        // Subscribed before the guest can say anything: READY and later lines are latched/parsed.
        const agent =
          new AgentClient(
            vm,
          );
        cleanups.push(
          () =>
            agent.dispose(),
        );
        const sync =
          new HomeSync(
            {
              userId,
              vm,
              agent,
              store:
                getStore(),
            },
          );

        let runner: HomeSession | null =
          null;
        const startRunner =
          () => {
            runner =
              new HomeSession(
                {
                  agent,
                  sync,
                  linuxUser:
                    session.linuxUser,
                  autosaveMs:
                    RMHOS.autosaveMs,
                  env: browserEnv(),
                  onChange:
                    (
                      s,
                    ) => {
                      if (
                        cancelled
                      )
                        return;
                      setSnap(
                        s,
                      );
                      if (
                        s.stage ===
                        'handshake'
                      )
                        setPhase(
                          'session',
                        );
                      else if (
                        s.stage ===
                        'running'
                      )
                        setPhase(
                          'running',
                        );
                      else if (
                        s.stage ===
                          'failed' &&
                        s.failure
                      ) {
                        setFailure(
                          s.failure,
                        );
                        setPhase(
                          'failed',
                        );
                        setDetail(
                          {
                            error:
                              s.error ??
                              '',
                          },
                        );
                      } else if (
                        s.stage ===
                        'stopped'
                      )
                        setPhase(
                          'stopped',
                        );
                    },
                },
              );
            runnerRef.current =
              runner;
            cleanups.push(
              () => {
                runner?.dispose();
                if (
                  runnerRef.current ===
                  runner
                )
                  runnerRef.current =
                    null;
              },
            );
            if (
              import.meta
                .env
                .DEV
            ) {
              window.__rmhosSave =
                () =>
                  runner!.save();
              cleanups.push(
                () =>
                  delete window.__rmhosSave,
              );
            }
            void runner.start();
          };

        let started = false;
        cleanups.push(
          vm.onPhase(
            (
              p,
              d,
            ) => {
              if (
                cancelled
              )
                return;
              if (
                p ===
                'running'
              ) {
                if (
                  !started
                ) {
                  started = true;
                  startRunner();
                }
                return;
              }
              // The machine went away after running: nothing may save or prompt any more.
              if (
                started &&
                (p ===
                  'stopped' ||
                  p ===
                    'failed')
              )
                runner?.machineStopped(
                  p,
                );
              setPhase(
                p,
              );
              setDetail(
                d,
              );
              if (
                p ===
                'failed'
              )
                setFailure(
                  'load',
                );
            },
          ),
        );
      } catch (err) {
        if (
          err instanceof
            DOMException &&
          err.name ===
            'AbortError'
        )
          return;
        if (
          err instanceof
          BootFailure
        )
          return fail(
            err.message,
            'load',
            err.reason,
          );
        fail(
          err instanceof
            Error
            ? err.message
            : String(
                err,
              ),
        );
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      for (const c of cleanups.reverse())
        c();
    };
  }, [
    enabled,
    machineUser,
    sessionReady,
    attempt,
    halted,
    screenRef,
    getStore,
  ]);

  // Network state from the hub: once the desktop is up, then every 15 s while the tab is visible.
  const desktopReady =
    snap?.desktopReady ??
    false;
  useEffect(() => {
    setNetState(
      'connecting',
    );
    setNetEnded(
      false,
    );
    if (
      !desktopReady ||
      !tickets
        .current
        .current
    )
      return;
    let tracker =
      initialTracker;
    let stopped = false;
    const poll =
      async () => {
        const n =
          tickets
            .current
            .current;
        if (
          !n ||
          stopped ||
          document.visibilityState !==
            'visible'
        )
          return;
        let result: ReturnType<
          typeof statusSample
        > =
          'failed';
        try {
          const r =
            await fetch(
              statusUrl(
                n.url,
                n.ticket,
              ),
              {
                cache:
                  'no-store',
              },
            );
          const body =
            r.ok
              ? ((await r.json()) as {
                  connected?: unknown;
                  full?: unknown;
                })
              : null;
          // 401: the hub dropped this ticket. 429: no information, nothing changes.
          result =
            statusSample(
              r.status,
              body,
            );
        } catch {
          // counted as a failed poll
        }
        if (
          stopped ||
          result ===
            null
        )
          return;
        const next =
          trackNet(
            tracker,
            {
              at: Date.now(),
              result,
            },
          );
        tracker =
          next.tracker;
        setNetState(
          next.state,
        );
        if (
          next.ended
        ) {
          setNetEnded(
            true,
          );
          stopped = true;
          clearInterval(
            timer,
          );
        }
      };
    void poll();
    const timer: ReturnType<
      typeof setInterval
    > =
      setInterval(
        () =>
          void poll(),
        POLL_MS,
      );
    // Visibility changes can fire in bursts: at most one poll per 5 s from them.
    const gate =
      createPollGate(
        5000,
      );
    const onVisible =
      () => {
        if (
          gate(
            Date.now(),
          )
        )
          void poll();
      };
    document.addEventListener(
      'visibilitychange',
      onVisible,
    );
    return () => {
      stopped = true;
      clearInterval(
        timer,
      );
      document.removeEventListener(
        'visibilitychange',
        onVisible,
      );
    };
  }, [
    desktopReady,
    attempt,
  ]);

  const restart =
    useCallback(async () => {
      await sessionQ.refetch(); // a fresh relay ticket for the new machine
      setHalted(
        false,
      );
      setAttempt(
        (
          n,
        ) =>
          n +
          1,
      );
    }, [
      sessionQ,
    ]);

  return {
    phase,
    detail,
    failure,
    desktopReady,
    dirty:
      snap?.dirty ??
      false,
    markDirty:
      useCallback(
        () =>
          runnerRef.current?.markDirty(),
        [],
      ),
    setKeyboardCapture:
      useCallback(
        (
          on: boolean,
        ) =>
          vmRef.current?.setKeyboardCapture(
            on,
          ),
        [],
      ),
    releaseModifiers:
      useCallback(
        () =>
          vmRef.current?.releaseModifiers(),
        [],
      ),
    lastSave:
      snap?.lastSave ??
      null,
    saving:
      snap?.saving ??
      false,
    storeKind:
      snap?.storeKind ??
      'indexeddb',
    saveNow:
      useCallback(
        async (opts?: {
          allowEmpty?: boolean;
        }) =>
          (await runnerRef.current?.save(
            opts ??
              {},
          )) ??
          NOT_RUNNING,
        [],
      ),
    exportArchive:
      useCallback(
        () =>
          stored.exportCopy(
            'current',
          ),
        [
          stored,
        ],
      ),
    exportStored:
      useCallback(async () => {
        const info =
          await stored.info();
        return info
          ? {
              bytes:
                info.archive,
              savedAt:
                info.savedAt,
            }
          : null;
      }, [
        stored,
      ]),
    previousAvailable:
      snap?.previousAvailable ??
      false,
    previousSavedAt:
      snap?.previousSavedAt ??
      null,
    storedCopies:
      stored.copies,
    exportCopy:
      stored.exportCopy,
    removeCopy:
      stored.removeCopy,
    putPreviousBack:
      useCallback(async () => {
        if (
          !runnerRef.current
        )
          throw new Error(
            'rmhOS is not running',
          );
        await runnerRef.current.putPreviousBack();
      }, []),
    exportLive:
      useCallback(
        async () =>
          runnerRef.current?.exportLive() ??
          null,
        [],
      ),
    importArchive:
      useCallback(
        async (
          gz: Uint8Array,
        ) => {
          if (
            runnerRef.current
          )
            return runnerRef.current.importBackup(
              gz,
            );
          // No machine (stopped on purpose, or powered off): the store alone takes the backup, and
          // the caller's restart loads it.
          if (
            !machineUser
          )
            throw new Error(
              'not signed in',
            );
          await importWithoutMachine(
            machineUser,
            getStore(),
            gz,
            {
              held:
                heldLockRef
                  .current
                  ?.userId ===
                machineUser
                  ? heldLockRef
                      .current
                      .lock
                  : null,
            },
          );
        },
        [
          machineUser,
          getStore,
        ],
      ),
    startEmpty:
      useCallback(async () => {
        if (
          !runnerRef.current
        )
          throw new Error(
            'rmhOS is not running',
          );
        await runnerRef.current.startEmpty();
      }, []),
    restart,
    deleteAllFiles:
      useCallback(async () => {
        // Stop first: a machine that is still up would save the files straight back. Disposing the
        // runner suspends its sync at once; the delete is queued behind any write already issued.
        runnerRef.current?.dispose();
        setHalted(
          true,
        );
        await stored.deleteAll();
      }, [
        stored,
      ]),
    signedOut,
    isUnsaved:
      useCallback(
        () =>
          runnerRef.current?.isUnsaved() ??
          false,
        [],
      ),
    saveBeforeLeaving:
      useCallback(
        async () =>
          (await runnerRef.current?.saveBeforeLeaving()) ??
          true,
        [],
      ),
    // What the guest says it created, else what the site asked for.
    linuxUser:
      displayLinuxUser(
        snap?.linuxName ??
          null,
        sessionQ
          .data
          ?.linuxUser ??
          null,
      ),
    net:
      sessionQ
        .data
        ?.net ??
      null,
    netState,
    netEnded,
  };
}
