/**
 * `/api/v1/me/characters*` and `/api/v1/me/parties*` (RMHCharacters, read only; scope `read:characters`).
 *
 * Nothing here computes a number: a character's summary is `partySummary` (the function that builds the summary the
 * site's party shows) run on the normalised sheet, and a party is `listParties` / `getParty` from the party module,
 * which re-check the membership row on every read. So a key reads exactly what its owner reads on the site:
 *
 * - characters: the owner's own only (the query filters by `userId`; another member's id is not found);
 * - one character's stored sheet comes back without `portrait` (large image data), with `portrait: boolean` saying
 *   whether there was one; the player's own `notes` stay, as they are the owner's own data;
 * - a party: members' names, each member's character as a summary, the turn order; never another player's sheet or
 *   `notes` (the party module returns neither) and never the invite code, which is a credential for joining.
 */
import { prisma } from '@/lib/prisma.server';
import { loadDnd5e, loadPf2e } from '@features/rmhcharacters/engine/data';
import { normalizeCharacter } from '@features/rmhcharacters/engine/factory';
import { partySummary, type PartySummary } from '@features/rmhcharacters/engine/party-summary';
import { getParty, listParties } from '@features/rmhcharacters/engine/party.server';
import type { Character, GameSystem } from '@features/rmhcharacters/engine/types';
import { decodeCharacterCursor, encodeCharacterCursor, type charactersQuery } from '@/lib/api/v1/characters-schema';
import type { z } from 'zod';

export interface ApiCharacter {
  id: string;
  system: GameSystem;
  name: string;
  level: number;
  summary: PartySummary;
  updatedAt: string;
}

export interface ApiCharacterDetail extends ApiCharacter {
  /** Whether the stored sheet has a portrait (the image itself is never returned). */
  portrait: boolean;
  /** The stored sheet, without `portrait`. */
  sheet: Record<string, unknown>;
}

export interface ApiParty {
  id: string;
  name: string;
  system: GameSystem;
  role: 'gm' | 'player';
  gm: string;
  members: number;
}

export interface ApiPartyDetail {
  id: string;
  name: string;
  system: GameSystem;
  role: 'gm' | 'player';
  gm: string;
  members: {
    userId: string;
    name: string;
    /** s15-18: true when the viewer is blocked with this player (either way); `name` then reads `'A player'`. */
    nameHidden: boolean;
    joinedAt: string;
    isGm: boolean;
    summary: PartySummary | null;
  }[];
  order: {
    id: string;
    kind: 'member' | 'extra';
    userId: string | null;
    name: string;
    /** s15-18: as on the members: the line's player is hidden from the viewer. */
    nameHidden: boolean;
    value: number;
  }[];
  turnIndex: number;
}

export { queryOf, readInput } from './request-input';

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** Headers for every response of these routes: a sheet is personal and must not sit in a shared cache. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

async function summarise(c: Character): Promise<PartySummary> {
  return c.system === 'dnd5e' ? partySummary(c, await loadDnd5e()) : partySummary(c, await loadPf2e());
}

const rowSelect = { id: true, userId: true, data: true, updatedAt: true } as const;

type Row = { id: string; data: unknown; updatedAt: Date };

async function shape(row: Row): Promise<{ c: Character; base: ApiCharacter } | null> {
  const c = normalizeCharacter(row.data);
  if (!c) return null;
  const summary = await summarise(c);
  return {
    c,
    base: {
      id: row.id,
      system: c.system,
      name: summary.name,
      level: summary.level,
      summary,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

/** The key owner's characters, newest edit first. A row whose sheet can no longer be read is left out of its page. */
export async function listCharactersForKey(
  userId: string,
  q: z.infer<typeof charactersQuery>,
): Promise<Page<ApiCharacter> | 'invalid_cursor'> {
  const cur = q.cursor ? decodeCharacterCursor(q.cursor) : null;
  if (q.cursor && !cur) return 'invalid_cursor';
  const rows = await prisma.rmhCharacter.findMany({
    where: {
      userId,
      ...(cur
        ? {
            OR: [{ updatedAt: { lt: new Date(cur.ms) } }, { updatedAt: new Date(cur.ms), id: { lt: cur.id } }],
          }
        : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: rowSelect,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  const data: ApiCharacter[] = [];
  for (const row of page) {
    const s = await shape(row);
    if (s) data.push(s.base);
  }
  return {
    data,
    nextCursor:
      rows.length > q.limit && last ? encodeCharacterCursor({ ms: last.updatedAt.getTime(), id: last.id }) : null,
  };
}

/** One of the key owner's characters with its sheet; `null` for anyone else's or one that does not exist. */
export async function getCharacterForKey(userId: string, id: string): Promise<ApiCharacterDetail | null> {
  const row = await prisma.rmhCharacter.findFirst({ where: { id, userId }, select: rowSelect });
  if (!row) return null;
  const s = await shape(row);
  if (!s) return null;
  const { portrait, ...sheet } = s.c;
  return { ...s.base, portrait: typeof portrait === 'string' && portrait.length > 0, sheet };
}

/** The parties the key owner runs or plays in (the same list the site shows). */
export async function listPartiesForKey(userId: string): Promise<{ data: ApiParty[] }> {
  const rows = await listParties(userId);
  return {
    data: rows.map((p) => ({
      id: p.id,
      name: p.name,
      system: p.system,
      role: p.role,
      gm: p.gm,
      members: p.players,
    })),
  };
}

/** One party as the site shows it to the key owner; `null` when they are not in it. */
export async function getPartyForKey(userId: string, id: string): Promise<ApiPartyDetail | null> {
  const p = await getParty(id, userId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    system: p.system,
    role: p.role,
    gm: p.gm,
    members: p.members.map((m) => ({
      userId: m.userId,
      name: m.hidden ? 'A player' : m.name,
      nameHidden: m.hidden === true,
      joinedAt: new Date(m.joinedAt).toISOString(),
      isGm: m.isGm,
      summary: m.summary,
    })),
    order: p.order.map((l) => ({
      id: l.id,
      kind: l.kind,
      userId: l.userId,
      name: l.hidden ? 'A player' : l.name,
      nameHidden: l.hidden === true,
      value: l.value,
    })),
    turnIndex: p.turnIndex,
  };
}
