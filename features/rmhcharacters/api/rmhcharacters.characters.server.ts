import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { normalizeCharacter } from '@features/rmhcharacters/engine/factory';
import { MAX_CHARACTERS } from '@features/rmhcharacters/engine/characters-schema';
import { listCharactersApi } from '@features/rmhcharacters/engine/characters.contract';
import type { Character } from '@features/rmhcharacters/engine/types';

/**
 * GET /api/rmhcharacters/characters — the signed-in account's characters, newest edit first.
 *
 * Sheets are re-normalised on the way out as well as in, so a row written by an older
 * version of the app still reaches the client in the current shape.
 */
export const route = apiRoute('/api/rmhcharacters/characters', {
  GET: implement(listCharactersApi, { rateLimit: 'read', microCache: false }, async ({ userId }) => {
    const rows = await prisma.rmhCharacter.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: MAX_CHARACTERS,
      select: { id: true, data: true, updatedAt: true },
    });
    const characters: Character[] = [];
    for (const row of rows) {
      const c = normalizeCharacter(row.data);
      if (c) characters.push({ ...c, id: row.id, updatedAt: row.updatedAt.getTime() });
    }
    return { characters };
  }),
});
