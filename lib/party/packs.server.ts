import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  MAX_PACKS_PER_MEMBER,
  PACK_AUTOHIDE_REPORTS,
  PACK_CODE_ALPHABET,
  PACK_CODE_LEN,
  normalizePrompts,
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
    mine: r.ownerId === userId,
    author: u ? { name: u.name ?? null, handle: u.handle ?? null } : null,
  };
}

/** Featured shelf, newest community packs, and the caller's own (hidden ones included). */
export async function listPacks(userId: string | null, isAdmin: boolean) {
  const [featured, recent, mine] = await Promise.all([
    prisma.rmhboxPack.findMany({
      where: { featured: true, hidden: false },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select,
    }),
    prisma.rmhboxPack.findMany({
      where: { featured: false, hidden: false },
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
  const prompts = normalizePrompts(input.prompts);
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

/** One report per member; enough distinct reporters hide the pack until an admin looks. */
export async function reportPack(userId: string, id: string, reason: string) {
  const pack = await prisma.rmhboxPack.findUnique({ where: { id }, select: { ownerId: true } });
  if (!pack) return { ok: false as const, status: 404, error: 'Not found' };
  if (pack.ownerId === userId) return { ok: false as const, status: 400, error: 'Your own pack' };
  try {
    await prisma.rmhboxPackReport.create({ data: { packId: id, reporterId: userId, reason } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { ok: true as const, duplicate: true };
    throw e;
  }
  const updated = await prisma.rmhboxPack.update({
    where: { id },
    data: { reportCount: { increment: 1 } },
    select: { id: true, reportCount: true },
  });
  if (updated.reportCount >= PACK_AUTOHIDE_REPORTS) {
    await prisma.rmhboxPack.update({ where: { id }, data: { hidden: true, featured: false } });
  }
  return { ok: true as const, duplicate: false };
}

export async function adminSetPack(id: string, patch: { featured?: boolean; hidden?: boolean }) {
  const data = { ...patch, ...(patch.hidden ? { featured: false } : {}) };
  try {
    await prisma.rmhboxPack.update({ where: { id }, data });
    return true;
  } catch {
    return false;
  }
}
