/**
 * Balatro multiplayer — lobby invites through the hub (LOB-04; WS12).
 *
 * Sending: `balatro:invite {code, toUserId}`. The hub only lets a seated
 * player invite a mutual follow into its own lobby, budgets invites per
 * account, delivers `balatro:invited` live and leaves a notification for an
 * invitee with no hub connection (handlers/balatro-queue.ts). The contract
 * has no success acknowledgement, so the outcome of an invite is "no error
 * within `INVITE_SETTLE_MS`"; invites are sent one at a time so an error is
 * never pinned on the wrong friend.
 *
 * Receiving: every `balatro:invited` lands in a small inbox (newest first,
 * one per lobby code) the page and Lua can show; accepting one is an ordinary
 * join by code.
 *
 * The React side (components/balatro/mp/InviteFriends.tsx) reaches the live
 * session through the module-level registry (`setActiveInviter`), because the
 * toolbar is mounted outside the session runtime. Browser-free and zod-free
 * (it is in the MP chunk; the hub client already validated every payload).
 */

import type { BalatroS2CPayload } from '../net/events';
import type { HubLike, Scheduler } from './transport/types';

export const INVITE_SETTLE_MS = 2_500;
export const INBOX_MAX = 8;
/** An invite older than this is dropped from the inbox (the lobby has likely moved on). */
export const INBOX_TTL_MS = 10 * 60_000;

export type InviteOutcome =
  | 'sent'
  | 'not-friends'
  | 'not-found'
  | 'rate-limited'
  | 'auth-required'
  | 'offline'
  | 'failed';

export interface ReceivedInvite {
  code: string;
  fromUserId: string;
  fromName: string;
  at: number;
}

export interface InviterState {
  /** userId → the last outcome (or 'sending'), for the current lobby code. */
  sent: Record<string, InviteOutcome | 'sending'>;
  code: string | null;
  inbox: ReceivedInvite[];
}

type Job = { code: string; toUserId: string; resolve: (o: InviteOutcome) => void };

function outcomeFor(code: string): InviteOutcome {
  switch (code) {
    case 'invalid':
      return 'not-friends';
    case 'not-found':
      return 'not-found';
    case 'rate-limited':
      return 'rate-limited';
    case 'auth-required':
      return 'auth-required';
    default:
      return 'failed';
  }
}

export class Inviter {
  private state: InviterState = { sent: {}, code: null, inbox: [] };
  private readonly listeners = new Set<() => void>();
  private readonly offs: (() => void)[] = [];
  private readonly jobs: Job[] = [];
  private current: { job: Job; settle: () => void } | null = null;
  private stopped = false;

  constructor(
    private readonly hub: HubLike,
    private readonly sched: Pick<Scheduler, 'after' | 'now'>,
  ) {
    this.offs.push(
      hub.on('balatro:p2p:error', (d) => {
        if (d.event !== 'balatro:invite' || !this.current) return;
        this.finish(outcomeFor(d.code));
      }),
      hub.on('balatro:invited', (d) => this.receive(d)),
    );
  }

  /* ─── Store (useSyncExternalStore) ─── */

  getState = (): InviterState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private set(next: InviterState): void {
    this.state = next;
    for (const fn of [...this.listeners]) fn();
  }

  /* ─── Sending ─── */

  invite(code: string, toUserId: string): Promise<InviteOutcome> {
    if (this.stopped) return Promise.resolve('failed');
    if (this.hub.status !== 'connected') return Promise.resolve('offline');
    const sent = this.state.code === code ? { ...this.state.sent } : {};
    sent[toUserId] = 'sending';
    this.set({ ...this.state, code, sent });
    return new Promise<InviteOutcome>((resolve) => {
      this.jobs.push({ code, toUserId, resolve });
      this.pump();
    });
  }

  private pump(): void {
    if (this.current || this.stopped) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.hub.emit('balatro:invite', { code: job.code, toUserId: job.toUserId });
    const settle = this.sched.after(INVITE_SETTLE_MS, () => this.finish('sent'));
    this.current = { job, settle };
  }

  private finish(outcome: InviteOutcome): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.settle();
    if (this.state.code === cur.job.code) {
      this.set({ ...this.state, sent: { ...this.state.sent, [cur.job.toUserId]: outcome } });
    }
    cur.job.resolve(outcome);
    this.pump();
  }

  /* ─── Receiving ─── */

  private receive(d: BalatroS2CPayload<'balatro:invited'>): void {
    const now = this.sched.now();
    const inbox = [
      { code: d.code, fromUserId: d.fromUserId, fromName: d.fromName, at: now },
      ...this.state.inbox.filter((i) => i.code !== d.code && now - i.at < INBOX_TTL_MS),
    ].slice(0, INBOX_MAX);
    this.set({ ...this.state, inbox });
  }

  /** Forget an invite (accepted or dismissed). */
  dismiss(code: string): void {
    this.set({ ...this.state, inbox: this.state.inbox.filter((i) => i.code !== code) });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const off of this.offs.splice(0)) off();
    this.current?.settle();
    const pending = [...(this.current ? [this.current.job] : []), ...this.jobs.splice(0)];
    this.current = null;
    for (const j of pending) j.resolve('failed');
    this.listeners.clear();
  }
}

/* ─── The page-wide registry (the toolbar lives outside the runtime) ─────── */

let active: Inviter | null = null;
const registryListeners = new Set<() => void>();

export function setActiveInviter(inviter: Inviter | null): void {
  active = inviter;
  for (const fn of [...registryListeners]) fn();
}

export function activeInviter(): Inviter | null {
  return active;
}

export function subscribeActiveInviter(fn: () => void): () => void {
  registryListeners.add(fn);
  return () => void registryListeners.delete(fn);
}

/** Invite a friend into `code` through the running session (or 'offline' without one). */
export function inviteFriend(code: string, toUserId: string): Promise<InviteOutcome> {
  return active ? active.invite(code, toUserId) : Promise.resolve('offline');
}
