import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { filePackReport } from '@/lib/party/pack-moderation.server';
import { parsePackLines } from '@/lib/party/pack-games';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  MAX_PACKS_PER_MEMBER,
  PACK_CODE_ALPHABET,
  PACK_CODE_LEN,
  type CreatePackInput,
  type PackView,
} from '@/lib/party/packs';

const newCode = () =>
  Array.from(
    { length: PACK_CODE_LEN },
    () => PACK_CODE_ALPHABET[randomInt(PACK_CODE_ALPHABET.length)],
  ).join('');

const select = {
  id: true,
  code: true,
  name: true,
  game: true,
  promptCount: true,
  featured: true,
  hidden: true,
  moderatedAt: true,
  ownerId: true,
  owner: { select: userDisplaySelect },
} as const;

type Row = {
  id: string;
  code: string;
  name: string;
  game: string;
  promptCount: number;
  featured: boolean;
  hidden: boolean;
  moderatedAt?: Date | null;
  ownerId: string;
  owner: Parameters<typeof resolveUser>[0];
};

function view(r: Row, userId: string | null, isAdmin: boolean): PackView {
  const u = resolveUser(r.owner);
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    game: r.game,
    promptCount: r.promptCount,
    featured: r.featured,
    ...(isAdmin || r.ownerId === userId ? { hidden: r.hidden } : {}),
    ...(r.moderatedAt && (isAdmin || r.ownerId === userId) ? { moderated: true } : {}),
    mine: r.ownerId === userId,
    author: u ? { name: u.name ?? null, handle: u.handle ?? null } : null,
  };
}

/**
 * Featured shelf, newest community packs, and the caller's own (hidden ones included, a removed one marked). A pack a
 * moderator removed is on no shelf but its owner's own.
 */
export async function listPacks(userId: string | null, isAdmin: boolean) {
  const [featured, recent, mine] = await Promise.all([
    prisma.rmhboxPack.findMany({
      where: { featured: true, hidden: false, moderatedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select,
    }),
    prisma.rmhboxPack.findMany({
      where: { featured: false, hidden: false, moderatedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select,
    }),
    userId
      ? prisma.rmhboxPack.findMany({
          where: { ownerId: userId },
          orderBy: { createdAt: 'desc' },
          take: MAX_PACKS_PER_MEMBER,
          select,
        })
      : Promise.resolve([] as Row[]),
  ]);
  const v = (rows: Row[]) => rows.map((r) => view(r, userId, isAdmin));
  return { featured: v(featured), recent: v(recent), mine: v(mine) };
}

export async function createPack(userId: string, input: CreatePackInput) {
  // The same rules the page's preview and the hub's loader apply; duplicates drop out and the minimum is the game's.
  const parsed = parsePackLines(input.game, input.prompts);
  const prompts = parsed.ok ? parsed.lines : null;
  if (!prompts) return { ok: false as const, status: 400, error: 'Not enough distinct prompts' };
  const owned = await prisma.rmhboxPack.count({ where: { ownerId: userId } });
  if (owned >= MAX_PACKS_PER_MEMBER) {
    return { ok: false as const, status: 409, error: `Limit of ${MAX_PACKS_PER_MEMBER} packs` };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.rmhboxPack.create({
        data: {
          code: newCode(),
          ownerId: userId,
          name: input.name,
          game: input.game,
          prompts,
          promptCount: prompts.length,
        },
        select,
      });
      return { ok: true as const, pack: view(row, userId, false) };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return { ok: false as const, status: 503, error: 'Could not allocate a code, try again' };
}

export async function deletePack(userId: string, id: string, isAdmin: boolean) {
  const r = await prisma.rmhboxPack.deleteMany({
    where: isAdmin ? { id } : { id, ownerId: userId },
  });
  return r.count === 1;
}

/**
 * The old report route (kept for old clients): files the same `ContentReport` the pack page's dialog does, with reason
 * `OTHER` and the text as its details, so there is one queue. Three distinct open reports hide the pack.
 */
export async function reportPack(userId: string, id: string, reason: string) {
  const r = await filePackReport({ reporterId: userId, packId: id, reason: 'OTHER', details: reason.trim() || null });
  if (!r.ok) {
    return r.reason === 'own-pack'
      ? { ok: false as const, status: 400, error: 'Your own pack' }
      : { ok: false as const, status: 404, error: 'Not found' };
  }
  return { ok: true as const, duplicate: r.duplicate };
}

/**
 * An admin's feature / hide. A pack a moderator removed cannot be unhidden or featured. An admin's own hide is a
 * decision, not a waiting state, so it clears `autoHiddenAt` and a dismissal of reports never restores it.
 */
export async function adminSetPack(id: string, patch: { featured?: boolean; hidden?: boolean }) {
  const data = {
    ...patch,
    ...(patch.hidden ? { featured: false } : {}),
    ...(patch.hidden !== undefined ? { autoHiddenAt: null } : {}),
  };
  const asks = patch.hidden === false || patch.featured === true;
  try {
    const done = await prisma.rmhboxPack.updateMany({
      // Unhiding or featuring is refused for a removed pack; hiding or unfeaturing one is harmless.
      where: asks ? { id, moderatedAt: null } : { id },
      data,
    });
    if (done.count === 1) return 'ok' as const;
    if (!asks) return 'not-found' as const;
    const row = await prisma.rmhboxPack.findUnique({ where: { id }, select: { moderatedAt: true } });
    return row ? ('removed' as const) : ('not-found' as const);
  } catch {
    return 'not-found' as const;
  }
}
