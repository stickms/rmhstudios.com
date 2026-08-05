/**
 * Massive March — the React-facing store.
 *
 * Everything here changes when something *happens*: you joined, a tower opened,
 * somebody spoke, the booth showed you four glyphs. Anything that changes at
 * tick rate lives in `live.ts` instead and never touches React at all — see the
 * note at the top of that file for why.
 */

'use client';

import { create } from 'zustand';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type { ItemKind } from './items';
import { live } from './live';
import type {
  CampaignSummary,
  ChatLine,
  ItemDescriptor,
  MemberInfo,
  PuzzleStatus,
  Reveal,
  SessionSnapshot,
  WorldEvent,
  WorldSnapshot,
} from './net/events';
import { CHAT_HISTORY } from './constants';

export type Screen = 'menu' | 'lobby' | 'world' | 'ending';

/**
 * The empty list every optional-list selector falls back to.
 *
 * Zustand v5 is a thin wrapper over `useSyncExternalStore`, which decides
 * whether to re-render by comparing the selector's result to the previous one
 * **by identity**. So `useMmStore((s) => s.session?.members ?? [])` is not the
 * harmless idiom it looks like: every call with no session returns a brand-new
 * `[]`, nothing ever compares equal, and React re-renders until it gives up with
 * "Maximum update depth exceeded".
 *
 * One frozen array, shared by every such selector, makes the fallback a stable
 * reference. Frozen because a caller that mutated it would be mutating the
 * fallback for the whole app.
 */
const EMPTY: readonly never[] = Object.freeze([]);

/**
 * Typed accessor for it. Returns the SAME frozen array every call — that is the
 * entire point — while letting each call site say what the list would have held,
 * so `?? none<string>()` still types as `readonly string[]`.
 */
export function none<T>(): readonly T[] {
  return EMPTY as readonly T[];
}

/** A transient line of feedback. Not sonner: this UI owns its whole viewport. */
export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'warn';
  at: number;
}

export interface PackView {
  target: string;
  items: { id: number; kind: ItemKind; label?: string }[];
}

interface MmStore {
  screen: Screen;
  connection: RealtimeStatus;
  error: string | null;

  session: SessionSnapshot | null;
  selfSocketId: string | null;
  selfSlot: number;
  campaigns: CampaignSummary[];
  campaignsLoading: boolean;

  world: WorldSnapshot | null;
  /** Item id → what it is, kept as a Map because the tick looks it up per frame. */
  itemMeta: Map<number, { kind: ItemKind; label: string }>;

  chat: ChatLine[];
  chatOpen: boolean;
  unreadChat: number;

  /** The one thing this player can currently see that others cannot. */
  reveal: Reveal | null;
  pack: PackView | null;

  notices: Notice[];
  /** Which overlay is up. Only one at a time; Escape closes whatever it is. */
  overlay: 'none' | 'map' | 'settings' | 'gestures' | 'inventory' | 'pause' | 'board';
  /** Site the player is standing in, for the interaction prompt. */
  nearSite: string | null;
  /** Tower the player is standing at, if any. */
  nearTower: string | null;

  setScreen: (screen: Screen) => void;
  setConnection: (status: RealtimeStatus) => void;
  setError: (error: string | null) => void;
  setSession: (session: SessionSnapshot | null) => void;
  setSelf: (socketId: string | null, slot: number) => void;
  setCampaigns: (campaigns: CampaignSummary[]) => void;
  setCampaignsLoading: (loading: boolean) => void;
  applyWorld: (world: WorldSnapshot) => void;
  addChat: (line: ChatLine) => void;
  setChatOpen: (open: boolean) => void;
  setReveal: (reveal: Reveal | null) => void;
  setPack: (pack: PackView | null) => void;
  notify: (text: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;
  setOverlay: (overlay: MmStore['overlay']) => void;
  setNear: (site: string | null, tower: string | null) => void;
  leave: () => void;
}

let noticeId = 1;

export const useMmStore = create<MmStore>((set) => ({
  screen: 'menu',
  connection: 'idle',
  error: null,

  session: null,
  selfSocketId: null,
  selfSlot: -1,
  campaigns: [],
  campaignsLoading: false,

  world: null,
  itemMeta: new Map(),

  chat: [],
  chatOpen: false,
  unreadChat: 0,

  reveal: null,
  pack: null,

  notices: [],
  overlay: 'none',
  nearSite: null,
  nearTower: null,

  setScreen: (screen) => set({ screen }),
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),
  setSession: (session) => set({ session }),
  setSelf: (selfSocketId, selfSlot) => {
    live.selfSlot = selfSlot;
    set({ selfSocketId, selfSlot });
  },
  setCampaigns: (campaigns) => set({ campaigns, campaignsLoading: false }),
  setCampaignsLoading: (campaignsLoading) => set({ campaignsLoading }),

  applyWorld: (world) =>
    set((state) => {
      // Rebuilt rather than merged: the snapshot is the whole truth about what
      // exists, so an object that has left it has genuinely gone.
      const itemMeta = new Map<number, { kind: ItemKind; label: string }>();
      for (const item of world.items as ItemDescriptor[]) {
        itemMeta.set(item.id, { kind: item.kind as ItemKind, label: item.label ?? '' });
      }
      return {
        world,
        itemMeta,
        screen: world.finished && state.screen === 'world' ? 'ending' : state.screen,
      };
    }),

  addChat: (line) =>
    set((state) => {
      const chat = [...state.chat, line];
      if (chat.length > CHAT_HISTORY) chat.shift();
      return { chat, unreadChat: state.chatOpen ? 0 : state.unreadChat + 1 };
    }),
  setChatOpen: (chatOpen) => set({ chatOpen, unreadChat: chatOpen ? 0 : 0 }),

  setReveal: (reveal) => set({ reveal }),
  setPack: (pack) => set({ pack }),

  notify: (text, tone = 'info') =>
    set((state) => ({
      notices: [...state.notices, { id: noticeId++, text, tone, at: Date.now() }].slice(-5),
    })),
  dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),

  setOverlay: (overlay) => set({ overlay }),
  setNear: (nearSite, nearTower) =>
    set((state) =>
      state.nearSite === nearSite && state.nearTower === nearTower ? state : { nearSite, nearTower },
    ),

  leave: () =>
    set({
      screen: 'menu',
      session: null,
      world: null,
      itemMeta: new Map(),
      chat: [],
      reveal: null,
      pack: null,
      overlay: 'none',
      nearSite: null,
      nearTower: null,
      selfSlot: -1,
    }),
}));

/** The seat this player occupies, or null before the session arrives. */
export function selfMember(): MemberInfo | null {
  const { session, selfSocketId } = useMmStore.getState();
  if (!session || !selfSocketId) return null;
  return session.members.find((m) => m.socketId === selfSocketId) ?? null;
}

export function puzzleStatus(id: string): PuzzleStatus | null {
  return useMmStore.getState().world?.puzzles.find((p) => p.id === id) ?? null;
}

/** Turn a world event into the one line the player should see about it. */
export function noticeFor(event: WorldEvent): { text: string; tone: Notice['tone'] } | null {
  switch (event.kind) {
    case 'joined':
      return { text: `${event.name} arrived at the landing.`, tone: 'info' };
    case 'left':
      return { text: `${event.name} left.`, tone: 'info' };
    case 'solved':
      return {
        text: event.reward === 1 ? 'A red round appears.' : `${event.reward} red rounds appear.`,
        tone: 'good',
      };
    case 'skipped':
      return { text: 'Challenge skipped.', tone: 'info' };
    case 'reset':
      return {
        text: event.reason === 'wrong-plate' ? 'Wrong plate. Back to the start.' : 'That was not it.',
        tone: 'warn',
      };
    case 'deposit':
      return {
        text: `${event.deposited} of ${event.threshold} given.`,
        tone: event.deposited >= event.threshold ? 'good' : 'info',
      };
    case 'key':
      return { text: 'The tower gives up a key.', tone: 'good' };
    case 'unlock':
      return {
        text:
          event.unlock === 'cart'
            ? 'Something starts moving on the track.'
            : event.unlock === 'repeater'
              ? 'The antenna hums. The radios go quiet, then clear.'
              : event.unlock === 'gate'
                ? 'The White Gate is open.'
                : 'A way through opens.',
        tone: 'good',
      };
    case 'flare':
      return { text: 'A flare goes up.', tone: 'info' };
    case 'cart':
      return { text: 'The cart rattles into the other halt.', tone: 'info' };
    case 'finished':
      return { text: 'You walk through together.', tone: 'good' };
    default:
      return null;
  }
}
