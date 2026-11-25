/**
 * RMHCharacters parties: the database half (server-only).
 *
 * A party is a game master's table. Every party member sees each character's computed summary (`party-summary.ts`);
 * only the game master may open a sheet, only a current member's, only when that player switched `sheetShared` on, and
 * never with `notes` or `portrait`.
 *
 * **One door to `RmhCharacter.data`.** `readCharacterSheets` below is the only place this module selects a sheet's
 * data. What leaves it is a computed summary (`summariesFor`) or one stripped sheet (`readPartySheet`), so a second
 * path cannot return a raw sheet (the source scan in `api/__tests__/party.server.test.ts` holds it to one select).
 *
 * **Every read re-checks the membership row**, so leaving, being removed, swapping or switching sharing off ends access
 * on the next request. A refusal to read is `null` here and a 404 in the routes, whatever the reason.
 *
 * **Caps and races.** The seat count and the per-member caps run in a transaction that first takes
 * `lockKey(tx, 'character-party:<id>')` and `lockKey(tx, 'character-party-owner:<userId>')`. The turn order changes by
 * compare-and-set on `orderVersion`: a write carries the version it read, and one against an older version is refused.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ERROR_CODES, refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { userChipSelect } from '@/lib/user-display';
import { loadDnd5e, loadPf2e } from './data';
import { normalizeCharacter } from './factory';
import { PARTY_MAX_MEMBERS, PARTY_MAX_ORDER, PARTY_MAX_PLAYING, PARTY_MAX_RUN } from './party-limits';
import { orderWithinLimits, turnEntry } from './party-schema';
import { partySummary, type PartySummary } from './party-summary';
import type {
  PartyDetail,
  PartyJoinPreview,
  PartyListItem,
  PartyMemberView,
  PartyOrderResult,
  SharedSheet,
  TurnLine,
} from './party.contract';
import type { Character, GameSystem } from './types';

type StoredEntry = ReturnType<typeof turnEntry.parse>;
type WriteOrder =
  { op: 'set'; version: number; initiative: StoredEntry[]; turnIndex: number } | { op: 'advance'; version: number };

export type Refused = { ok: false; code: ErrorCode };
const refuse = (code: ErrorCode): Refused => ({ ok: false, code });

/** The JSON a route answers with for a refusal code (its status comes from the catalogue). */
export function partyRefusal(code: ErrorCode): Response {
  return Response.json(
    { ...refusalBody(code) },
    { status: ERROR_CODES[code].http, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** 404 for every read or write the caller may not make, whatever the reason. */
export const partyNotFound = () => partyRefusal('NOT_FOUND');

/** 16 URL-safe characters: 96 random bits, and the whole credential for joining. */
export const newInviteCode = () => randomBytes(12).toString('base64url');

const nameOf = (u: { name: string | null; handle: string | null } | null | undefined) => u?.name ?? u?.handle ?? '';

/* -------------------------------------------------------------------------- */
/* The one reader of a sheet's data                                           */
/* -------------------------------------------------------------------------- */

interface SheetRow {
  userId: string;
  character: Character;
}

/** The only select of `RmhCharacter.data` in this module. Rows come back already normalised. */
async function readCharacterSheets(ids: readonly string[]): Promise<Map<string, SheetRow>> {
  const out = new Map<string, SheetRow>();
  if (ids.length === 0) return out;
  const rows = await prisma.rmhCharacter.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, userId: true, data: true },
  });
  for (const r of rows) {
    const character = normalizeCharacter(r.data);
    if (character) out.set(r.id, { userId: r.userId, character });
  }
  return out;
}

async function summarise(c: Character): Promise<PartySummary> {
  return c.system === 'dnd5e' ? partySummary(c, await loadDnd5e()) : partySummary(c, await loadPf2e());
}

/** A summary per member (null when the character cannot be read or is not the member's). Never returns `data`. */
async function summariesFor(members: readonly { userId: string; characterId: string }[]) {
  const sheets = await readCharacterSheets(members.map((m) => m.characterId));
  const out = new Map<string, PartySummary | null>();
  for (const m of members) {
    const row = sheets.get(m.characterId);
    out.set(m.userId, row && row.userId === m.userId ? await summarise(row.character) : null);
  }
  return out;
}

/** A sheet with the player's private `notes` and the `portrait` removed. The one place a sheet is stripped. */
export function stripSheet(c: Character): SharedSheet {
  const { notes: _notes, portrait: _portrait, ...rest } = c;
  void _notes;
  void _portrait;
  return rest;
}

/**
 * The game master opens one player's sheet. Only the party's game master, only a current member whose `sheetShared` is
 * on; anything else is `null` (a 404), so the answer never tells whether the player is in the party.
 */
export async function readPartySheet(partyId: string, gmId: string, memberUserId: string): Promise<SharedSheet | null> {
  const member = await prisma.rmhCharacterPartyMember.findFirst({
    where: { partyId, userId: memberUserId, sheetShared: true, party: { ownerId: gmId } },
    select: { characterId: true },
  });
  if (!member) return null;
  const row = (await readCharacterSheets([member.characterId])).get(member.characterId);
  if (!row || row.userId !== memberUserId) return null;
  return stripSheet(row.character);
}

/* -------------------------------------------------------------------------- */
/* Reading parties                                                            */
/* -------------------------------------------------------------------------- */

export async function listParties(userId: string): Promise<PartyListItem[]> {
  const rows = await prisma.rmhCharacterParty.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { updatedAt: 'desc' },
    take: PARTY_MAX_RUN + PARTY_MAX_PLAYING,
    select: {
      id: true,
      name: true,
      system: true,
      ownerId: true,
      owner: { select: userChipSelect },
      _count: { select: { members: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    system: r.system as GameSystem,
    role: r.ownerId === userId ? ('gm' as const) : ('player' as const),
    gm: nameOf(r.owner),
    players: r._count.members,
  }));
}

/** Stored lines → the lines a reader sees: members named from the membership (a gone member is dropped). */
function resolveOrder(stored: unknown, names: ReadonlyMap<string, string>): TurnLine[] {
  const list: StoredEntry[] = [];
  if (Array.isArray(stored)) {
    for (const raw of stored) {
      const e = turnEntry.safeParse(raw);
      if (e.success) list.push(e.data);
    }
  }
  const out: TurnLine[] = [];
  for (const e of list) {
    if (e.kind === 'extra') out.push({ id: e.id, kind: 'extra', userId: null, name: e.name, value: e.value });
    else if (names.has(e.userId))
      out.push({ id: e.id, kind: 'member', userId: e.userId, name: names.get(e.userId) ?? '', value: e.value });
  }
  return out;
}

const clampIndex = (i: number, length: number) => (length === 0 ? 0 : Math.min(Math.max(0, i), length - 1));

/** One party for one of its members (the game master or a player); `null` for anyone else. */
export async function getParty(partyId: string, userId: string): Promise<PartyDetail | null> {
  const p = await prisma.rmhCharacterParty.findFirst({
    where: { id: partyId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: {
      id: true,
      name: true,
      system: true,
      ownerId: true,
      inviteCode: true,
      initiative: true,
      turnIndex: true,
      orderVersion: true,
      owner: { select: userChipSelect },
      members: {
        orderBy: { joinedAt: 'asc' },
        take: PARTY_MAX_MEMBERS,
        select: {
          userId: true,
          characterId: true,
          sheetShared: true,
          joinedAt: true,
          user: { select: userChipSelect },
        },
      },
    },
  });
  if (!p) return null;
  const isGm = p.ownerId === userId;
  const summaries = await summariesFor(p.members);
  const names = new Map(p.members.map((m) => [m.userId, nameOf(m.user)]));
  const members: PartyMemberView[] = p.members.map((m) => ({
    userId: m.userId,
    name: nameOf(m.user),
    joinedAt: m.joinedAt.getTime(),
    isGm: m.userId === p.ownerId,
    // Whether a player shares their sheet is for the game master and the player; the others read false.
    sheetShared: (isGm || m.userId === userId) && m.sheetShared,
    summary: summaries.get(m.userId) ?? null,
  }));
  const order = resolveOrder(p.initiative, names);
  return {
    id: p.id,
    name: p.name,
    system: p.system as GameSystem,
    role: isGm ? 'gm' : 'player',
    gm: nameOf(p.owner),
    inviteCode: isGm ? p.inviteCode : null,
    members,
    order,
    turnIndex: clampIndex(p.turnIndex, order.length),
    orderVersion: p.orderVersion,
  };
}

/** What an invite link shows before the player confirms. `null` for a code that matches nothing. */
export async function previewJoin(code: string): Promise<PartyJoinPreview | null> {
  const p = await prisma.rmhCharacterParty.findUnique({
    where: { inviteCode: code },
    select: { name: true, system: true, owner: { select: userChipSelect }, _count: { select: { members: true } } },
  });
  if (!p) return null;
  return {
    name: p.name,
    system: p.system as GameSystem,
    gm: nameOf(p.owner),
    players: p._count.members,
    max: PARTY_MAX_MEMBERS,
  };
}

/* -------------------------------------------------------------------------- */
/* Writing parties                                                            */
/* -------------------------------------------------------------------------- */

export async function createParty(
  userId: string,
  input: { name: string; system: GameSystem },
): Promise<{ ok: true; id: string } | Refused> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `character-party-owner:${userId}`);
    const run = await tx.rmhCharacterParty.count({ where: { ownerId: userId } });
    if (run >= PARTY_MAX_RUN) return refuse('PARTY_LIMIT');
    const row = await tx.rmhCharacterParty.create({
      data: { ownerId: userId, name: input.name, system: input.system, inviteCode: newInviteCode() },
      select: { id: true },
    });
    return { ok: true as const, id: row.id };
  });
}

export async function renameParty(partyId: string, ownerId: string, name: string): Promise<boolean> {
  const r = await prisma.rmhCharacterParty.updateMany({ where: { id: partyId, ownerId }, data: { name } });
  return r.count > 0;
}

/** Delete a party the caller runs. The players' characters are untouched. */
export async function deleteParty(partyId: string, ownerId: string): Promise<boolean> {
  const r = await prisma.rmhCharacterParty.deleteMany({ where: { id: partyId, ownerId } });
  return r.count > 0;
}

/** A new invite code; the old one stops working at once. `null` when the caller does not run the party. */
export async function rotateCode(partyId: string, ownerId: string): Promise<string | null> {
  const inviteCode = newInviteCode();
  const r = await prisma.rmhCharacterParty.updateMany({ where: { id: partyId, ownerId }, data: { inviteCode } });
  return r.count > 0 ? inviteCode : null;
}

/**
 * Join with an invite code, bringing one of the caller's characters of the party's system.
 *
 * Unknown (or rotated) code → NOT_FOUND. Refused, inside the transaction that checks the caps: a block either way with
 * the game master (`UserBlock`), an account under a ban, a full party, the caller's own caps, the wrong system.
 */
export async function joinParty(
  userId: string,
  input: { code: string; characterId: string; sheetShared: boolean },
): Promise<{ ok: true; id: string } | Refused> {
  const found = await prisma.rmhCharacterParty.findUnique({ where: { inviteCode: input.code }, select: { id: true } });
  if (!found) return refuse('NOT_FOUND');
  const partyId = found.id;
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `character-party:${partyId}`);
    await lockKey(tx, `character-party-owner:${userId}`);
    // Re-read under the lock: the code may have been changed while this request waited.
    const party = await tx.rmhCharacterParty.findFirst({
      where: { id: partyId, inviteCode: input.code },
      select: { id: true, ownerId: true, system: true },
    });
    if (!party) return refuse('NOT_FOUND');

    const me = await tx.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    if (!me || (me.bannedUntil && me.bannedUntil.getTime() > Date.now())) return refuse('PARTY_JOIN_REFUSED');
    if (userId !== party.ownerId) {
      const block = await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: party.ownerId },
            { blockerId: party.ownerId, blockedId: userId },
          ],
        },
        select: { id: true },
      });
      if (block) return refuse('PARTY_JOIN_REFUSED');
    }

    const character = await tx.rmhCharacter.findFirst({
      where: { id: input.characterId, userId },
      select: { system: true },
    });
    if (!character) return refuse('NOT_FOUND');
    if (character.system !== party.system) return refuse('PARTY_SYSTEM_MISMATCH');

    const already = await tx.rmhCharacterPartyMember.findFirst({
      where: { partyId, userId },
      select: { userId: true },
    });
    if (already) return refuse('PARTY_ALREADY_MEMBER');
    if ((await tx.rmhCharacterPartyMember.count({ where: { partyId } })) >= PARTY_MAX_MEMBERS)
      return refuse('PARTY_FULL');
    if ((await tx.rmhCharacterPartyMember.count({ where: { userId } })) >= PARTY_MAX_PLAYING)
      return refuse('PARTY_LIMIT');

    await tx.rmhCharacterPartyMember.create({
      data: { partyId, userId, characterId: input.characterId, sheetShared: input.sheetShared },
    });
    return { ok: true as const, id: partyId };
  });
}

/** Leave a party (the game master leaves only the character they brought). `false` when not a member. */
export async function leaveParty(partyId: string, userId: string): Promise<boolean> {
  const r = await prisma.rmhCharacterPartyMember.deleteMany({ where: { partyId, userId } });
  return r.count > 0;
}

/** The game master removes a player (their own entry is removed with `leaveParty`). `false` when it matched nothing. */
export async function removeMember(partyId: string, ownerId: string, memberUserId: string): Promise<boolean> {
  const r = await prisma.rmhCharacterPartyMember.deleteMany({
    where: { partyId, userId: memberUserId, party: { ownerId } },
  });
  return r.count > 0;
}

/** A player brings another character: the caller's own, of the party's system. */
export async function swapCharacter(
  partyId: string,
  userId: string,
  characterId: string,
): Promise<{ ok: true } | Refused> {
  const mine = await prisma.rmhCharacterPartyMember.findFirst({
    where: { partyId, userId },
    select: { party: { select: { system: true } } },
  });
  if (!mine) return refuse('NOT_FOUND');
  const character = await prisma.rmhCharacter.findFirst({
    where: { id: characterId, userId },
    select: { system: true },
  });
  if (!character) return refuse('NOT_FOUND');
  if (character.system !== mine.party.system) return refuse('PARTY_SYSTEM_MISMATCH');
  const r = await prisma.rmhCharacterPartyMember.updateMany({ where: { partyId, userId }, data: { characterId } });
  return r.count > 0 ? { ok: true } : refuse('NOT_FOUND');
}

/** A player's own choice. `false` when they are not in the party. */
export async function setSheetShared(partyId: string, userId: string, sheetShared: boolean): Promise<boolean> {
  const r = await prisma.rmhCharacterPartyMember.updateMany({ where: { partyId, userId }, data: { sheetShared } });
  return r.count > 0;
}

/**
 * The turn order, game master only, compare-and-set: a write carries the `orderVersion` it was read at and is refused
 * (PARTY_ORDER_CHANGED) when the stored one has moved. `advance` moves the turn on in the server's own copy.
 */
export async function writeOrder(
  partyId: string,
  ownerId: string,
  body: WriteOrder,
): Promise<{ ok: true; result: PartyOrderResult } | Refused> {
  const p = await prisma.rmhCharacterParty.findFirst({
    where: { id: partyId, ownerId },
    select: {
      initiative: true,
      turnIndex: true,
      orderVersion: true,
      members: { select: { userId: true, user: { select: userChipSelect } } },
    },
  });
  if (!p) return refuse('NOT_FOUND');
  if (p.orderVersion !== body.version) return refuse('PARTY_ORDER_CHANGED');
  const names = new Map(p.members.map((m) => [m.userId, nameOf(m.user)]));

  let lines: TurnLine[];
  let turnIndex: number;
  if (body.op === 'set') {
    const entries = body.initiative;
    if (!orderWithinLimits(entries) || entries.length > PARTY_MAX_ORDER) return refuse('INVALID_INPUT');
    if (entries.some((e) => e.kind === 'member' && !names.has(e.userId))) return refuse('INVALID_INPUT');
    if (body.turnIndex > Math.max(0, entries.length - 1)) return refuse('INVALID_INPUT');
    lines = resolveOrder(entries, names);
    turnIndex = body.turnIndex;
  } else {
    lines = resolveOrder(p.initiative, names);
    turnIndex = lines.length === 0 ? 0 : (clampIndex(p.turnIndex, lines.length) + 1) % lines.length;
  }
  const stored = lines.map((l) =>
    l.kind === 'member'
      ? { id: l.id, kind: 'member', userId: l.userId, value: l.value }
      : { id: l.id, kind: 'extra', name: l.name, value: l.value },
  );
  const r = await prisma.rmhCharacterParty.updateMany({
    where: { id: partyId, ownerId, orderVersion: body.version },
    data: { initiative: stored, turnIndex, orderVersion: { increment: 1 } },
  });
  if (r.count === 0) return refuse('PARTY_ORDER_CHANGED');
  return { ok: true, result: { order: lines, turnIndex, orderVersion: body.version + 1 } };
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

/** The member's own data for the account export: parties they run (extras' names included) and their memberships. */
export async function exportCharacterParties(userId: string) {
  const [run, memberships] = await Promise.all([
    prisma.rmhCharacterParty.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      select: { name: true, system: true, createdAt: true, initiative: true },
    }),
    prisma.rmhCharacterPartyMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { characterId: true, joinedAt: true, party: { select: { name: true } } },
    }),
  ]);
  return {
    partiesRun: run.map((p) => ({
      name: p.name,
      system: p.system,
      created: p.createdAt.toISOString(),
      extras: (Array.isArray(p.initiative) ? p.initiative : []).flatMap((raw) => {
        const e = turnEntry.safeParse(raw);
        return e.success && e.data.kind === 'extra' ? [e.data.name] : [];
      }),
    })),
    memberships: memberships.map((m) => ({
      partyName: m.party.name,
      characterId: m.characterId,
      joined: m.joinedAt.toISOString(),
    })),
  };
}

/** Erasure operations for `anonymizeAccount`: the parties the member runs (members first) and their memberships. */
export function characterPartyErasureOps(userId: string) {
  return [
    prisma.rmhCharacterPartyMember.deleteMany({ where: { party: { ownerId: userId } } }),
    prisma.rmhCharacterParty.deleteMany({ where: { ownerId: userId } }),
    prisma.rmhCharacterPartyMember.deleteMany({ where: { userId } }),
  ];
}
