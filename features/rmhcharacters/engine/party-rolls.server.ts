/**
 * Rolls made for the table: the database half (server-only).
 *
 * The server rolls. A request names what to roll; this module reads the caller's own character in that party, asks the
 * rules engine for the modifier (`modifierFor`), rolls on `node:crypto` and stores the dice, the modifier and the
 * total. It never reads a modifier, a die or a total from the client. The random source is a parameter, so a test can
 * seed it.
 *
 * **Every read re-checks the seat.** A party's log is for its game master and its current members; anyone else, a
 * removed player included, gets `null` (a 404 in the routes), whatever the reason.
 *
 * **Visibility is part of the query** (`visibilityWhere`): a hidden roll is never read, so it cannot leak by a later
 * filter being forgotten. A `secret` roll is a game master's and is in no player's response.
 *
 * **Names are joined at read time.** A roll stores `characterId` and `userId`, never a name; the view takes the name
 * from the character currently seated for that player. A roll whose character has left the party reads "left".
 *
 * **Caps.** The insert and the trim to `PARTY_ROLL_KEEP` run in one transaction that first takes
 * `lockKey(tx, 'party-rolls:<partyId>')`, so two rolls at once cannot both pass the trim.
 */
import { randomBytes } from 'node:crypto';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ERROR_CODES, refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import type { WordSource } from '@/lib/toolbox/random';
import { loadDnd5e, loadPf2e } from './data';
import { normalizeCharacter } from './factory';
import {
  cursorOf,
  damageTextFor,
  exhaustionOf,
  flatOf,
  isD20Kind,
  labelFor,
  modifierFor,
  notationOf,
  PARTY_ROLL_KEEP,
  PARTY_ROLL_PAGE,
  rollPolicy,
  visibilityWhere,
  type PartyRoll,
  type PartyRollKind,
  type RollBody,
  type RollVisibility,
} from './party-rolls';
import type { PartyRollList } from './party-rolls.contract';
import { degreeOfSuccess, rollD20, rollDamage, rollFree, type Degree, type RollOutcome } from './rolls';
import type { Character } from './types';

export type Refused = { ok: false; code: ErrorCode };
const refuse = (code: ErrorCode): Refused => ({ ok: false, code });

/** The JSON a route answers with for a refusal code (its status comes from the catalogue). */
export function rollRefusal(code: ErrorCode): Response {
  return Response.json(
    { ...refusalBody(code) },
    { status: ERROR_CODES[code].http, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** 32-bit words from the operating system's generator (`node:crypto`). */
export const nodeCryptoWords: WordSource = () => randomBytes(4).readUInt32BE(0);

const NAME_MAX = 120;

/** The party the caller runs or plays in, or `null` (a 404 for anyone else, whatever the reason). */
async function partyFor(userId: string, partyId: string) {
  return prisma.rmhCharacterParty.findFirst({
    where: { id: partyId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: { id: true, ownerId: true, system: true },
  });
}

/** A player under a ban, or blocked in either direction with the game master, is shut out of the table. */
async function shutOut(userId: string, party: { ownerId: string }): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  if (!me || (me.bannedUntil && me.bannedUntil.getTime() > Date.now())) return true;
  if (party.ownerId === userId) return false;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: party.ownerId },
        { blockerId: party.ownerId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

interface Seat {
  characterId: string;
  name: string;
}

type StoredRoll = {
  id: string;
  userId: string;
  characterId: string | null;
  kind: string;
  label: string;
  notation: string;
  dice: number[];
  modifier: number;
  total: number;
  mode: string;
  visibility: string;
  dc: number | null;
  degree: string | null;
  createdAt: Date;
};

const ROLL_SELECT = {
  id: true,
  userId: true,
  characterId: true,
  kind: true,
  label: true,
  notation: true,
  dice: true,
  modifier: true,
  total: true,
  mode: true,
  visibility: true,
  dc: true,
  degree: true,
  createdAt: true,
} as const;

/** One stored row as a viewer sees it. `seats` is the party's current seating (player → character and name). */
function viewOf(row: StoredRoll, ownerId: string, seats: ReadonlyMap<string, Seat>, viewerId: string): PartyRoll {
  const seat = seats.get(row.userId);
  const who: PartyRoll['who'] =
    row.characterId === null
      ? row.userId === ownerId
        ? { kind: 'gm' }
        : { kind: 'left' }
      : seat && seat.characterId === row.characterId
        ? { kind: 'character', name: seat.name }
        : { kind: 'left' };
  return {
    id: row.id,
    at: row.createdAt.getTime(),
    kind: row.kind as PartyRollKind,
    label: row.label,
    notation: row.notation,
    dice: row.dice,
    modifier: row.modifier,
    total: row.total,
    mode: row.mode as PartyRoll['mode'],
    visibility: row.visibility as RollVisibility,
    dc: row.dc,
    degree: row.degree as Degree | null,
    who,
    mine: row.userId === viewerId,
  };
}

/** The party's seating with each seated character's current name (the `name` column, never the sheet's data). */
async function seatsOf(partyId: string): Promise<Map<string, Seat>> {
  const members = await prisma.rmhCharacterPartyMember.findMany({
    where: { partyId },
    select: { userId: true, characterId: true },
  });
  const rows = Array.isArray(members) ? members : [];
  const names = await prisma.rmhCharacter.findMany({
    where: { id: { in: rows.map((m) => m.characterId) } },
    select: { id: true, name: true },
  });
  const byId = new Map((Array.isArray(names) ? names : []).map((c) => [c.id, c.name]));
  return new Map(
    rows.map((m) => [
      m.userId,
      { characterId: m.characterId, name: (byId.get(m.characterId) ?? '').slice(0, NAME_MAX) },
    ]),
  );
}

/* -------------------------------------------------------------------------- */
/* Rolling                                                                    */
/* -------------------------------------------------------------------------- */

interface Plan {
  kind: PartyRollKind;
  label: string;
  notation: string;
  dice: number[];
  modifier: number;
  total: number;
  mode: PartyRoll['mode'];
  degree: Degree | null;
}

const allDice = (o: RollOutcome) => o.result.terms.flatMap((t) => t.dice.map((d) => d.value));

/** The first die of a d20 as the roll's natural result, for a degree on a free roll. */
function firstD20(o: RollOutcome): number | null {
  const first = o.result.terms.find((t) => t.term.kind === 'dice');
  return first && first.term.kind === 'dice' && first.term.sides === 20 ? (first.dice[0]?.value ?? null) : null;
}

/**
 * Roll for the table. Order: the party and the caller's seat, a ban or a block with the game master, the policy (who
 * may roll what), the caller's own character, then the roll itself and its insert.
 */
export async function rollForParty(
  userId: string,
  partyId: string,
  input: RollBody,
  deps: { rng?: WordSource } = {},
): Promise<{ ok: true; roll: PartyRoll } | Refused> {
  const rng = deps.rng ?? nodeCryptoWords;
  const party = await partyFor(userId, partyId);
  if (!party) return refuse('NOT_FOUND');
  const isGm = party.ownerId === userId;

  if (await shutOut(userId, party)) return refuse('FORBIDDEN');

  const seat = await prisma.rmhCharacterPartyMember.findFirst({
    where: { partyId, userId },
    select: { characterId: true },
  });
  const req = input.roll;
  const refused = rollPolicy({
    isGm,
    hasSeat: !!seat,
    system: party.system as 'dnd5e' | 'pf2e',
    req,
    visibility: input.visibility,
    dc: input.dc,
  });
  if (refused) return refuse(refused);

  // The caller's own sheet in this party: the one place this module selects a character's data.
  let character: Character | null = null;
  if (req.kind !== 'free') {
    const row = seat
      ? await prisma.rmhCharacter.findFirst({ where: { id: seat.characterId, userId }, select: { data: true } })
      : null;
    character = row ? normalizeCharacter(row.data) : null;
    if (!character || character.system !== party.system) return refuse('PARTY_ROLL_NO_CHARACTER');
  }

  const plan = await planRoll(character, party.system, input, rng);
  if (!plan) return refuse('INVALID_INPUT');

  const created = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `party-rolls:${partyId}`);
    const row = await tx.rmhCharacterPartyRoll.create({
      data: {
        partyId,
        userId,
        // A game master's free roll carries no character: it reads "Game master".
        characterId: req.kind === 'free' && isGm ? null : (seat?.characterId ?? null),
        kind: plan.kind,
        label: plan.label,
        notation: plan.notation,
        dice: plan.dice,
        modifier: plan.modifier,
        total: plan.total,
        mode: plan.mode,
        visibility: input.visibility,
        dc: input.dc ?? null,
        degree: plan.degree,
      },
      select: ROLL_SELECT,
    });
    // Keep the newest PARTY_ROLL_KEEP: whatever sits past that position is older and goes, in this transaction.
    const old = await tx.rmhCharacterPartyRoll.findMany({
      where: { partyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: PARTY_ROLL_KEEP,
      select: { id: true },
    });
    if (old.length > 0) await tx.rmhCharacterPartyRoll.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return row;
  });

  const seats = await seatsOf(partyId);
  return { ok: true, roll: viewOf(created, party.ownerId, seats, userId) };
}

/** What to roll and how it will be stored, or `null` when the request does not apply to this sheet. */
async function planRoll(
  character: Character | null,
  system: string,
  input: RollBody,
  rng: WordSource,
): Promise<Plan | null> {
  const req = input.roll;
  const label = labelFor(req);

  if (req.kind === 'free') {
    const r = rollFree(req.notation, rng);
    if (!r.ok) return null;
    const o = r.outcome;
    const terms = o.result.terms.map((t) => t.term);
    const natural = firstD20(o);
    return {
      kind: 'free',
      label,
      notation: notationOf(terms),
      dice: allDice(o),
      modifier: flatOf(terms),
      total: o.total,
      mode: 'normal',
      degree: input.dc !== undefined && natural !== null ? degreeOfSuccess(o.total, natural, input.dc) : null,
    };
  }
  if (!character) return null;
  const data = system === 'dnd5e' ? await loadDnd5e() : await loadPf2e();

  if (req.kind === 'damage') {
    const text = damageTextFor(character, req, data);
    if (text === null) return null;
    const out = rollDamage(
      text,
      character.system === 'pf2e' ? { doubleTotal: req.critical } : { critical: req.critical },
      rng,
    );
    if (!out) return null;
    const terms = out.result.terms.map((t) => t.term);
    return {
      kind: 'damage',
      label,
      notation: notationOf(terms, out.multiplier ?? 1),
      dice: allDice(out),
      modifier: flatOf(terms),
      total: out.total,
      mode: 'normal',
      degree: null,
    };
  }

  if (!isD20Kind(req.kind)) return null;
  const bonus = modifierFor(character, req, data);
  if (bonus === null) return null;
  const mode = character.system === 'dnd5e' ? input.mode : 'normal';
  const out = rollD20(
    {
      bonus,
      mode,
      exhaustion: exhaustionOf(character),
      attack: character.system === 'dnd5e' && req.kind === 'attack',
      ...(input.dc === undefined ? {} : { dc: input.dc }),
    },
    rng,
  );
  const terms = out.result.terms.map((t) => t.term);
  return {
    kind: req.kind,
    label,
    notation: notationOf(terms),
    // The d20 (or both, with advantage); the constants are in `modifier`.
    dice: out.result.terms[0]?.dice.map((d) => d.value) ?? [],
    modifier: flatOf(terms),
    total: out.total,
    mode,
    degree: out.degree,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One page of the log for one member, newest first. `after` is the cursor of the oldest roll the caller already holds.
 * `null` for anyone who is not in the party now (a removed player included).
 */
export async function listPartyRolls(userId: string, partyId: string, after?: string): Promise<PartyRollList | null> {
  const party = await partyFor(userId, partyId);
  if (!party) return null;
  // A banned or blocked player reads nothing: the same 404 as a removed one.
  if (await shutOut(userId, party)) return null;
  const viewer = { userId, isGm: party.ownerId === userId };

  const and: Record<string, unknown>[] = [visibilityWhere(viewer)];
  if (after) {
    const at = /^(\d+)_(.+)$/.exec(after);
    if (!at) return null;
    const when = new Date(Number(at[1]));
    and.push({ OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: at[2] } }] });
  }
  const rows = await prisma.rmhCharacterPartyRoll.findMany({
    where: { partyId, AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PARTY_ROLL_PAGE + 1,
    select: ROLL_SELECT,
  });
  const page = rows.slice(0, PARTY_ROLL_PAGE);
  const last = page[page.length - 1];
  const seats = page.length > 0 ? await seatsOf(partyId) : new Map<string, Seat>();
  const mine = seats.get(userId) ?? (await ownSeat(partyId, userId));
  return {
    rolls: page.map((r) => viewOf(r, party.ownerId, seats, userId)),
    next: rows.length > PARTY_ROLL_PAGE && last ? cursorOf(last) : null,
    mine: { characterId: mine?.characterId ?? null },
  };
}

async function ownSeat(partyId: string, userId: string): Promise<{ characterId: string } | null> {
  return prisma.rmhCharacterPartyMember.findFirst({ where: { partyId, userId }, select: { characterId: true } });
}

/* -------------------------------------------------------------------------- */
/* Erasure and export                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Erasure operations for `anonymizeAccount`: the rolls the member made in any party, and every roll in a party they
 * run (the party is deleted with them, and its other members' rolls go with it).
 */
export function partyRollErasureOps(userId: string) {
  return [
    prisma.rmhCharacterPartyRoll.deleteMany({ where: { userId } }),
    prisma.rmhCharacterPartyRoll.deleteMany({ where: { party: { ownerId: userId } } }),
  ];
}

/** The member's own rolls for the account export: party name, what was rolled, dice, total and time. */
export async function exportPartyRolls(userId: string) {
  const rows = await prisma.rmhCharacterPartyRoll.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: 5000,
    select: {
      kind: true,
      label: true,
      notation: true,
      dice: true,
      modifier: true,
      total: true,
      mode: true,
      visibility: true,
      createdAt: true,
      party: { select: { name: true } },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    partyName: r.party.name,
    kind: r.kind,
    label: r.label,
    notation: r.notation,
    dice: r.dice,
    modifier: r.modifier,
    total: r.total,
    mode: r.mode,
    visibility: r.visibility,
    rolled: r.createdAt.toISOString(),
  }));
}
