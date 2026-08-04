/**
 * Massive March — the campaign hub.
 *
 * Unlike most handlers on this server, this one is not a relay. It is the
 * authority: it owns the clock, the puzzles, every loose object on the island
 * and the decision about who can hear whom. Clients own exactly one thing —
 * where their own camera is — and even that is speed-clamped on arrival.
 *
 * That split is forced by the design rather than chosen for tidiness. This is a
 * game about information asymmetry (§12.1): the sequence painted inside a sealed
 * booth must reach the people standing in the booth and nobody else. A host-
 * authoritative model would put every secret on one player's machine, and a
 * relay model would put all of them on everybody's. Neither is the game. So the
 * hub holds the state and sends each socket only what its player can currently
 * perceive.
 *
 * Shape of a tick (66ms, one interval for all sessions):
 *
 *   advance clock → integrate loose objects → evaluate positional puzzles →
 *   broadcast positions → broadcast world state if it changed →
 *   send each socket any private reveal that changed for them
 *
 * Sessions are in-memory like every other hub here (`server/CLAUDE.md` §Gotcha
 * 1); the *campaign* is not. It is a row, owned by the host, written back on a
 * timer and on every meaningful change, which is what lets a group put the
 * island down for a week and pick it up where they left it.
 *
 * Note the import style: relative specifiers into `lib/`, never `@/` — see
 * `server/CLAUDE.md` gotchas 7 and 8, and the matching `COPY lib/massive-march`
 * in the Dockerfile without which this file bundles into a crash on boot.
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString, sanitizeUserName } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { getPrismaClient } from '../prisma-client';
import { awardAppProgress } from '../economy';

import {
  BOARD_MAX_LENGTH,
  CHAT_HISTORY,
  CHAT_MAX_LENGTH,
  CROUCH_EYE_HEIGHT,
  DISCONNECT_GRACE_MS,
  EYE_HEIGHT,
  GRAVITY,
  MAX_PLAYERS,
  MAX_SESSIONS,
  MOVE_SPEED_TOLERANCE,
  PLAYER_RADIUS,
  ROOM_PREFIX,
  RUN_SPEED,
  SESSION_IDLE_TIMEOUT_MS,
  SLIDE_MAX_SPEED,
  TICK_MS,
  WORLD_HEARTBEAT_MS,
  isWorldVariant,
  type WorldVariant,
} from '../../../lib/massive-march/constants';
import {
  advanceClock,
  campaignIsNight,
  createCampaign,
  creditSolve,
  deposit,
  finish,
  fromSave,
  refreshGate,
  skipSite,
  snapshot,
  solvedCount,
  totalDeposited,
  toSave,
  type CampaignState,
} from '../../../lib/massive-march/campaign';
import {
  BIT,
  CLIENT_BITS,
  C2S,
  S2C,
  ITEM_SLOTS,
  ITEM_SLOT_SHIFT,
  type ChatLine,
  type ItemDescriptor,
  type ItemTick,
  type MemberInfo,
  type PlayerTick,
  type Reveal,
  type SessionSnapshot,
  type WorldEvent,
} from '../../../lib/massive-march/net/events';
import {
  act,
  atSite,
  evaluate,
  revealFor,
  scoreHoop,
  type PuzzleContext,
  type PuzzlePlayer,
} from '../../../lib/massive-march/puzzles';
import {
  ITEMS,
  canHold,
  isItemKind,
  kickSpeed,
  slotCapacity,
  throwSpeed,
  type ItemKind,
  type Slot,
} from '../../../lib/massive-march/items';
import { GESTURES } from '../../../lib/massive-march/gestures';
import { audibility, boothAt, garble, type ChatChannel } from '../../../lib/massive-march/world/audio';
import { COLLIDERS, resolveCollisions } from '../../../lib/massive-march/world/regions';
import { clampToLand, groundY, isWater, pad } from '../../../lib/massive-march/world/terrain';
import {
  ITEM_SPAWNS,
  PUZZLE_BY_ID,
  PUZZLE_SITES,
  TOWERS,
  type PuzzleSite,
} from '../../../lib/massive-march/world/sites';

// ─── State ──────────────────────────────────────────────────────────────────

interface Member {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  slot: number;
  isHost: boolean;
  connected: boolean;
  disconnectedAt: number | null;

  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Client-owned movement bits; the server ORs its own on top each tick. */
  clientBits: number;
  bits: number;
  lastMoveAt: number;

  gesture: number;
  gestureUntil: number;

  hands: number | null;
  belt: number[];
  pack: number[];
  worn: number[];

  voiceChannel: ChatChannel;
  speaking: boolean;

  /** Signature of the last private reveal sent, so it is only sent on change. */
  revealKey: string;
}

interface WorldItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holder: string | null;
  slot: Slot | null;
  /** Torch lit, flare burning, laser on, radio open — item-specific. */
  on: boolean;
  /** Flare and similar one-shots burn out. */
  onUntil: number | null;
  label: string;
  resting: boolean;
  /** Index into ITEM_SPAWNS, for the ones that refill. */
  spawnIndex: number | null;
  /** Set on the tick a ball passes a hoop, to debounce a wobbling pass. */
  scoredAt: number;
  /** Which side of the hoop plane the ball was on last tick. */
  hoopSide: number;
}

interface Session {
  code: string;
  campaignId: string;
  hostUserId: string;
  hostSocketId: string;
  state: CampaignState;
  members: Map<string, Member>;
  items: Map<number, WorldItem>;
  nextItemId: number;
  chat: ChatLine[];
  lastActivityAt: number;
  lastTickAt: number;
  lastWorldAt: number;
  worldDirty: boolean;
  saveDirty: boolean;
  lastSavedAt: number;
  /** Slots that have been handed out; freed when a member is really gone. */
  usedSlots: Set<number>;
}

const sessions = new Map<string, Session>();
/** socketId → session code. A socket is only ever in one campaign. */
const socketSession = new Map<string, string>();
/** campaignId → code, so a second `resume` finds the live session. */
const campaignSession = new Map<string, string>();

let tickTimer: ReturnType<typeof setInterval> | null = null;

// ─── Small helpers ──────────────────────────────────────────────────────────

function roomName(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

function identity(socket: Socket): { userId: string; name: string; avatarUrl: string | null } {
  const userId = typeof socket.data?.userId === 'string' ? socket.data.userId : '';
  const name = sanitizeUserName(typeof socket.data?.userName === 'string' ? socket.data.userName : undefined);
  const avatarUrl = typeof socket.data?.avatarUrl === 'string' ? socket.data.avatarUrl : null;
  return { userId, name, avatarUrl };
}

function fail(socket: Socket, message: string): void {
  socket.emit(S2C.ERROR, { message });
}

function newCode(): string {
  let code = generateRoomCode();
  let guard = 0;
  while (sessions.has(code) && guard < 50) {
    code = generateRoomCode();
    guard++;
  }
  return code;
}

function lowestFreeSlot(session: Session): number {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!session.usedSlots.has(i)) return i;
  }
  return -1;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ─── Views ──────────────────────────────────────────────────────────────────

function memberInfo(member: Member): MemberInfo {
  return {
    socketId: member.socketId,
    userId: member.userId,
    name: member.name,
    avatarUrl: member.avatarUrl,
    slot: member.slot,
    isHost: member.isHost,
    connected: member.connected,
  };
}

function sessionSnapshot(session: Session): SessionSnapshot {
  return {
    code: session.code,
    campaignId: session.campaignId,
    name: session.state.name,
    variant: session.state.variant,
    allowSkip: session.state.allowSkip,
    hostSocketId: session.hostSocketId,
    members: [...session.members.values()].sort((a, b) => a.slot - b.slot).map(memberInfo),
    maxPlayers: MAX_PLAYERS,
  };
}

function broadcastSession(io: Server, session: Session): void {
  io.to(roomName(session.code)).emit(S2C.SESSION, sessionSnapshot(session));
  io.to(roomName(session.code)).emit(S2C.VOICE_PEERS, {
    peers: [...session.members.values()].filter((m) => m.connected).map((m) => m.socketId),
  });
}

function emitEvents(io: Server, session: Session, events: WorldEvent[]): void {
  if (events.length === 0) return;
  for (const event of events) io.to(roomName(session.code)).emit(S2C.EVENT, event);
}

// ─── Puzzle context ─────────────────────────────────────────────────────────

function hasKind(session: Session, member: Member, kind: ItemKind, slots: Slot[] = ['hands']): boolean {
  for (const slot of slots) {
    const ids =
      slot === 'hands' ? (member.hands === null ? [] : [member.hands]) : slot === 'belt' ? member.belt : slot === 'pack' ? member.pack : member.worn;
    for (const id of ids) {
      if (session.items.get(id)?.kind === kind) return true;
    }
  }
  return false;
}

function heldItem(session: Session, member: Member): WorldItem | null {
  if (member.hands === null) return null;
  return session.items.get(member.hands) ?? null;
}

function isWearing(session: Session, member: Member, kind: ItemKind): boolean {
  return member.worn.some((id) => session.items.get(id)?.kind === kind);
}

function puzzlePlayers(session: Session): PuzzlePlayer[] {
  const out: PuzzlePlayer[] = [];
  for (const member of session.members.values()) {
    if (!member.connected) continue;
    out.push({
      slot: member.slot,
      x: member.x,
      z: member.z,
      blinded: isWearing(session, member, 'bucket'),
      hasFinder: heldItem(session, member)?.kind === 'detector',
    });
  }
  return out;
}

function context(session: Session, now: number): PuzzleContext {
  return {
    now,
    variant: session.state.variant,
    keys: new Set(session.state.keys),
    night: campaignIsNight(session.state),
    players: puzzlePlayers(session),
  };
}

function carriedOrbs(session: Session): number {
  let count = 0;
  for (const item of session.items.values()) if (item.kind === 'orb') count++;
  return count;
}

function itemDescriptors(session: Session): ItemDescriptor[] {
  const out: ItemDescriptor[] = [];
  for (const item of session.items.values()) {
    out.push(item.label ? { id: item.id, kind: item.kind, label: item.label } : { id: item.id, kind: item.kind });
  }
  return out;
}

function pushWorld(io: Server, session: Session, now: number): void {
  const ctx = context(session, now);
  io.to(roomName(session.code)).emit(
    S2C.WORLD,
    snapshot(session.state, ctx, carriedOrbs(session), itemDescriptors(session)),
  );
  session.lastWorldAt = now;
  session.worldDirty = false;
}

// ─── Items ──────────────────────────────────────────────────────────────────

function spawnItem(
  session: Session,
  kind: ItemKind,
  x: number,
  z: number,
  spawnIndex: number | null = null,
): WorldItem {
  const item: WorldItem = {
    id: session.nextItemId++,
    kind,
    x,
    y: groundY(x, z) + 0.3,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    holder: null,
    slot: null,
    on: false,
    onUntil: null,
    label: '',
    resting: true,
    spawnIndex,
    scoredAt: 0,
    hoopSide: 0,
  };
  session.items.set(item.id, item);
  return item;
}

/** Lay out the island's tool caches for a fresh session. */
function stockWorld(session: Session): void {
  ITEM_SPAWNS.forEach((spawn, index) => {
    if (!isItemKind(spawn.kind)) return;
    spawnItem(session, spawn.kind, spawn.x, spawn.z, index);
  });
}

/**
 * Put the rounds a finished puzzle produced on the ground in front of it.
 *
 * On the ground, not into an inventory: they are objects, somebody has to decide
 * to pick them up, and forgetting them is a thing that can happen (§13.1).
 */
function dropRewards(session: Session, site: PuzzleSite): void {
  for (let i = 0; i < site.reward; i++) {
    const angle = (i / Math.max(1, site.reward)) * Math.PI * 2;
    spawnItem(session, 'orb', site.x + Math.cos(angle) * 3.2, site.z + Math.sin(angle) * 3.2);
  }
}

function slotList(member: Member, slot: Slot): number[] {
  switch (slot) {
    case 'hands':
      return member.hands === null ? [] : [member.hands];
    case 'belt':
      return member.belt;
    case 'pack':
      return member.pack;
    case 'worn':
      return member.worn;
  }
}

function removeFromInventory(member: Member, itemId: number): boolean {
  if (member.hands === itemId) {
    member.hands = null;
    return true;
  }
  for (const list of [member.belt, member.pack, member.worn]) {
    const index = list.indexOf(itemId);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
  }
  return false;
}

function place(session: Session, member: Member, item: WorldItem, slot: Slot): boolean {
  if (!canHold(item.kind, slot)) return false;
  // The backpack's own capacity is only real while somebody is wearing one.
  if (slot === 'pack' && !isWearing(session, member, 'backpack')) return false;
  if (slot === 'hands') {
    if (member.hands !== null) return false;
    member.hands = item.id;
  } else {
    const list = slotList(member, slot);
    if (list.length >= slotCapacity(slot)) return false;
    list.push(item.id);
  }
  item.holder = member.socketId;
  item.slot = slot;
  item.resting = true;
  item.vx = 0;
  item.vy = 0;
  item.vz = 0;
  return true;
}

/** Where an item lands when it leaves a player's hands without being thrown. */
function detach(session: Session, member: Member, item: WorldItem): void {
  removeFromInventory(member, item.id);
  item.holder = null;
  item.slot = null;
  const forward = { x: Math.sin(member.yaw), z: Math.cos(member.yaw) };
  const x = member.x + forward.x * 1.1;
  const z = member.z + forward.z * 1.1;
  const landed = clampToLand(x, z);
  item.x = landed.x;
  item.z = landed.z;
  item.y = groundY(landed.x, landed.z) + 0.3;
  item.resting = true;
  // A bucket that comes off should stop blinding the wearer, and a torch left on
  // the ground should keep burning — only the head-mounted state is cleared.
  if (item.kind === 'bucket') item.on = false;
  if (session.state.finished) item.on = false;
}

const HOOP_SITE = PUZZLE_SITES.find((s) => s.kind === 'hoop');

/**
 * Move everything nobody is holding.
 *
 * Cheap explicit Euler with a fat coefficient of restitution — this is not a
 * physics showcase, it is "did the ball go through the hoop" and "the binoculars
 * you threw are now somewhere down that slope", and both of those want an
 * answer everyone agrees on more than they want an accurate one.
 */
function integrateItems(session: Session, dt: number, now: number): void {
  for (const item of session.items.values()) {
    if (item.onUntil !== null && now >= item.onUntil) {
      item.on = false;
      item.onUntil = null;
      session.worldDirty = true;
    }

    if (item.holder) continue;
    if (item.resting) continue;

    item.vy -= GRAVITY * dt;
    let nx = item.x + item.vx * dt;
    const ny = item.y + item.vy * dt;
    let nz = item.z + item.vz * dt;

    const resolved = resolveCollisions(nx, nz, 0.3, COLLIDERS);
    if (resolved.x !== nx || resolved.z !== nz) {
      // Bounced off a wall: keep some speed, lose the direction.
      item.vx *= -0.35;
      item.vz *= -0.35;
      nx = resolved.x;
      nz = resolved.z;
    }

    const floor = groundY(nx, nz) + 0.28;
    if (ny <= floor) {
      item.x = nx;
      item.z = nz;
      item.y = floor;
      if (Math.abs(item.vy) > 2.2) {
        item.vy = -item.vy * 0.34;
        item.vx *= 0.7;
        item.vz *= 0.7;
      } else {
        item.vy = 0;
        item.vx *= 0.55;
        item.vz *= 0.55;
        if (Math.hypot(item.vx, item.vz) < 0.4) {
          item.vx = 0;
          item.vz = 0;
          item.resting = true;
          // Anything that ends up in the surf washes back onto the sand rather
          // than being lost, because losing the only detector to a wave is a
          // dead campaign, not a funny story.
          if (isWater(item.x, item.z)) {
            const landed = clampToLand(item.x, item.z);
            item.x = landed.x;
            item.z = landed.z;
            item.y = groundY(landed.x, landed.z) + 0.3;
          }
        }
      }
    } else {
      item.x = nx;
      item.y = ny;
      item.z = nz;
    }

    if (item.kind === 'ball' && HOOP_SITE?.hoop) checkHoop(session, item, now);
  }
}

/** Signed distance from the hoop's plane, so a crossing is a change of sign. */
function checkHoop(session: Session, ball: WorldItem, now: number): void {
  const site = HOOP_SITE;
  if (!site?.hoop) return;
  const runtime = session.state.runtimes[site.id];
  if (!runtime || runtime.solved || runtime.skipped) return;

  const hoop = site.hoop;
  const nx = Math.cos(hoop.facing);
  const nz = Math.sin(hoop.facing);
  const side = Math.sign((ball.x - hoop.x) * nx + (ball.z - hoop.z) * nz);

  const previous = ball.hoopSide;
  ball.hoopSide = side;
  if (previous === 0 || side === 0 || side === previous) return;
  if (now - ball.scoredAt < 1500) return;

  const groundLevel = groundY(hoop.x, hoop.z);
  const withinRing =
    Math.hypot(ball.x - hoop.x, ball.z - hoop.z) < hoop.r &&
    Math.abs(ball.y - (groundLevel + hoop.y)) < hoop.r;
  if (!withinRing) return;

  ball.scoredAt = now;
  const outcome = scoreHoop(site, runtime);
  if (outcome.changed) session.worldDirty = true;
  if (outcome.solved) completeSite(session, site);
}

// ─── Completion ─────────────────────────────────────────────────────────────

const pendingEvents = new Map<string, WorldEvent[]>();

function queue(session: Session, events: WorldEvent[]): void {
  if (events.length === 0) return;
  const list = pendingEvents.get(session.code) ?? [];
  list.push(...events);
  pendingEvents.set(session.code, list);
}

function completeSite(session: Session, site: PuzzleSite): void {
  const reward = creditSolve(session.state, site.id);
  dropRewards(session, site);
  session.worldDirty = true;
  session.saveDirty = true;
  queue(session, [{ kind: 'solved', site: site.id, reward }]);
  queue(session, refreshGate(session.state));
  for (const member of session.members.values()) {
    if (!member.connected) continue;
    if (!atSite(site, member)) continue;
    awardAppProgress(member.userId || null, { xp: 25, quest: { type: 'game_play' } });
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persist(session: Session): Promise<void> {
  session.saveDirty = false;
  session.lastSavedAt = Date.now();
  try {
    const prisma = getPrismaClient();
    await prisma.massiveMarchCampaign.update({
      where: { id: session.campaignId },
      data: {
        saveData: toSave(session.state) as never,
        deposited: totalDeposited(session.state),
        solved: solvedCount(session.state),
        finished: session.state.finished,
        name: session.state.name,
        variant: session.state.variant,
      },
    });
  } catch (error) {
    // Never blocks gameplay (`server/CLAUDE.md` §Gotcha 4) — the next tick will
    // try again, and the in-memory state is still correct meanwhile.
    session.saveDirty = true;
    logger.warn({ event: 'mm_save_failed', campaignId: session.campaignId, error: String(error) });
  }
}

function touchMembership(campaignId: string, userId: string): void {
  if (!userId) return;
  void (async () => {
    try {
      const prisma = getPrismaClient();
      await prisma.massiveMarchMember.upsert({
        where: { campaignId_userId: { campaignId, userId } },
        create: { campaignId, userId },
        update: { lastSeenAt: new Date() },
      });
    } catch (error) {
      logger.warn({ event: 'mm_membership_failed', campaignId, error: String(error) });
    }
  })();
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

function makeSession(
  code: string,
  campaignId: string,
  hostUserId: string,
  hostSocketId: string,
  state: CampaignState,
): Session {
  const now = Date.now();
  const session: Session = {
    code,
    campaignId,
    hostUserId,
    hostSocketId,
    state,
    members: new Map(),
    items: new Map(),
    nextItemId: 1,
    chat: [],
    lastActivityAt: now,
    lastTickAt: now,
    lastWorldAt: 0,
    worldDirty: true,
    saveDirty: false,
    lastSavedAt: now,
    usedSlots: new Set(),
  };
  stockWorld(session);
  return session;
}

const LANDING = pad('landing');

function addMember(session: Session, socket: Socket): Member | null {
  const slot = lowestFreeSlot(session);
  if (slot === -1) return null;
  const { userId, name, avatarUrl } = identity(socket);

  // Arriving players are put down beside the landing arch, spread out enough
  // that twelve of them do not spawn inside one another.
  const angle = (slot / MAX_PLAYERS) * Math.PI * 2;
  const x = LANDING.x + Math.cos(angle) * 6;
  const z = LANDING.z + 10 + Math.sin(angle) * 6;

  const member: Member = {
    socketId: socket.id,
    userId,
    name,
    avatarUrl,
    slot,
    isHost: session.hostSocketId === socket.id,
    connected: true,
    disconnectedAt: null,
    x,
    y: groundY(x, z),
    z,
    yaw: Math.PI,
    pitch: 0,
    clientBits: 0,
    bits: 0,
    lastMoveAt: Date.now(),
    gesture: 0,
    gestureUntil: 0,
    hands: null,
    belt: [],
    pack: [],
    worn: [],
    voiceChannel: 'near',
    speaking: false,
    revealKey: '',
  };

  session.members.set(socket.id, member);
  session.usedSlots.add(slot);
  socket.join(roomName(session.code));
  socketSession.set(socket.id, session.code);
  touchMembership(session.campaignId, userId);
  return member;
}

/**
 * Take a socket out of its session.
 *
 * A drop is not a departure. The avatar stays, the inventory stays with it, and
 * the seat is held for `DISCONNECT_GRACE_MS` — because the alternative is that a
 * dead phone battery strands the whole group's only radio in a body that no
 * longer exists. An explicit leave skips the grace and hands everything back to
 * the ground where they were standing.
 */
function removeMember(io: Server, socket: Socket, options: { immediate: boolean }): void {
  const code = socketSession.get(socket.id);
  if (!code) return;
  socketSession.delete(socket.id);
  socket.leave(roomName(code));

  const session = sessions.get(code);
  if (!session) return;
  const member = session.members.get(socket.id);
  if (!member) return;

  if (!options.immediate) {
    member.connected = false;
    member.disconnectedAt = Date.now();
    broadcastSession(io, session);
    return;
  }

  releaseMember(io, session, member);
}

function releaseMember(io: Server, session: Session, member: Member): void {
  // Everything they were carrying falls where they were standing. Somebody now
  // has to walk over there.
  for (const id of [
    ...(member.hands === null ? [] : [member.hands]),
    ...member.belt,
    ...member.pack,
    ...member.worn,
  ]) {
    const item = session.items.get(id);
    if (!item) continue;
    item.holder = null;
    item.slot = null;
    const landed = clampToLand(member.x, member.z);
    item.x = landed.x + (Math.random() - 0.5) * 1.5;
    item.z = landed.z + (Math.random() - 0.5) * 1.5;
    item.y = groundY(item.x, item.z) + 0.3;
    item.resting = true;
    if (item.kind === 'bucket') item.on = false;
  }
  member.hands = null;
  member.belt = [];
  member.pack = [];
  member.worn = [];

  session.members.delete(member.socketId);
  session.usedSlots.delete(member.slot);
  queue(session, [{ kind: 'left', name: member.name, slot: member.slot }]);

  const remaining = [...session.members.values()];
  if (remaining.length === 0) {
    closeSession(session);
    return;
  }

  if (session.hostSocketId === member.socketId) {
    // The host owns the save, so their leaving ends the session for everyone —
    // §6.2 is explicit about this and it is not a limitation to route around.
    io.to(roomName(session.code)).emit(S2C.KICKED, { reason: 'host-left' });
    closeSession(session);
    return;
  }

  broadcastSession(io, session);
  session.worldDirty = true;
}

function closeSession(session: Session): void {
  if (session.saveDirty) void persist(session);
  for (const member of session.members.values()) socketSession.delete(member.socketId);
  sessions.delete(session.code);
  campaignSession.delete(session.campaignId);
  pendingEvents.delete(session.code);
  logger.info({ event: 'mm_session_closed', code: session.code, campaignId: session.campaignId });
}

// ─── Handlers: session ──────────────────────────────────────────────────────

async function handleCreate(io: Server, socket: Socket, payload: unknown): Promise<void> {
  const { userId, name: userName } = identity(socket);
  if (!userId) return fail(socket, 'sign-in-required');
  if (sessions.size >= MAX_SESSIONS) return fail(socket, 'server-busy');

  const data = (payload ?? {}) as { name?: unknown; variant?: unknown; allowSkip?: unknown };
  const variant: WorldVariant = isWorldVariant(data.variant) ? data.variant : 'duo';
  const name = sanitizeString(data.name, 48) || `${userName}'s walk`;

  removeMember(io, socket, { immediate: true });

  const state = createCampaign({ variant, name, allowSkip: data.allowSkip === true });
  const code = newCode();

  let campaignId: string;
  try {
    const prisma = getPrismaClient();
    const row = await prisma.massiveMarchCampaign.create({
      data: {
        ownerId: userId,
        code,
        name,
        variant,
        saveData: toSave(state) as never,
      },
      select: { id: true },
    });
    campaignId = row.id;
  } catch (error) {
    logger.error({ event: 'mm_create_failed', error: String(error) });
    return fail(socket, 'create-failed');
  }

  const session = makeSession(code, campaignId, userId, socket.id, state);
  sessions.set(code, session);
  campaignSession.set(campaignId, code);

  const member = addMember(session, socket);
  if (!member) return fail(socket, 'session-full');
  member.isHost = true;

  socket.emit(S2C.JOINED, { code, campaignId, slot: member.slot, socketId: socket.id });
  broadcastSession(io, session);
  pushWorld(io, session, Date.now());
  ensureTicking(io);
  logger.info({ event: 'mm_created', code, campaignId, variant });
}

function handleJoin(io: Server, socket: Socket, payload: unknown): void {
  const { userId } = identity(socket);
  if (!userId) return fail(socket, 'sign-in-required');

  const raw = (payload as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase().slice(0, 8) : '';
  const session = sessions.get(code);
  if (!session) return fail(socket, 'no-such-session');

  const existing = session.members.get(socket.id);
  if (existing) {
    // Re-join from the same socket (a reconnect that kept its id): nothing to do
    // but re-send everything.
    existing.connected = true;
    existing.disconnectedAt = null;
    socket.join(roomName(code));
    socketSession.set(socket.id, code);
    socket.emit(S2C.JOINED, { code, campaignId: session.campaignId, slot: existing.slot, socketId: socket.id });
    broadcastSession(io, session);
    pushWorld(io, session, Date.now());
    return;
  }

  // A reconnect with a NEW socket id: match the held seat by account, so the
  // player walks back into their own body with their own pockets.
  const held = [...session.members.values()].find((m) => !m.connected && m.userId === userId && userId);
  if (held) {
    session.members.delete(held.socketId);
    for (const item of session.items.values()) {
      if (item.holder === held.socketId) item.holder = socket.id;
    }
    held.socketId = socket.id;
    held.connected = true;
    held.disconnectedAt = null;
    held.revealKey = '';
    session.members.set(socket.id, held);
    socket.join(roomName(code));
    socketSession.set(socket.id, code);
    socket.emit(S2C.JOINED, { code, campaignId: session.campaignId, slot: held.slot, socketId: socket.id });
    broadcastSession(io, session);
    pushWorld(io, session, Date.now());
    return;
  }

  if (session.members.size >= MAX_PLAYERS) return fail(socket, 'session-full');

  removeMember(io, socket, { immediate: true });
  const member = addMember(session, socket);
  if (!member) return fail(socket, 'session-full');

  socket.emit(S2C.JOINED, { code, campaignId: session.campaignId, slot: member.slot, socketId: socket.id });
  queue(session, [{ kind: 'joined', name: member.name, slot: member.slot }]);
  broadcastSession(io, session);
  pushWorld(io, session, Date.now());
  session.lastActivityAt = Date.now();
}

async function handleResume(io: Server, socket: Socket, payload: unknown): Promise<void> {
  const { userId } = identity(socket);
  if (!userId) return fail(socket, 'sign-in-required');

  const campaignId = typeof (payload as { campaignId?: unknown })?.campaignId === 'string'
    ? ((payload as { campaignId: string }).campaignId).slice(0, 40)
    : '';
  if (!campaignId) return fail(socket, 'no-such-campaign');

  // Already running — this is just a join with the code looked up for them.
  const liveCode = campaignSession.get(campaignId);
  if (liveCode) return handleJoin(io, socket, { code: liveCode });

  if (sessions.size >= MAX_SESSIONS) return fail(socket, 'server-busy');

  let row: { id: string; code: string; variant: string; saveData: unknown } | null = null;
  try {
    const prisma = getPrismaClient();
    row = await prisma.massiveMarchCampaign.findFirst({
      where: { id: campaignId, ownerId: userId },
      select: { id: true, code: true, variant: true, saveData: true },
    });
  } catch (error) {
    logger.error({ event: 'mm_resume_failed', error: String(error) });
    return fail(socket, 'resume-failed');
  }
  // Only the owner may open a campaign. Everybody else needs them online (§6.2).
  if (!row) return fail(socket, 'not-your-campaign');

  removeMember(io, socket, { immediate: true });

  const state = fromSave(row.saveData, isWorldVariant(row.variant) ? row.variant : 'duo');
  const code = sessions.has(row.code) ? newCode() : row.code;
  const session = makeSession(code, row.id, userId, socket.id, state);
  sessions.set(code, session);
  campaignSession.set(row.id, code);

  const member = addMember(session, socket);
  if (!member) return fail(socket, 'session-full');
  member.isHost = true;

  socket.emit(S2C.JOINED, { code, campaignId: row.id, slot: member.slot, socketId: socket.id });
  broadcastSession(io, session);
  pushWorld(io, session, Date.now());
  ensureTicking(io);
  logger.info({ event: 'mm_resumed', code, campaignId: row.id });
}

async function handleList(socket: Socket): Promise<void> {
  const { userId } = identity(socket);
  if (!userId) {
    socket.emit(S2C.CAMPAIGNS, []);
    return;
  }
  try {
    const prisma = getPrismaClient();
    const [owned, joined] = await Promise.all([
      prisma.massiveMarchCampaign.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          code: true,
          name: true,
          variant: true,
          deposited: true,
          solved: true,
          finished: true,
          updatedAt: true,
          owner: { select: { name: true } },
        },
      }),
      prisma.massiveMarchMember.findMany({
        where: { userId, campaign: { ownerId: { not: userId } } },
        orderBy: { lastSeenAt: 'desc' },
        take: 12,
        select: {
          campaign: {
            select: {
              id: true,
              code: true,
              name: true,
              variant: true,
              deposited: true,
              solved: true,
              finished: true,
              updatedAt: true,
              owner: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const rows = [...owned.map((c) => ({ c, owned: true })), ...joined.map((m) => ({ c: m.campaign, owned: false }))];
    socket.emit(
      S2C.CAMPAIGNS,
      rows.map(({ c, owned: isOwner }) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        variant: c.variant,
        orbs: c.deposited,
        solved: c.solved,
        finished: c.finished,
        updatedAt: c.updatedAt.getTime(),
        hostName: c.owner?.name ?? 'Someone',
        live: campaignSession.has(c.id),
        owned: isOwner,
      })),
    );
  } catch (error) {
    logger.warn({ event: 'mm_list_failed', error: String(error) });
    socket.emit(S2C.CAMPAIGNS, []);
  }
}

function handleSettings(io: Server, socket: Socket, payload: unknown): void {
  const session = sessionFor(socket);
  if (!session) return;
  if (session.hostSocketId !== socket.id) return fail(socket, 'not-host');
  const data = (payload ?? {}) as { allowSkip?: unknown; name?: unknown };
  if (typeof data.allowSkip === 'boolean') session.state.allowSkip = data.allowSkip;
  const name = sanitizeString(data.name, 48);
  if (name) session.state.name = name;
  session.saveDirty = true;
  broadcastSession(io, session);
}

function sessionFor(socket: Socket): Session | null {
  const code = socketSession.get(socket.id);
  if (!code) return null;
  return sessions.get(code) ?? null;
}

function memberFor(socket: Socket): { session: Session; member: Member } | null {
  const session = sessionFor(socket);
  if (!session) return null;
  const member = session.members.get(socket.id);
  if (!member) return null;
  return { session, member };
}

// ─── Handlers: movement ─────────────────────────────────────────────────────

/**
 * Accept a position report.
 *
 * The clamp is not anti-cheat theatre — there is no adversary in a co-op game.
 * It is desync insurance: a client whose frame timing melts down (a tab that
 * slept, a GC pause, a laptop lid) can otherwise report a jump of two hundred
 * metres, which on this server means it lands on a pressure pad it never walked
 * to. Slower than a run and the report is taken as-is; faster and it is dragged
 * back to where a person could actually have got.
 */
function handleMove(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { member } = found;
  if (!Array.isArray(payload) || payload.length < 6) return;

  const [rx, ry, rz, ryaw, rpitch, rbits] = payload as number[];
  if (![rx, ry, rz, ryaw, rpitch].every((n) => typeof n === 'number' && Number.isFinite(n))) return;

  const now = Date.now();
  const dt = Math.min(1.5, Math.max(0.016, (now - member.lastMoveAt) / 1000));
  member.lastMoveAt = now;

  let x = rx;
  let z = rz;
  const travelled = Math.hypot(x - member.x, z - member.z);
  // Sliding is legitimately faster than running, so the ceiling is the fastest
  // thing the movement model can produce, not the fastest thing you can walk.
  const ceiling = Math.max(RUN_SPEED, SLIDE_MAX_SPEED) * MOVE_SPEED_TOLERANCE * dt + 0.5;
  if (travelled > ceiling) {
    const scale = ceiling / travelled;
    x = member.x + (x - member.x) * scale;
    z = member.z + (z - member.z) * scale;
  }

  const resolved = resolveCollisions(x, z, PLAYER_RADIUS, COLLIDERS);
  const landed = clampToLand(resolved.x, resolved.z);
  member.x = landed.x;
  member.z = landed.z;

  const floor = groundY(member.x, member.z);
  member.y = Math.min(Math.max(ry, floor - 0.6), floor + 14);
  member.yaw = ryaw;
  member.pitch = Math.max(-1.55, Math.min(1.55, rpitch));
  member.clientBits = (typeof rbits === 'number' ? rbits : 0) & CLIENT_BITS;
}

function handleGesture(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const index = Number((payload as { gesture?: unknown })?.gesture);
  if (!Number.isInteger(index) || index < 0 || index >= GESTURES.length) return;
  found.member.gesture = index;
  found.member.gestureUntil = Date.now() + 2600;
}

// ─── Handlers: items ────────────────────────────────────────────────────────

/** Reach. Slightly generous, because precise pickup in first person is misery. */
const REACH = 2.6;

function handleTake(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  if (isWearing(session, member, 'bucket')) return fail(socket, 'blinded');

  const id = Number((payload as { itemId?: unknown })?.itemId);
  const item = session.items.get(id);
  if (!item || item.holder) return;
  if (Math.hypot(item.x - member.x, item.z - member.z) > REACH) return fail(socket, 'too-far');

  // Wearables go straight on, because putting a bucket in your hands and then
  // onto your head is two verbs for one obviously singular action.
  const wearable = item.kind === 'bucket' || item.kind === 'backpack';
  const slot: Slot = wearable && member.worn.length < slotCapacity('worn') ? 'worn' : 'hands';
  if (!place(session, member, item, slot)) {
    if (!place(session, member, item, 'belt')) return fail(socket, 'hands-full');
  }
  if (item.kind === 'bucket' && item.slot === 'worn') item.on = true;
  session.worldDirty = true;
}

function handleStow(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const data = (payload ?? {}) as { itemId?: unknown; slot?: unknown };
  const item = session.items.get(Number(data.itemId));
  if (!item || item.holder !== socket.id) return;
  const slot = data.slot === 'belt' || data.slot === 'pack' || data.slot === 'worn' ? data.slot : 'belt';

  removeFromInventory(member, item.id);
  if (!place(session, member, item, slot)) {
    place(session, member, item, 'hands');
    return fail(socket, 'no-room');
  }
  if (item.kind === 'bucket') item.on = slot === 'worn';
  session.worldDirty = true;
}

function handleEquip(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const item = session.items.get(Number((payload as { itemId?: unknown })?.itemId));
  if (!item || item.holder !== socket.id) return;
  if (item.slot === 'pack') return fail(socket, 'ask-someone');
  if (member.hands !== null && member.hands !== item.id) {
    // Swap: whatever was in the hands goes to the belt, or the ground.
    const current = session.items.get(member.hands);
    if (current) {
      removeFromInventory(member, current.id);
      if (!place(session, member, current, 'belt')) detach(session, member, current);
    }
  }
  removeFromInventory(member, item.id);
  if (!place(session, member, item, 'hands')) return fail(socket, 'hands-full');
  if (item.kind === 'bucket') item.on = false;
  session.worldDirty = true;
}

function handleDrop(socket: Socket): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const item = heldItem(session, member);
  if (!item) return;
  detach(session, member, item);
  session.worldDirty = true;
}

function handleThrow(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const item = heldItem(session, member);
  if (!item) return;

  const data = (payload ?? {}) as { dir?: unknown; power?: unknown };
  const dir = Array.isArray(data.dir) ? (data.dir as number[]) : [];
  if (dir.length < 3 || !dir.every((n) => typeof n === 'number' && Number.isFinite(n))) return;
  const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const power = Math.max(0, Math.min(1, Number(data.power) || 0.5));
  const speed = throwSpeed(item.kind, power);

  removeFromInventory(member, item.id);
  item.holder = null;
  item.slot = null;
  item.resting = false;
  item.x = member.x + (dir[0] / length) * 0.8;
  item.y = groundY(member.x, member.z) + EYE_HEIGHT;
  item.z = member.z + (dir[2] / length) * 0.8;
  item.vx = (dir[0] / length) * speed;
  item.vy = (dir[1] / length) * speed + 2.4;
  item.vz = (dir[2] / length) * speed;
  item.hoopSide = 0;
  if (item.kind === 'bucket') item.on = false;
  session.worldDirty = true;
}

function handleKick(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const item = session.items.get(Number((payload as { itemId?: unknown })?.itemId));
  if (!item || item.holder) return;
  if (Math.hypot(item.x - member.x, item.z - member.z) > REACH + 0.8) return;

  const speed = kickSpeed(item.kind);
  item.resting = false;
  item.vx = Math.sin(member.yaw) * speed;
  item.vz = Math.cos(member.yaw) * speed;
  item.vy = speed * 0.42;
  item.hoopSide = 0;
  session.worldDirty = true;
}

/** Flares burn for a minute; that is the whole design of a flare. */
const FLARE_MS = 60_000;

function handleUse(io: Server, socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  // Held first; otherwise the bucket on their head, which is the only worn
  // thing with an on/off state worth toggling.
  const worn = member.worn.map((id) => session.items.get(id)).find((i) => i?.kind === 'bucket') ?? null;
  const item = heldItem(session, member) ?? worn;
  if (!item) return;
  const def = ITEMS[item.kind];
  const wanted = (payload as { on?: unknown })?.on;

  if (def.use === 'toggle' || item.kind === 'bucket') {
    item.on = typeof wanted === 'boolean' ? wanted : !item.on;
    if (item.kind === 'radio' || item.kind === 'megaphone') {
      member.voiceChannel = channelFor(session, member);
    }
    session.worldDirty = true;
    return;
  }

  if (def.use === 'press') {
    if (item.kind === 'flare') {
      item.on = true;
      item.onUntil = Date.now() + FLARE_MS;
      io.to(roomName(session.code)).emit(S2C.EVENT, {
        kind: 'flare',
        x: round(member.x, 1),
        z: round(member.z, 1),
      } satisfies WorldEvent);
    }
    if (item.kind === 'bell') {
      io.to(roomName(session.code)).emit(S2C.EVENT, {
        kind: 'bell',
        x: round(member.x, 1),
        z: round(member.z, 1),
        slot: member.slot,
      } satisfies WorldEvent);
    }
    session.worldDirty = true;
  }
}

/**
 * Reach into somebody else's backpack.
 *
 * The one interaction in the game that cannot be performed alone (§10). The
 * wearer cannot open their own pack; a second player has to walk over and do it,
 * which turns "where is the map" into a conversation and occasionally into a
 * chase.
 */
function handlePack(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const data = (payload ?? {}) as { target?: unknown; itemId?: unknown };
  const targetId = typeof data.target === 'string' ? data.target : '';
  const target = session.members.get(targetId);
  if (!target || target.socketId === member.socketId) return fail(socket, 'no-target');
  if (Math.hypot(target.x - member.x, target.z - member.z) > REACH + 1) return fail(socket, 'too-far');
  if (!isWearing(session, target, 'backpack')) return fail(socket, 'no-pack');

  if (data.itemId === undefined || data.itemId === null) {
    // Just looking: send the contents to the person doing the rummaging.
    socket.emit(S2C.PACK_CONTENTS, {
      target: target.socketId,
      items: target.pack
        .map((id) => session.items.get(id))
        .filter((i): i is WorldItem => Boolean(i))
        .map((i) => ({ id: i.id, kind: i.kind, label: i.label })),
    });
    return;
  }

  const item = session.items.get(Number(data.itemId));
  if (!item || !target.pack.includes(item.id)) return fail(socket, 'not-there');
  removeFromInventory(target, item.id);
  if (!place(session, member, item, 'hands') && !place(session, member, item, 'belt')) {
    place(session, target, item, 'pack');
    return fail(socket, 'hands-full');
  }
  session.worldDirty = true;
}

// ─── Handlers: puzzles ──────────────────────────────────────────────────────

function handleAct(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const data = (payload ?? {}) as { site?: unknown; action?: unknown; symbol?: unknown; totem?: unknown };
  const site = PUZZLE_BY_ID.get(typeof data.site === 'string' ? data.site : '');
  if (!site) return;
  const runtime = session.state.runtimes[site.id];
  if (!runtime) return;

  const now = Date.now();
  const ctx = context(session, now);
  const actor = {
    slot: member.slot,
    x: member.x,
    z: member.z,
    blinded: isWearing(session, member, 'bucket'),
    hasFinder: heldItem(session, member)?.kind === 'detector',
    name: member.name,
  };

  const result = act(site, runtime, ctx, actor, {
    action: typeof data.action === 'string' ? data.action : '',
    symbol: typeof data.symbol === 'string' ? data.symbol : undefined,
    totem: typeof data.totem === 'string' ? data.totem : undefined,
  });

  if (result.rejected) {
    socket.emit(S2C.ERROR, { message: result.rejected });
    return;
  }
  if (result.changed) {
    session.worldDirty = true;
    session.saveDirty = true;
  }
  queue(session, result.events);
  if (result.solved) completeSite(session, site);
  session.lastActivityAt = now;
}

function handleSkip(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session } = found;
  if (!session.state.allowSkip) return fail(socket, 'skipping-disabled');
  if (session.hostSocketId !== socket.id) return fail(socket, 'not-host');
  const siteId = typeof (payload as { site?: unknown })?.site === 'string'
    ? (payload as { site: string }).site
    : '';
  const site = PUZZLE_BY_ID.get(siteId);
  if (!site) return;

  const events = skipSite(session.state, siteId);
  if (events.length === 0) return;
  dropRewards(session, site);
  queue(session, events);
  queue(session, refreshGate(session.state));
  session.worldDirty = true;
  session.saveDirty = true;
}

function handleDeposit(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const towerId = typeof (payload as { tower?: unknown })?.tower === 'string'
    ? (payload as { tower: string }).tower
    : '';
  const tower = TOWERS.find((t) => t.id === towerId);
  if (!tower) return;
  if (Math.hypot(member.x - tower.x, member.z - tower.z) > tower.radius) return fail(socket, 'too-far');

  // Everything red they are carrying, wherever they are carrying it.
  const orbs: WorldItem[] = [];
  for (const id of [
    ...(member.hands === null ? [] : [member.hands]),
    ...member.belt,
    ...member.pack,
  ]) {
    const item = session.items.get(id);
    if (item?.kind === 'orb') orbs.push(item);
  }
  if (orbs.length === 0) return fail(socket, 'nothing-to-give');

  for (const orb of orbs) {
    removeFromInventory(member, orb.id);
    session.items.delete(orb.id);
  }

  queue(session, deposit(session.state, tower.id, orbs.length));
  queue(session, refreshGate(session.state));
  session.worldDirty = true;
  session.saveDirty = true;
  awardAppProgress(member.userId || null, { xp: 20 * orbs.length });
}

/** Ride the cart line between the two halts, once the Yellow Tower has woken it. */
function handleCart(io: Server, socket: Socket): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  if (!session.state.unlocks.includes('cart')) return fail(socket, 'cart-asleep');

  const south = pad('cart-south');
  const north = pad('cart-north');
  const atSouth = Math.hypot(member.x - south.x, member.z - south.z) < 9;
  const atNorth = Math.hypot(member.x - north.x, member.z - north.z) < 9;
  if (!atSouth && !atNorth) return fail(socket, 'not-at-halt');

  const to = atSouth ? north : south;
  member.x = to.x + 6;
  member.z = to.z + 6;
  member.y = groundY(member.x, member.z);
  io.to(roomName(session.code)).emit(S2C.EVENT, {
    kind: 'cart',
    to: atSouth ? 'north' : 'south',
  } satisfies WorldEvent);
}

// ─── Handlers: talking ──────────────────────────────────────────────────────

function channelFor(session: Session, member: Member): ChatChannel {
  const held = heldItem(session, member);
  if (held?.kind === 'megaphone' && held.on) return 'megaphone';
  if (held?.kind === 'radio' && held.on) return 'radio';
  return 'near';
}

function actorFor(session: Session, member: Member) {
  return {
    x: member.x,
    z: member.z,
    y: (member.clientBits & BIT.CROUCH) !== 0 ? CROUCH_EYE_HEIGHT : EYE_HEIGHT,
    hasRadio: hasKind(session, member, 'radio', ['hands', 'belt']),
    hasMegaphone: heldItem(session, member)?.kind === 'megaphone',
    booth: boothAt(member.x, member.z),
  };
}

/**
 * Deliver a line of text under the same rules that govern speech.
 *
 * Not "broadcast to the room" — that would make typing strictly better than
 * talking at exactly the distances the puzzles are built around, and §8.2 is
 * explicit that neither input may be privileged. So each recipient is checked
 * individually and gets the sentence as degraded as the walls and the distance
 * make it.
 */
function handleChat(io: Server, socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const text = sanitizeString((payload as { text?: unknown })?.text, CHAT_MAX_LENGTH);
  if (!text) return;

  const channel = channelFor(session, member);
  const speaker = actorFor(session, member);
  const id = `${session.code}-${Date.now().toString(36)}-${member.slot}`;
  const seed = Math.abs(hashString(id)) || 1;
  const at = Date.now();
  const repeater = session.state.unlocks.includes('repeater');

  const line: ChatLine = { id, fromSlot: member.slot, name: member.name, text, channel, muffle: 0, at };
  session.chat.push(line);
  if (session.chat.length > CHAT_HISTORY) session.chat.shift();

  // You always hear yourself.
  socket.emit(S2C.CHAT, line);

  for (const other of session.members.values()) {
    if (other.socketId === member.socketId || !other.connected) continue;
    const heard = audibility(speaker, actorFor(session, other), { repeater, channel });
    if (!heard.audible) continue;
    io.to(other.socketId).emit(S2C.CHAT, {
      ...line,
      text: garble(text, heard.muffle, seed),
      muffle: round(heard.muffle, 2),
    } satisfies ChatLine);
  }
  session.lastActivityAt = at;
}

function handleBoard(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  const { session, member } = found;
  const item = heldItem(session, member);
  if (!item || item.kind !== 'board') return fail(socket, 'no-board');
  item.label = sanitizeString((payload as { text?: unknown })?.text, BOARD_MAX_LENGTH);
  session.worldDirty = true;
}

function handleVoiceSignal(io: Server, socket: Socket, payload: unknown): void {
  const session = sessionFor(socket);
  if (!session) return;
  const data = (payload ?? {}) as { peer?: unknown; kind?: unknown; data?: unknown };
  const peerId = typeof data.peer === 'string' ? data.peer : '';
  if (!session.members.has(peerId)) return;
  if (data.kind !== 'offer' && data.kind !== 'answer' && data.kind !== 'ice') return;
  // The hub is a post box for WebRTC and reads none of it — the audio itself is
  // peer to peer, which is the only way twelve spatial voices are affordable.
  io.to(peerId).emit(S2C.VOICE_SIGNAL, { peer: socket.id, kind: data.kind, data: data.data });
}

function handleVoiceState(socket: Socket, payload: unknown): void {
  const found = memberFor(socket);
  if (!found) return;
  found.member.speaking = (payload as { speaking?: unknown })?.speaking === true;
}

function hashString(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return h;
}

// ─── Tick ───────────────────────────────────────────────────────────────────

function derivedBits(session: Session, member: Member): number {
  let bits = member.clientBits;
  const held = heldItem(session, member);

  if (held?.kind === 'torch' && held.on) bits |= BIT.TORCH;
  if (held?.kind === 'laser' && held.on) bits |= BIT.LASER;
  if (held?.kind === 'binoculars' && held.on) bits |= BIT.BINOCULARS;
  if (held?.kind === 'board') bits |= BIT.BOARD;
  if (held?.kind === 'radio' && held.on) bits |= BIT.RADIO;
  if (held?.kind === 'megaphone' && held.on) bits |= BIT.MEGAPHONE;
  if (isWearing(session, member, 'bucket')) bits |= BIT.BLIND;
  if (hasKind(session, member, 'radio', ['hands', 'belt'])) bits |= BIT.HAS_RADIO;
  if (member.speaking) bits |= BIT.SPEAKING;

  return bits;
}

function tickFrame(session: Session, now: number): { t: number; p: PlayerTick[]; i: ItemTick[] } {
  const players: PlayerTick[] = [];
  for (const member of session.members.values()) {
    member.bits = derivedBits(session, member);
    const gesture = now < member.gestureUntil ? member.gesture : 0;
    players.push([
      member.slot,
      round(member.x),
      round(member.y),
      round(member.z),
      round(member.yaw, 3),
      round(member.pitch, 3),
      member.bits,
      gesture,
    ]);
  }

  const items: ItemTick[] = [];
  for (const item of session.items.values()) {
    const holder = item.holder ? session.members.get(item.holder) : null;
    let bits = 0;
    if (item.on) bits |= 1;
    if (holder) bits |= 2;
    if (!item.resting) bits |= 4;
    if (holder && item.slot) bits |= ITEM_SLOTS.indexOf(item.slot) << ITEM_SLOT_SHIFT;
    items.push([
      item.id,
      round(item.x),
      round(item.y),
      round(item.z),
      holder ? holder.slot : -1,
      bits,
    ]);
  }

  return { t: now, p: players, i: items };
}

/** Only send a private reveal when it actually changed for that player. */
function revealKey(reveal: Reveal | null): string {
  if (!reveal) return '';
  if (reveal.kind === 'finder') {
    // Quantised so walking around does not produce a message per frame, but
    // finely enough that "warmer" is still a usable word.
    return `finder:${reveal.site}:${Math.round(reveal.distance / 3)}`;
  }
  return JSON.stringify(reveal);
}

function pushReveals(io: Server, session: Session, ctx: PuzzleContext): void {
  for (const member of session.members.values()) {
    if (!member.connected) continue;
    const player: PuzzlePlayer = {
      slot: member.slot,
      x: member.x,
      z: member.z,
      blinded: isWearing(session, member, 'bucket'),
      hasFinder: heldItem(session, member)?.kind === 'detector',
    };

    let reveal: Reveal | null = null;
    for (const site of PUZZLE_SITES) {
      const runtime = session.state.runtimes[site.id];
      if (!runtime) continue;
      const candidate = revealFor(site, runtime, ctx, player);
      if (candidate) {
        reveal = candidate;
        break;
      }
    }

    const key = revealKey(reveal);
    if (key === member.revealKey) continue;
    member.revealKey = key;
    io.to(member.socketId).emit(S2C.REVEAL, reveal ?? { kind: 'clear', site: '' });
  }
}

function tickSession(io: Server, session: Session, now: number): void {
  const dt = Math.min(0.5, (now - session.lastTickAt) / 1000);
  session.lastTickAt = now;

  const someoneHere = [...session.members.values()].some((m) => m.connected);
  // The world only moves while somebody is on it: coming back after a week
  // should not mean coming back to a different time of day.
  if (someoneHere) advanceClock(session.state, dt * 1000);

  integrateItems(session, dt, now);

  // Reclaim seats whose grace has run out, and their gear with them.
  for (const member of [...session.members.values()]) {
    if (member.connected || member.disconnectedAt === null) continue;
    if (now - member.disconnectedAt < DISCONNECT_GRACE_MS) continue;
    releaseMember(io, session, member);
  }
  if (!sessions.has(session.code)) return;

  const ctx = context(session, now);
  for (const site of PUZZLE_SITES) {
    const runtime = session.state.runtimes[site.id];
    if (!runtime) continue;
    const outcome = evaluate(site, runtime, ctx);
    if (outcome.changed) {
      session.worldDirty = true;
      session.saveDirty = true;
    }
    queue(session, outcome.events);
    if (outcome.solved) completeSite(session, site);
  }

  // The ending is a walk, not a button. Once the White Gate is open, somebody
  // has to actually go and stand under it — which, on an island this size,
  // means the group makes the trip together one last time (§13.5).
  if (!session.state.finished && session.state.unlocks.includes('gate')) {
    const gate = TOWERS.find((t) => t.id === 'gate');
    if (gate && ctx.players.some((p) => Math.hypot(p.x - gate.x, p.z - gate.z) < 7)) {
      queue(session, finish(session.state));
      session.worldDirty = true;
      session.saveDirty = true;
    }
  }

  io.to(roomName(session.code)).emit(S2C.TICK, tickFrame(session, now));
  pushReveals(io, session, ctx);

  const events = pendingEvents.get(session.code);
  if (events?.length) {
    pendingEvents.set(session.code, []);
    emitEvents(io, session, events);
  }

  if (session.worldDirty || now - session.lastWorldAt > WORLD_HEARTBEAT_MS) pushWorld(io, session, now);

  if (session.saveDirty && now - session.lastSavedAt > 15_000) void persist(session);

  if (someoneHere) session.lastActivityAt = now;
  else if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) closeSession(session);
}

function ensureTicking(io: Server): void {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    const now = Date.now();
    for (const session of [...sessions.values()]) {
      try {
        tickSession(io, session, now);
      } catch (error) {
        logger.error({ event: 'mm_tick_error', code: session.code, error: String(error) });
      }
    }
    if (sessions.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }, TICK_MS);
  if (typeof tickTimer === 'object' && 'unref' in tickTimer) tickTimer.unref();
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerMassiveMarchHandlers(io: Server, socket: Socket): void {
  const limited = (event: string, handler: (payload: unknown) => void) => {
    socket.on(event, (payload: unknown) => {
      if (!checkRateLimit(socket.id, event)) return;
      try {
        handler(payload);
      } catch (error) {
        logger.error({ event: 'mm_handler_error', name: event, error: String(error) });
      }
    });
  };

  limited(C2S.CREATE, (payload) => void handleCreate(io, socket, payload));
  limited(C2S.JOIN, (payload) => handleJoin(io, socket, payload));
  limited(C2S.RESUME, (payload) => void handleResume(io, socket, payload));
  limited(C2S.LIST, () => void handleList(socket));
  limited(C2S.LEAVE, () => removeMember(io, socket, { immediate: true }));
  limited(C2S.SETTINGS, (payload) => handleSettings(io, socket, payload));

  limited(C2S.MOVE, (payload) => handleMove(socket, payload));
  limited(C2S.GESTURE, (payload) => handleGesture(socket, payload));

  limited(C2S.CHAT, (payload) => handleChat(io, socket, payload));
  limited(C2S.BOARD, (payload) => handleBoard(socket, payload));

  limited(C2S.TAKE, (payload) => handleTake(socket, payload));
  limited(C2S.STOW, (payload) => handleStow(socket, payload));
  limited(C2S.EQUIP, (payload) => handleEquip(socket, payload));
  limited(C2S.DROP, () => handleDrop(socket));
  limited(C2S.THROW, (payload) => handleThrow(socket, payload));
  limited(C2S.KICK, (payload) => handleKick(socket, payload));
  limited(C2S.USE, (payload) => handleUse(io, socket, payload));
  limited(C2S.PACK, (payload) => handlePack(socket, payload));

  limited(C2S.ACT, (payload) => handleAct(socket, payload));
  limited(C2S.SKIP, (payload) => handleSkip(socket, payload));
  limited(C2S.DEPOSIT, (payload) => handleDeposit(socket, payload));
  limited(C2S.CART, () => handleCart(io, socket));

  limited(C2S.VOICE_SIGNAL, (payload) => handleVoiceSignal(io, socket, payload));
  limited(C2S.VOICE_STATE, (payload) => handleVoiceState(socket, payload));
}

export function handleMassiveMarchDisconnect(io: Server, socket: Socket): void {
  removeMember(io, socket, { immediate: false });
}
